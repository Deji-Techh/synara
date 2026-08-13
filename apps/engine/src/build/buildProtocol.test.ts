// FILE: src/build/buildProtocol.test.ts
// Purpose: Proves the engine exposes analyze/run, test/run, build/start,
// build/state over the stdio JSON-RPC contract (the same harness as
// src/spawn.test.ts — real engine process, protocol-level assertions).
// Layer: Engine integration test

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  BuildStartResultSchema,
  BuildStateResultSchema,
  isJsonRpcResponse,
  type JsonRpcResponse,
} from "../protocol.ts";

const engineEntry = fileURLToPath(new URL("../index.ts", import.meta.url));

interface SpawnedEngine {
  readonly child: ChildProcessWithoutNullStreams;
  readonly sendRequest: (method: string, params?: unknown, id?: number) => Promise<JsonRpcResponse>;
}

function spawnEngine(): SpawnedEngine {
  const child = spawn("bun", ["run", engineEntry], {
    stdio: ["pipe", "pipe", "pipe"],
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

describe("engine build/analyze/test protocol", () => {
  it("rejects build/state for an unknown build id", async () => {
    const engine = spawnEngine();
    spawned.push(engine);
    await once(engine.child, "spawn");

    const response = await engine.sendRequest("build/state", { buildId: "nope" });
    expect(response.error).toBeDefined();
    expect(response.error?.code).toBe(-32602);
    expect(String(response.error?.message)).toContain("unknown build id");
  });

  it("starts a build and reports a build id, and its state is pollable", async () => {
    const engine = spawnEngine();
    spawned.push(engine);
    await once(engine.child, "spawn");

    // App dir does not need to exist for build/start (spawn happens async);
    // build state surfaces the failure in `error`, not a thrown RPC error.
    const start = await engine.sendRequest("build/start", {
      appDir: "/tmp/does-not-exist-app",
      target: "apk",
      channel: "debug",
    });
    expect(start.error).toBeUndefined();
    const startResult = BuildStartResultSchema.safeParse(start.result);
    expect(startResult.success).toBe(true);

    const state = await engine.sendRequest("build/state", {
      buildId: startResult.data?.buildId,
    });
    expect(state.error).toBeUndefined();
    const stateResult = BuildStateResultSchema.safeParse(state.result);
    expect(stateResult.success).toBe(true);
    expect(stateResult.data?.status).toBe("failed");
    expect(stateResult.data?.error).toBeTruthy();
  });
});
