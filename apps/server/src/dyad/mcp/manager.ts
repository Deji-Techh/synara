// FILE: manager.ts
// Purpose: MCP server lifecycle + call transport. Dependency-free JSON-RPC
// 2.0 over stdio (child process) and Streamable HTTP/SSE (fetch): no MCP SDK
// needed for initialize/tools-list/tools-call. OAuth servers stay needs-work
// (donor mcp_oauth_flow parity is M4b). Feeds the discovery registry consumed
// by search_mcp_tools/get_mcp_tool_schema.

import { spawn, type ChildProcess } from "node:child_process";
import { buildMcpToolKey, sanitizeMcpName } from "./mcpKeys.ts";
import { setMcpToolRegistry, type JsonSchema, type McpToolDef } from "./mcpTools.ts";

export const MCP_RPC_TIMEOUT_MS = 30_000;
export const MCP_PROTOCOL_VERSION = "2024-11-05";

export interface McpStdioConfig {
  transport: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpSseConfig {
  transport: "sse";
  url: string;
  headers?: Record<string, string>;
}

export type McpTransportConfig = McpStdioConfig | McpSseConfig;

export interface ManagedMcpServer {
  id: string;
  name: string;
  enabled: boolean;
  defaultConsent?: "ask" | "always" | "never";
  config: McpTransportConfig;
}

export class McpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpError";
  }
}

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

function toJsIdentifier(name: string): string {
  let id = name.replace(/[^A-Za-z0-9_$]/g, "_");
  if (/^[0-9]/.test(id)) id = `_${id}`;
  return id;
}

/** Single JSON-RPC connection (stdio child or SSE endpoint). */
export class McpConnection {
  private child: ChildProcess | null = null;
  private sseUrl: string | null = null;
  private sseHeaders: Record<string, string> = {};
  private nextId = 1;
  private pending = new Map<number, PendingCall>();
  private buffer = "";
  private closed = false;

  static async stdio(config: McpStdioConfig): Promise<McpConnection> {
    const conn = new McpConnection();
    const child = spawn(config.command, config.args ?? [], {
      env: { ...process.env, ...(config.env ?? {}) },
      stdio: ["pipe", "pipe", "pipe"],
    });
    conn.child = child;
    child.stdout?.on("data", (d: Buffer) => conn.onStdout(d.toString()));
    child.stderr?.on("data", () => {});
    child.on("exit", () => conn.failAll(new McpError("MCP server process exited")));
    child.on("error", (err) => conn.failAll(new McpError(`MCP spawn failed: ${err.message}`)));
    await conn.initialize();
    return conn;
  }

  static async sse(config: McpSseConfig): Promise<McpConnection> {
    const conn = new McpConnection();
    conn.sseUrl = config.url.replace(/\/+$/, "");
    conn.sseHeaders = config.headers ?? {};
    await conn.initialize();
    return conn;
  }

  private onStdout(text: string): void {
    this.buffer += text;
    let idx: number;
    while ((idx = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      try {
        this.onMessage(JSON.parse(line) as { id?: number; result?: unknown; error?: { message?: string } });
      } catch {
        // non-JSON stdout from the server — ignore
      }
    }
  }

  private onMessage(msg: { id?: number; result?: unknown; error?: { message?: string } }): void {
    if (msg.id === undefined) return; // notification
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);
    clearTimeout(pending.timer);
    if (msg.error) pending.reject(new McpError(msg.error.message ?? "MCP error"));
    else pending.resolve(msg.result);
  }

  private failAll(err: Error): void {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    this.pending.clear();
  }

