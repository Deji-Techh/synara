// FILE: src/appCreate.spawn.test.ts
// Purpose: Proves the `app/create` JSON-RPC method end to end through a real
// spawned engine process: initialize -> app/create -> flutter create (fake
// shim on PATH) -> AI_RULES.md + project files on disk -> valid result schema.
// Layer: Engine integration test

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  AppCreateResultSchema,
  InitializeResultSchema,
  isJsonRpcResponse,
  type JsonRpcResponse,
} from "./protocol.ts";

const engineEntry = fileURLToPath(new URL("./index.ts", import.meta.url));

interface SpawnedEngine {
  readonly child: ChildProcessWithoutNullStreams;
  readonly sendRequest: (method: string, params?: unknown, id?: number) => Promise<JsonRpcResponse>;
}

function spawnEngine(env: NodeJS.ProcessEnv): SpawnedEngine {
  const child = spawn("bun", ["run", engineEntry], {
    env,
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

describe("engine app/create RPC", () => {
  let tempRoot: string;
  let workspaceDir: string;
  let shimDir: string;
  let env: NodeJS.ProcessEnv;

  beforeAll(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "caide-appcreate-"));
    workspaceDir = path.join(tempRoot, "workspace");
    fs.mkdirSync(workspaceDir, { recursive: true });
    shimDir = path.join(tempRoot, "shimbin");
    fs.mkdirSync(shimDir, { recursive: true });
    fs.writeFileSync(
      path.join(shimDir, "flutter"),
      [
        "#!/bin/bash",
        "for last; do true; done",
        'NAME_USED="$last"',
        'PROJECT="$PWD/$NAME_USED"',
        'mkdir -p "$PROJECT/lib" "$PROJECT/test"',
        'printf \'name: %s\\n\' "$NAME_USED" > "$PROJECT/pubspec.yaml"',
        "printf 'void main() {}\\n' > \"$PROJECT/lib/main.dart\"",
        "exit 0",
      ].join("\n"),
      { mode: 0o755 },
    );
    env = {
      ...process.env,
      PATH: `${shimDir}${path.delimiter}${process.env.PATH ?? ""}`,
    };
  });

  afterAll(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("creates a flutter app through a spawned engine process", async () => {
    const engine = spawnEngine(env);
    const child = engine.child;
    const cleanup = () => child.kill();
    try {
      await once(child, "spawn");

      const initialize = await engine.sendRequest("initialize", {
        clientName: "caide-server",
        protocolVersion: 1,
      });
      expect(initialize.error).toBeUndefined();
      const initResult = InitializeResultSchema.parse(initialize.result);
      // M2: the engine owns the flutter create scaffold tool.
      expect(initResult.capabilities.flutter).toBe(true);

      const response = await engine.sendRequest("app/create", {
        name: "hello_app",
        cwd: workspaceDir,
      });
      expect(response.error).toBeUndefined();
      const result = AppCreateResultSchema.parse(response.result);
      expect(result.appId).toBe("hello_app");
      expect(result.projectPath).toBe(path.join(workspaceDir, "hello_app"));

      expect(fs.existsSync(path.join(workspaceDir, "hello_app", "pubspec.yaml"))).toBe(true);
      expect(fs.existsSync(path.join(workspaceDir, "hello_app", "AI_RULES.md"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("returns a JSON-RPC error for invalid app/create params", async () => {
    const engine = spawnEngine(env);
    const child = engine.child;
    try {
      await once(child, "spawn");
      const response = await engine.sendRequest("app/create", {
        name: 42,
        cwd: 42,
      });
      expect(response.result).toBeUndefined();
      expect(response.error?.code).toBe(-32602);
    } finally {
      child.kill();
    }
  });

  it("surfaces flutter binary resolution failures as JSON-RPC errors", async () => {
    const badEnv: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: (process.env.PATH ?? "")
        .split(path.delimiter)
        .filter((dir) => dir !== shimDir && !fs.existsSync(path.join(dir, "flutter")))
        .join(path.delimiter),
    };
    delete badEnv.FLUTTER_SDK_BIN;
    delete badEnv.FLUTTER_SDK_DIR;
    delete badEnv.FLUTTER_ROOT;
    const engine = spawnEngine(badEnv);
    const child = engine.child;
    try {
      await once(child, "spawn");
      const response = await engine.sendRequest("app/create", {
        name: "hello_app",
        cwd: workspaceDir,
      });
      expect(response.result).toBeUndefined();
      expect(response.error?.code).toBe(-32603);
      expect(response.error?.message).toContain("flutter binary not found");
    } finally {
      child.kill();
    }
  });
});
