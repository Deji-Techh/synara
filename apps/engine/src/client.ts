// FILE: src/client.ts
// Purpose: Client-side of the engine stdio JSON-RPC transport. Spawns the
// engine process and routes requests/responses, mirroring how apps/server
// manages codex app-server (the adapter owns lifecycle; this owns I/O).
// Layer: Engine protocol client
// Depends on: ./protocol.ts

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline/promises";

import {
  isJsonRpcResponse,
  JSON_RPC_INTERNAL_ERROR,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from "./protocol.ts";

export class EngineSpawnError extends Error {}

export class EngineRequestError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly requestId: number | string | null,
  ) {
    super(message);
  }
}

export interface EngineClientOptions {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly requestTimeoutMs?: number;
  readonly onStderr?: (line: string) => void;
}

export class EngineClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<
    number,
    {
      resolve: (response: JsonRpcResponse) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  private nextId = 1;
  private closed = false;

  constructor(private readonly options: EngineClientOptions) {
    this.child = spawn(options.command, [...options.args], {
      cwd: options.cwd,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk: string) => {
      for (const line of chunk.split("\n")) {
        if (line.trim() !== "") {
          this.options.onStderr?.(line);
        }
      }
    });

    void this.pumpStdout();
  }

  private async pumpStdout(): Promise<void> {
    const lines = createInterface({
      input: this.child.stdout,
      crlfDelay: Infinity,
    });
    for await (const line of lines) {
      if (line.trim() === "") {
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      if (!isJsonRpcResponse(parsed)) {
        continue;
      }
      const id = typeof parsed.id === "number" ? parsed.id : null;
      if (id === null) {
        continue;
      }
      const waiter = this.pending.get(id);
      if (!waiter) {
        continue;
      }
      clearTimeout(waiter.timer);
      this.pending.delete(id);
      if (parsed.error) {
        waiter.reject(new EngineRequestError(parsed.error.code, parsed.error.message, parsed.id));
      } else {
        waiter.resolve(parsed);
      }
    }
    this.closePending(new EngineSpawnError("engine process stdout closed unexpectedly"));
  }

  private closePending(error: Error): void {
    for (const [, waiter] of this.pending) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.pending.clear();
  }

  async request(method: string, params?: unknown, id?: number): Promise<JsonRpcResponse> {
    if (this.closed) {
      throw new EngineSpawnError("engine client is closed");
    }
    const requestId = id ?? this.nextId++;
    const request: JsonRpcRequest = { jsonrpc: "2.0", id: requestId, method, params };
    const timeoutMs = this.options.requestTimeoutMs ?? 30_000;
    return new Promise<JsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(
          new EngineRequestError(JSON_RPC_INTERNAL_ERROR, "engine request timed out", requestId),
        );
      }, timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify(request)}\n`);
    });
  }

  async initialize(params: {
    clientName: string;
    protocolVersion: number;
  }): Promise<JsonRpcResponse> {
    return this.request("initialize", params);
  }

  async ping(): Promise<JsonRpcResponse> {
    return this.request("engine/ping");
  }

  async previewStart(params: {
    appDir: string;
    port?: number;
    hostname?: string;
  }): Promise<JsonRpcResponse> {
    return this.request("preview/start", params);
  }

  async previewStop(params: { appDir: string }): Promise<JsonRpcResponse> {
    return this.request("preview/stop", params);
  }

  async previewReload(params: { appDir: string; hotReload: boolean }): Promise<JsonRpcResponse> {
    return this.request("preview/reload", params);
  }

  async previewState(params: { appDir: string }): Promise<JsonRpcResponse> {
    return this.request("preview/state", params);
  }

  async analyzeRun(params: { appDir: string }): Promise<JsonRpcResponse> {
    return this.request("analyze/run", params);
  }

  async testRun(params: { appDir: string; testPath?: string }): Promise<JsonRpcResponse> {
    return this.request("test/run", params);
  }

  async buildStart(params: {
    appDir: string;
    target: "apk" | "appbundle" | "ipa";
    channel?: "debug" | "profile" | "release";
  }): Promise<JsonRpcResponse> {
    return this.request("build/start", params);
  }

  async buildState(params: { buildId: string }): Promise<JsonRpcResponse> {
    return this.request("build/state", params);
  }

  async waitForSpawn(): Promise<void> {
    await once(this.child, "spawn");
  }

  get pid(): number | undefined {
    return this.child.pid;
  }

  async shutdown(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    try {
      await this.request("engine/shutdown");
    } catch {
      // Fall through to kill: the process may already be exiting.
    }
    this.child.kill();
    await once(this.child, "exit").catch(() => undefined);
  }

  kill(): void {
    this.closed = true;
    this.closePending(new EngineSpawnError("engine client killed"));
    this.child.kill();
  }
}
