// FILE: src/webServerPreview.spawn.test.ts
// Purpose: M3b hello-world E2E through a real spawned engine process:
// initialize (preview capability) -> app/create (fake flutter shim) ->
// preview/start (fake shim serves over HTTP) -> fetch served URL ->
// preview/stop -> preview/stop (idempotent) -> engine/shutdown.
// Layer: Engine integration test

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  AppCreateResultSchema,
  InitializeResultSchema,
  isJsonRpcResponse,
  PreviewReloadResultSchema,
  PreviewStartResultSchema,
  PreviewStateResultSchema,
  PreviewStopResultSchema,
  type JsonRpcResponse,
} from "./protocol.ts";

type ZodResult<T> = { success: true; data: T } | { success: false; error: unknown };

function unwrap<T>(result: ZodResult<T>, label: string): T {
  if (!result.success) {
    throw new Error(`${label} unexpectedly failed`);
  }
  return result.data;
}

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

async function probePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

describe("engine web-server preview RPC", () => {
  let tempRoot: string;
  let workspaceDir: string;
  let shimDir: string;
  let env: NodeJS.ProcessEnv;

  beforeAll(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "caide-preview-"));
    workspaceDir = path.join(tempRoot, "workspace");
    fs.mkdirSync(workspaceDir, { recursive: true });
    shimDir = path.join(tempRoot, "shimbin");
    fs.mkdirSync(shimDir, { recursive: true });
    fs.writeFileSync(
      path.join(shimDir, "flutter"),
      [
        "#!/bin/sh",
        'if [ "$1" = "create" ]; then',
        '  NAME="${@: -1}"',
        '  PROJECT="$PWD/$NAME"',
        '  mkdir -p "$PROJECT/lib" "$PROJECT/test"',
        '  printf \'name: %s\\n\' "$NAME" > "$PROJECT/pubspec.yaml"',
        "  printf 'void main() {}\\\n' > \"$PROJECT/lib/main.dart\"",
        "  exit 0",
        "fi",
        // `flutter run ...`: defer to serve.mjs, which prints the real serving
        // lines only AFTER the HTTP server is listening (mirrors real flutter).
        'exec node "$(dirname "$0")/serve.mjs" "$@"',
      ].join("\n"),
      { mode: 0o755 },
    );
    fs.writeFileSync(
      path.join(shimDir, "serve.mjs"),
      [
        'import { createServer } from "node:http";',
        "const args = process.argv.slice(2);",
        "let port = 0;",
        'let host = "127.0.0.1";',
        "for (let i = 0; i < args.length; i++) {",
        '  if (args[i] === "--web-port") { port = Number(args[i + 1]); i++; }',
        '  if (args[i] === "--web-hostname") { host = args[i + 1]; i++; }',
        "}",
        "const server = createServer((req, res) => {",
        '  res.writeHead(200, { "content-type": "text/html" });',
        '  res.end("<h1 id=\\"hello\\">hello world from the fake flutter web server</h1>");',
        "});",
        "server.listen(port, host, () => {",
        '  console.log("Launching lib/main.dart on web-server in debug mode...");',
        '  console.log("lib/main.dart is being served at");',
        '  console.log("http://" + host + ":" + server.address().port + "/");',
        '  console.log("The web-server device requires the Dart Debug Extension...");',
        "});",
        'process.stdin.setEncoding("utf8");',
        'process.stdin.on("data", (chunk) => {',
        "  if (/^q\\r?\\n/.test(chunk)) {",
        "    server.close(() => process.exit(0));",
        "    return;",
        "  }",
        "  if (/^r\\r?\\n/.test(chunk)) {",
        '    console.log("Performing hot reload...");',
        '    console.log("Reloaded 1 of 1 libraries in 42ms.");',
        "  } else if (/^R\\r?\\n/.test(chunk)) {",
        '    console.log("Performing hot restart...");',
        "  }",
        "});",
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

  it("hello-world E2E: create app, start preview, fetch it, stop it", async () => {
    const engine = spawnEngine(env);
    const child = engine.child;
    try {
      await once(child, "spawn");

      const initialize = await engine.sendRequest("initialize", {
        clientName: "caide-server",
        protocolVersion: 1,
      });
      expect(initialize.error).toBeUndefined();
      const initResult = InitializeResultSchema.safeParse(initialize.result);
      expect(initResult.success).toBe(true);
      expect(unwrap(initResult, "initialize").capabilities.preview).toBe(true);

      const create = await engine.sendRequest("app/create", {
        name: "hello_app",
        cwd: workspaceDir,
      });
      expect(create.error).toBeUndefined();
      const createResult = AppCreateResultSchema.safeParse(create.result);
      expect(createResult.success).toBe(true);
      const appDir = unwrap(createResult, "app/create").projectPath;
      expect(fs.existsSync(path.join(appDir, "pubspec.yaml"))).toBe(true);

      const port = await probePort();
      const start = await engine.sendRequest("preview/start", {
        appDir,
        port,
        hostname: "127.0.0.1",
      });
      expect(start.error).toBeUndefined();
      const startResult = PreviewStartResultSchema.safeParse(start.result);
      expect(startResult.success).toBe(true);
      expect(unwrap(startResult, "preview/start").url).toBe(`http://127.0.0.1:${port}`);

      const response = await fetch(unwrap(startResult, "preview/start").url);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("hello world from the fake flutter web server");

      const state = await engine.sendRequest("preview/state", { appDir });
      expect(state.error).toBeUndefined();
      const stateResult = PreviewStateResultSchema.safeParse(state.result);
      expect(stateResult.success).toBe(true);
      expect(unwrap(stateResult, "preview/state").running).toBe(true);
      expect(unwrap(stateResult, "preview/state").url).toBe(`http://127.0.0.1:${port}`);
      expect(unwrap(stateResult, "preview/state").logs.join("\n")).toContain("is being served at");

      const reload = await engine.sendRequest("preview/reload", {
        appDir,
        hotReload: true,
      });
      expect(reload.error).toBeUndefined();
      const reloadResult = PreviewReloadResultSchema.safeParse(reload.result);
      expect(reloadResult.success).toBe(true);
      expect(unwrap(reloadResult, "preview/reload").reloaded).toBe(true);
      // The hot reload lands in the ring buffer (poll until it does).
      let reloadedInLogs = false;
      for (let i = 0; i < 25; i++) {
        const laterState = await engine.sendRequest("preview/state", { appDir });
        const laterResult = PreviewStateResultSchema.safeParse(laterState.result);
        if (
          laterResult.success &&
          laterResult.data.logs.some((line) => line.includes("Performing hot reload"))
        ) {
          reloadedInLogs = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(reloadedInLogs).toBe(true);

      const stop = await engine.sendRequest("preview/stop", { appDir });
      expect(stop.error).toBeUndefined();
      const stopResult = PreviewStopResultSchema.safeParse(stop.result);
      expect(stopResult.success).toBe(true);
      expect(unwrap(stopResult, "preview/stop").stopped).toBe(true);

      const stopAgain = await engine.sendRequest("preview/stop", { appDir });
      expect(stopAgain.error).toBeUndefined();
      const stopAgainResult = PreviewStopResultSchema.safeParse(stopAgain.result);
      expect(stopAgainResult.success).toBe(true);
      expect(unwrap(stopAgainResult, "preview/stop").stopped).toBe(false);
    } finally {
      child.kill();
    }
  });

  it("rejects preview/start when the app dir does not serve", async () => {
    const engine = spawnEngine(env);
    const child = engine.child;
    try {
      await once(child, "spawn");

      const port = await probePort();
      const start = await engine.sendRequest("preview/start", {
        appDir: path.join(os.tmpdir(), "does-not-exist-caide"),
        port,
      });
      expect(start.result).toBeUndefined();
      expect(start.error?.code).toBe(-32603);
      expect(start.error?.message).toContain("preview");
    } finally {
      child.kill();
    }
  });
});
