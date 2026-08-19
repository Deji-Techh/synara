// FILE: src/spawn.test.ts
// Purpose: Proves the engine process speaks newline-delimited JSON-RPC over
// stdio — the exact integration contract apps/server's engine adapter relies on
// (same pattern as codex app-server).
// Layer: Engine integration test
// NOTE: the engine must run under Node (better-sqlite3 is not supported by
// Bun), so this spawns the built bundle `dist/index.mjs`. `bun run test` runs
// `bun run build` first (see package.json).

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import path from "node:path";

import { describe, expect, it, afterEach } from "vitest";

import {
  EchoResultSchema,
  InitializeResultSchema,
  isJsonRpcResponse,
  PingResultSchema,
  type JsonRpcResponse,
} from "./protocol.ts";

const engineEntry = path.resolve(process.cwd(), "dist", "index.mjs");

interface SpawnedEngine {
  readonly child: ChildProcessWithoutNullStreams;
  readonly sendRequest: (method: string, params?: unknown, id?: number) => Promise<JsonRpcResponse>;
}

let spawnedCount = 0;

function spawnEngine(): SpawnedEngine {
  const child = spawn(process.execPath, [engineEntry], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_ENV: "development",
      // Unique userData per engine so parallel forks never share the SQLite
      // database (better-sqlite3 locks the file during migrations).
      CAIDE_DEV_USER_DATA_DIR: `/tmp/caide-engine-test-${process.pid}-${spawnedCount++}`,
    },
  });

  let buffer = "";
  const pending = new Map<
    number,
    { resolve: (response: JsonRpcResponse) => void; reject: (error: Error) => void }
  >();
  let nextId = 1;

  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line === "") {
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
      const waiter = pending.get(parsed.id as number);
      if (waiter) {
        pending.delete(parsed.id as number);
        waiter.resolve(parsed);
      }
    }
  });

  child.stderr.on("data", () => {
    // Engine stderr is diagnostic-only; tests assert on stdout protocol.
  });

  return {
    child,
    sendRequest: (method, params, id = nextId++) => {
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      return new Promise<JsonRpcResponse>((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    },
  };
}

const spawned: SpawnedEngine[] = [];

afterEach(() => {
  for (const engine of spawned) {
    engine.child.kill();
  }
  spawned.length = 0;
});

describe("engine stdio JSON-RPC protocol", () => {
  it("responds to initialize with engine capabilities", async () => {
    const engine = spawnEngine();
    spawned.push(engine);
    await once(engine.child, "spawn");

    const response = await engine.sendRequest("initialize", {
      clientName: "caide-server",
      protocolVersion: 1,
    });

    expect(response.error).toBeUndefined();
    expect(response.id).toBe(1);
    const result = InitializeResultSchema.parse(response.result);
    expect(result.serverName).toBe("caide-engine");
    expect(result.protocolVersion).toBe(1);
  });

  it("answers engine/ping with pong", async () => {
    const engine = spawnEngine();
    spawned.push(engine);
    await once(engine.child, "spawn");

    const response = await engine.sendRequest("engine/ping");

    expect(response.error).toBeUndefined();
    const result = PingResultSchema.parse(response.result);
    expect(result.pong).toBe("pong");
  });

  it("echoes messages back (hello world round trip)", async () => {
    const engine = spawnEngine();
    spawned.push(engine);
    await once(engine.child, "spawn");

    const response = await engine.sendRequest("engine/echo", { message: "hello flutter" });

    expect(response.error).toBeUndefined();
    const result = EchoResultSchema.parse(response.result);
    expect(result.message).toBe("hello flutter");
  });

  it("returns a JSON-RPC error for unknown methods", async () => {
    const engine = spawnEngine();
    spawned.push(engine);
    await once(engine.child, "spawn");

    const response = await engine.sendRequest("no/such/method");

    expect(response.result).toBeUndefined();
    expect(response.error?.code).toBe(-32601);
  });

  it("survives shutdown request and exits cleanly", async () => {
    const engine = spawnEngine();
    spawned.push(engine);
    await once(engine.child, "spawn");

    const response = await engine.sendRequest("engine/shutdown");
    expect(response.error).toBeUndefined();

    const exitCode = await new Promise<number | null>((resolve) => {
      engine.child.on("exit", resolve);
    });
    expect(exitCode).toBe(0);
  });
});
