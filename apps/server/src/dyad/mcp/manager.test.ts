// FILE: manager.test.ts
// Purpose: C7 gate — JSON-RPC framing over a fake stdio server + loopback
// SSE server, manager sync/list/call/test/shutdown.

import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { McpConnection, McpManager } from "./manager.ts";
import { getMcpToolRegistry } from "./mcpTools.ts";

// Minimal fake MCP server over stdio: initialize + tools/list + tools/call.
const FAKE_SCRIPT = `
let buf = "";
process.stdin.on("data", (d) => {
  buf += d.toString();
  let idx;
  while ((idx = buf.indexOf("\\n")) !== -1) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    const respond = (result) =>
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }) + "\\n");
    if (msg.method === "initialize") respond({ protocolVersion: "x", capabilities: {}, serverInfo: { name: "fake", version: "0" } });
    else if (msg.method === "tools/list") respond({ tools: [{ name: "ping", description: "Ping pong", inputSchema: { type: "object", properties: { text: { type: "string" } } } }] });
    else if (msg.method === "tools/call") respond({ content: [{ type: "text", text: "pong:" + (msg.params.arguments.text ?? "") }] });
  }
});
`;

function writeFakeServer(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-mcp-"));
  const file = path.join(dir, "fake-mcp.mjs");
  fs.writeFileSync(file, FAKE_SCRIPT);
  return file;
}

function sseHandler(req: http.IncomingMessage, res: http.ServerResponse): void {
  let body = "";
  req.on("data", (d: Buffer) => (body += d.toString()));
  req.on("end", () => {
    const msg = JSON.parse(body) as { id: number; method: string; params: { arguments?: { text?: string } } };
    const result =
      msg.method === "initialize"
        ? { protocolVersion: "x", capabilities: {} }
        : msg.method === "tools/list"
          ? { tools: [{ name: "ping", description: "Ping pong", inputSchema: { type: "object", properties: {} } }] }
          : { content: [{ type: "text", text: `pong:${msg.params.arguments?.text ?? ""}` }] };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }));
  });
}

let sseServer: http.Server;
let sseUrl = "";
beforeAll(async () => {
  sseServer = http.createServer(sseHandler);
  await new Promise<void>((r) => sseServer.listen(0, "127.0.0.1", r));
  sseUrl = `http://127.0.0.1:${(sseServer.address() as AddressInfo).port}/mcp`;
});
afterAll(async () => {
  await new Promise((r) => sseServer.close(r));
});

describe("dyad mcp manager (c7)", () => {
  it("talks JSON-RPC over stdio: init, list, call", async () => {
    const conn = await McpConnection.stdio({ transport: "stdio", command: process.execPath, args: [writeFakeServer()] });
    try {
      const tools = await conn.listTools();
      expect(tools.map((t) => t.name)).toEqual(["ping"]);
      const out = (await conn.callTool("ping", { text: "hi" })) as { content: Array<{ text: string }> };
      expect(out.content[0].text).toBe("pong:hi");
      await expect(conn.test()).resolves.toMatchObject({ ok: true, toolCount: 1 });
    } finally {
      await conn.close();
    }
  });

  it("talks JSON-RPC over SSE", async () => {
    const conn = await McpConnection.sse({ transport: "sse", url: sseUrl });
    try {
      expect((await conn.listTools()).map((t) => t.name)).toEqual(["ping"]);
      const out = (await conn.callTool("ping", { text: "yo" })) as { content: Array<{ text: string }> };
      expect(out.content[0].text).toBe("pong:yo");
    } finally {
      await conn.close();
    }
  });

  it("fails structured on bad servers", async () => {
    await expect(
      McpConnection.stdio({ transport: "stdio", command: "/nonexistent-mcp-binary-xyz" }),
    ).rejects.toThrow(/MCP/);
    await expect(
      McpConnection.sse({ transport: "sse", url: "http://127.0.0.1:1/mcp" }),
    ).rejects.toThrow(/MCP/);
  });

  it("syncs lifecycle, feeds the registry, calls, tests, shuts down", async () => {
    const manager = new McpManager();
    const fake = writeFakeServer();
    const results = await manager.sync([
      { id: "s1", name: "fake", enabled: true, config: { transport: "stdio", command: process.execPath, args: [fake] } },
      { id: "s2", name: "off", enabled: false, config: { transport: "stdio", command: process.execPath, args: [fake] } },
    ]);
    try {
      expect(results.find((r) => r.id === "s1")?.ok).toBe(true);
      expect(manager.connectedIds()).toEqual(["s1"]);

      const count = await manager.syncRegistry();
      expect(count).toBe(1);
      expect(getMcpToolRegistry()?.listTools().map((t) => t.toolKey)).toEqual(["fake__ping"]);

      const out = (await manager.callTool("s1", "ping", { text: "z" })) as { content: Array<{ text: string }> };
      expect(out.content[0].text).toBe("pong:z");
      await expect(manager.callTool("nope", "ping", {})).rejects.toThrow(/not connected/);

      await expect(
        manager.testServer({ id: "t", name: "fake", enabled: true, config: { transport: "stdio", command: process.execPath, args: [fake] } }),
      ).resolves.toMatchObject({ ok: true });
      await expect(
        manager.testServer({ id: "t", name: "bad", enabled: true, config: { transport: "stdio", command: "/nonexistent-xyz" } }),
      ).resolves.toMatchObject({ ok: false });
    } finally {
      await manager.shutdown();
      expect(manager.connectedIds()).toEqual([]);
    }
  });
});