  private async request(method: string, params?: unknown): Promise<unknown> {
    if (this.closed) throw new McpError("MCP connection is closed");
    const id = this.nextId++;
    const body = JSON.stringify({ jsonrpc: "2.0", id, method, params: params ?? {} });
    if (this.child?.stdin) {
      const result = new Promise<unknown>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new McpError(`MCP request timed out after ${MCP_RPC_TIMEOUT_MS}ms: ${method}`));
        }, MCP_RPC_TIMEOUT_MS);
        this.pending.set(id, { resolve, reject, timer });
      });
      this.child.stdin.write(`${body}\n`, (err) => {
        if (err) {
          const pending = this.pending.get(id);
          if (pending) {
            this.pending.delete(id);
            clearTimeout(pending.timer);
            pending.reject(new McpError(`MCP stdin write failed: ${err.message}`));
          }
        }
      });
      return result;
    }
    if (this.sseUrl) return this.postSse(body, method);
    throw new McpError("MCP connection has no transport");
  }

  private async postSse(body: string, method: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MCP_RPC_TIMEOUT_MS);
    try {
      const res = await fetch(this.sseUrl!, {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...this.sseHeaders },
        body,
      });
      if (!res.ok) throw new McpError(`MCP HTTP ${res.status} on ${method}`);
      const contentType = res.headers.get("content-type") ?? "";
      const text = await res.text();
      if (/event-stream/i.test(contentType)) {
        for (const line of text.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          const msg = JSON.parse(payload) as { result?: unknown; error?: { message?: string } };
          if (msg.error) throw new McpError(msg.error.message ?? "MCP error");
          return msg.result;
        }
        throw new McpError("MCP SSE stream had no data message");
      }
      const msg = JSON.parse(text) as { result?: unknown; error?: { message?: string } };
      if (msg.error) throw new McpError(msg.error.message ?? "MCP error");
      return msg.result;
    } catch (err) {
      if (err instanceof McpError) throw err;
      throw new McpError(`MCP SSE request failed (${method}): ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private async initialize(): Promise<void> {
    await this.request("initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "caide", version: "1.0.0" },
    });
  }

  async listTools(): Promise<Array<{ name: string; description?: string; inputSchema: JsonSchema }>> {
    const result = (await this.request("tools/list")) as { tools?: Array<{ name: string; description?: string; inputSchema: JsonSchema }> };
    return result.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    return this.request("tools/call", { name, arguments: args });
  }

  async test(): Promise<{ ok: boolean; toolCount: number }> {
    const tools = await this.listTools();
    return { ok: true, toolCount: tools.length };
  }

  async close(): Promise<void> {
    this.closed = true;
    this.failAll(new McpError("MCP connection closed"));
    if (this.child) {
      this.child.kill("SIGTERM");
      this.child = null;
    }
    this.sseUrl = null;
  }
}

/** Lifecycle owner: syncs live connections to the enabled server set. */
export class McpManager {
  private connections = new Map<string, { server: ManagedMcpServer; conn: McpConnection }>();

  /** Start new/changed servers, stop removed/disabled ones. Returns status per server. */
  async sync(servers: ManagedMcpServer[]): Promise<Array<{ id: string; name: string; ok: boolean; message: string }>> {
    const wanted = new Map(servers.filter((s) => s.enabled).map((s) => [s.id, s]));
    const results: Array<{ id: string; name: string; ok: boolean; message: string }> = [];

    for (const [id, entry] of [...this.connections]) {
      if (!wanted.has(id)) {
        await entry.conn.close().catch(() => {});
        this.connections.delete(id);
      }
    }
    for (const server of wanted.values()) {
      const existing = this.connections.get(server.id);
      if (existing) {
        results.push({ id: server.id, name: server.name, ok: true, message: "already connected" });
        continue;
      }
      try {
        const conn =
          server.config.transport === "stdio"
            ? await McpConnection.stdio(server.config)
            : await McpConnection.sse(server.config);
        this.connections.set(server.id, { server, conn });
        const { toolCount } = await conn.test();
        results.push({ id: server.id, name: server.name, ok: true, message: `${toolCount} tool(s)` });
      } catch (err) {
        results.push({
          id: server.id,
          name: server.name,
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return results;
  }

  async listAllTools(): Promise<McpToolDef[]> {
    const defs: McpToolDef[] = [];
    for (const { server, conn } of this.connections.values()) {
      let tools: Array<{ name: string; description?: string; inputSchema: JsonSchema }>;
      try {
        tools = await conn.listTools();
      } catch {
        continue;
      }
      for (const tool of tools) {
        const safeServer = sanitizeMcpName(server.name);
        const safeTool = sanitizeMcpName(tool.name);
        defs.push({
          jsName: toJsIdentifier(`${safeServer}__${safeTool}`),
          toolKey: buildMcpToolKey(server.name, tool.name),
          serverId: server.id,
          serverName: server.name,
          toolName: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema ?? {},
        });
      }
    }
    return defs;
  }

  /** Push the live tool set into the discovery registry (turns pick it up). */
  async syncRegistry(): Promise<number> {
    const defs = await this.listAllTools();
    setMcpToolRegistry({ listTools: () => defs });
    return defs.length;
  }

  async callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const entry = this.connections.get(serverId);
    if (!entry) throw new McpError(`MCP server not connected: ${serverId}`);
    return entry.conn.callTool(toolName, args);
  }

  async testServer(server: ManagedMcpServer): Promise<{ ok: boolean; message: string }> {
    let conn: McpConnection | null = null;
    try {
      conn =
        server.config.transport === "stdio"
          ? await McpConnection.stdio(server.config)
          : await McpConnection.sse(server.config);
      const { toolCount } = await conn.test();
      return { ok: true, message: `Connected — ${toolCount} tool(s) available.` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    } finally {
      await conn?.close().catch(() => {});
    }
  }

  connectedIds(): string[] {
    return [...this.connections.keys()];
  }

  async shutdown(): Promise<void> {
    for (const [, entry] of [...this.connections]) {
      await entry.conn.close().catch(() => {});
    }
    this.connections.clear();
    setMcpToolRegistry(null);
  }
}

let shared: McpManager | null = null;
/** Process-wide manager (server bootstrap owns shutdown). */
export function sharedMcpManager(): McpManager {
  if (!shared) shared = new McpManager();
  return shared;
}
