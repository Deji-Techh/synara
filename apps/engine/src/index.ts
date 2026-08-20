// FILE: src/index.ts
// Purpose: Caide engine entry — a headless Node process speaking
// newline-delimited JSON-RPC 2.0 over stdio (codex app-server pattern).
// The dyad backend runs fully inside this process; the server's EngineAdapter
// supervises it. Renderer-bound Electron IPC is shimmed (electron-shim.ts):
//   - requests arrive as `dyad.invoke` { channel, payload } and dispatch onto
//     the dyad `ipcMain.handle` registry (envelope-wrapped by
//     createTypedHandler in ipc/handlers/base.ts)
//   - renderer-bound events (safeSend / webContents.send) flow through the
//     in-process event bus and are re-emitted as `dyad.event` notifications
// Upstream protocol methods (initialize/engine/ping/echo/shutdown) keep the
// pre-transplant wire format so the server's EngineClient stays source-compat
// until M3 replaces the adapter.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import log from "electron-log";

import {
  ENGINE_PROTOCOL_VERSION,
  JSON_RPC_INTERNAL_ERROR,
  JSON_RPC_INVALID_REQUEST,
  JSON_RPC_METHOD_NOT_FOUND,
  JSON_RPC_PARSE_ERROR,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from "./protocol.ts";
import { registerEngineIpcHandlers } from "./ipc/engine_ipc_host.ts";
import { createPreviewJsonRpcRouter } from "./ipc/preview_host.ts";
import { initializeDatabase, closeDatabase } from "./db/index.ts";
import { emit, onAll } from "./ipc/utils/event_bus.ts";
import { startGoalRuntime } from "./ipc/goal/goal_runtime_executor.ts";
import { writeSettings } from "./main/settings.ts";
import { app, ipcMain } from "./electron-shim.ts";

// The headless bundle is ESM (node dist/index.mjs); dyad handlers resolve
// bundled assets via __dirname. Shim it when the module system does not.
if (typeof __dirname === "undefined") {
  const entryDir = import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
  (globalThis as { __dirname?: string }).__dirname = entryDir;
}

log.errorHandler.startCatching();
// stdout is the JSON-RPC channel: keep electron-log off the console so no
// transport line can corrupt the wire format. File logging still applies.
log.transports.console.level = false;

const rl = createInterface({ input: process.stdin, terminal: false });

let initialized = false;
let shuttingDown = false;
let flutterAvailable: boolean | null = null;

// Raw JSON-RPC handlers for the preview/analyze/test/build vertical. Driven
// by the server's EngineAdapter (`preview/start|stop|reload|state|screenshot`,
// `analyze/run`, `test/run`, `build/start|state`).
const previewRouter = createPreviewJsonRpcRouter();

function detectFlutter(): boolean {
  if (flutterAvailable !== null) {
    return flutterAvailable;
  }
  if (process.env.FLUTTER_SDK_DIR || process.env.FLUTTER_ROOT) {
    flutterAvailable = true;
    return true;
  }
  try {
    const probe = spawnSync("flutter", ["--version"], {
      timeout: 10_000,
      stdio: "ignore",
      env: { ...process.env, CI: "false", TERM: "dumb" },
    });
    flutterAvailable = probe.status === 0;
  } catch {
    flutterAvailable = false;
  }
  if (!flutterAvailable) {
    log.warn("engine: flutter not detected on PATH (capabilities.flutter=false)");
  }
  return flutterAvailable;
}

function send(line: unknown): void {
  process.stdout.write(`${JSON.stringify(line)}\n`);
}

function makeResponse(request: JsonRpcRequest, result?: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id: request.id, ...(result === undefined ? {} : { result }) };
}

function makeError(
  request: JsonRpcRequest,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id: request.id,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  };
}

// ── Engine lifecycle ────────────────────────────────────────────────

function bootstrap(settings?: { selectedModel?: unknown; providerSettings?: unknown }): void {
  if (initialized) {
    return;
  }
  initialized = true;
  log.info(`engine: boot userData=${app.getPath("userData")}`);
  // Settings are created/migrated on first read (safeStorage shim is
  // reversible-obfuscation only; real secret handling is the server-side
  // secret store, forwarded here via the initialize handshake).
  if (settings) {
    try {
      const selectedModel = settings.selectedModel;
      const providerSettings = settings.providerSettings;
      const patch: Record<string, unknown> = {};
      if (typeof selectedModel === "object" && selectedModel !== null) {
        patch.selectedModel = selectedModel;
      }
      if (typeof providerSettings === "object" && providerSettings !== null) {
        patch.providerSettings = providerSettings;
      }
      writeSettings(patch as never);
      log.info("engine: server-forwarded settings applied");
    } catch (error) {
      log.warn("engine: failed to apply server-forwarded settings:", error);
    }
  }
  void import("./main/settings.ts").then(({ readSettings }) => {
    try {
      readSettings();
      log.info("engine: settings ready");
    } catch (error) {
      log.warn("engine: settings read failed:", error);
    }
  });
  initializeDatabase();
  registerEngineIpcHandlers();
  log.info("engine: handlers registered, db opened");
  try {
    startGoalRuntime();
    log.info("engine: goal runtime started");
  } catch (error) {
    log.warn("engine: goal runtime failed to start:", error);
  }
}

async function shutdown(): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  log.info("engine: shutting down");
  previewRouter.dispose();
  try {
    await app._fireQuitHandlers();
  } catch (error) {
    log.warn("engine: quit handlers error:", error);
  }
  closeDatabase();
  process.exit(0);
}

// ── dyad.invoke dispatch ────────────────────────────────────────────

function isEnvelope(value: unknown): value is { ok: boolean } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { ok?: unknown }).ok === "boolean"
  );
}

async function dispatchDyadInvoke(channel: string, payload: unknown): Promise<unknown> {
  const handler = ipcMain._handlers.get(channel);
  if (!handler) {
    throw new Error(`dyad.invoke: no IPC handler registered for channel "${channel}"`);
  }
  // The sender is a bus-routing shim: renderer-directed events (safeSend /
  // direct `event.sender.send`) land on the event bus and are re-emitted as
  // `dyad.event` notifications to the supervising server.
  const event = {
    sender: {
      id: 0,
      isDestroyed: () => false,
      send: (eventChannel: string, ...args: unknown[]) => {
        emit(eventChannel, args.length === 1 ? args[0] : args);
      },
    },
    processId: process.pid,
    frameId: 0,
  };
  const result = await handler(event, payload);
  return isEnvelope(result) ? result : { ok: true, data: result };
}

// ── JSON-RPC routing ────────────────────────────────────────────────

async function handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
  const { method, params } = request;
  switch (method) {
    case "initialize": {
      const settings = (params as { settings?: unknown } | undefined)?.settings as
        | { selectedModel?: unknown; providerSettings?: unknown }
        | undefined;
      bootstrap(settings);
      return makeResponse(request, {
        serverName: "caide-engine",
        serverVersion: "0.1.0",
        protocolVersion: ENGINE_PROTOCOL_VERSION,
        capabilities: { flutter: detectFlutter(), preview: true },
      });
    }
    case "engine/ping": {
      return makeResponse(request, {
        pong: "pong",
        time: new Date().toISOString(),
      });
    }
    case "engine/echo": {
      const message = (params as { message?: unknown } | undefined)?.message;
      return makeResponse(request, { message: String(message ?? "") });
    }
    case "engine/shutdown": {
      const response = makeResponse(request, { shutdown: true });
      // Flush the response before exiting: process.exit(0) does not wait for
      // pending async stdout writes, and a truncated reply would make the
      // supervisor believe the engine hung.
      process.stdout.write(`${JSON.stringify(response)}\n`, () => {
        void shutdown();
      });
      return null;
    }
    case "dyad/invoke": {
      const { channel, payload } = (params ?? {}) as { channel?: unknown; payload?: unknown };
      if (typeof channel !== "string") {
        return makeError(request, JSON_RPC_INVALID_REQUEST, "dyad.invoke requires params.channel");
      }
      try {
        const result = await dispatchDyadInvoke(channel, payload);
        return makeResponse(request, result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.warn(`engine: dyad.invoke("${channel}") failed: ${message}`);
        return makeError(request, JSON_RPC_INTERNAL_ERROR, message);
      }
    }
    default: {
      if (previewRouter.isPreviewMethod(method)) {
        try {
          const result = await previewRouter.handle(method, params);
          return makeResponse(request, result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          log.error(`engine: ${method} failed: ${message}`);
          return makeError(request, JSON_RPC_INTERNAL_ERROR, message);
        }
      }
      return makeError(
        request,
        JSON_RPC_METHOD_NOT_FOUND,
        `method not found: ${method} (implemented: initialize, engine/ping, engine/echo, engine/shutdown, dyad/invoke, preview/start, preview/stop, preview/reload, preview/state, preview/screenshot, preview/devices, analyze/run, test/run, build/start, build/state, flutter/toolchain/status, flutter/toolchain/install)`,
      );
    }
  }
}

// ── Event bridge: renderer-bound events → dyad.event notifications ──

onAll((channel, payload) => {
  if (shuttingDown) {
    return;
  }
  send({ jsonrpc: "2.0", method: "dyad/event", params: { channel, payload } });
});

// ── Main loop ───────────────────────────────────────────────────────

rl.on("line", (line) => {
  if (!line.trim()) {
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    send({
      jsonrpc: "2.0",
      id: null,
      error: { code: JSON_RPC_PARSE_ERROR, message: "invalid JSON" },
    });
    return;
  }
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    typeof (parsed as JsonRpcRequest).method !== "string"
  ) {
    send({
      jsonrpc: "2.0",
      id: null,
      error: { code: JSON_RPC_INVALID_REQUEST, message: "invalid request" },
    });
    return;
  }
  handleRequest(parsed as JsonRpcRequest).then(
    (response) => {
      if (response !== null) {
        send(response);
      }
    },
    (error: unknown) => {
      // A rejected request must never vanish: surface a JSON-RPC error instead
      // of an unhandled rejection that the supervisor can only see as silence
      // (and the caller as a timeout).
      const message = error instanceof Error ? error.message : String(error);
      log.error(`engine: request ${(parsed as JsonRpcRequest).method} failed: ${message}`);
      send({
        jsonrpc: "2.0",
        id: (parsed as JsonRpcRequest).id,
        error: { code: JSON_RPC_INTERNAL_ERROR, message },
      });
    },
  );
});

rl.on("close", () => {
  void shutdown();
});

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});

log.info("engine: ready, awaiting JSON-RPC over stdio");
