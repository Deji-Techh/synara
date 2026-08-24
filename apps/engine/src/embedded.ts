import path from "node:path";
import { app, ipcMain } from "./electron-shim.ts";
import * as db from "./db/index.ts";
import * as eventBus from "./ipc/utils/event_bus.ts";
import * as settingsModule from "./main/settings.ts";
import * as host from "./ipc/engine_ipc_host.ts";
import * as preview from "./ipc/preview_host.ts";
import { invalidateCaideAppsBaseDirectoryCache } from "./paths/paths.ts";

export interface EmbeddedEngineOptions {
  readonly dataDir: string;
  readonly appsDir?: string;
  readonly settings?: {
    readonly selectedModel?: unknown;
    readonly providerSettings?: unknown;
  };
}

export interface EmbeddedEngineNotification {
  readonly channel: string;
  readonly payload: unknown;
}

export interface EmbeddedEngine {
  readonly invoke: <T = unknown>(channel: string, ...payload: unknown[]) => Promise<T>;
  readonly subscribe: (listener: (notification: EmbeddedEngineNotification) => void) => () => void;
  readonly ping: () => Promise<{ pong: "pong"; time: string }>;
  readonly request: (method: string, params?: unknown) => Promise<unknown>;
  readonly shutdown: () => Promise<void>;
}

/**
 * Starts the dyad backend in the current process.
 *
 * This module deliberately imports the Electron shim and handler graph only
 * after the host paths have been installed. That keeps the runtime data
 * namespace isolated and makes the same backend usable by the server and by
 * the legacy stdio compatibility entrypoint.
 */
export async function createEmbeddedEngine(options: EmbeddedEngineOptions): Promise<EmbeddedEngine> {
  process.env.CAIDE_ENGINE_DATA_DIR = path.resolve(options.dataDir);
  process.env.CAIDE_USER_DATA_DIR = path.resolve(options.dataDir);
  if (options.appsDir) process.env.CAIDE_DEV_APPS_DIR = path.resolve(options.appsDir);
  invalidateCaideAppsBaseDirectoryCache();

  db.initializeDatabase();
  if (options.settings) {
    const patch: Record<string, unknown> = {};
    if (options.settings.selectedModel && typeof options.settings.selectedModel === "object") {
      patch.selectedModel = options.settings.selectedModel;
    }
    if (options.settings.providerSettings && typeof options.settings.providerSettings === "object") {
      patch.providerSettings = options.settings.providerSettings;
    }
    if (Object.keys(patch).length > 0) settingsModule.writeSettings(patch as never);
  }
  settingsModule.readSettings();
  host.registerEngineIpcHandlers();
  const previewRouter = preview.createPreviewJsonRpcRouter();

  let stopped = false;
  const listeners = new Set<(notification: EmbeddedEngineNotification) => void>();
  const unsubscribeBus = eventBus.onAll((channel, payload) => {
    if (stopped) return;
    const notification = { channel, payload };
    for (const listener of listeners) listener(notification);
  });

  const invoke = async <T>(channel: string, ...payload: unknown[]): Promise<T> => {
    if (stopped) throw new Error("embedded dyad runtime is stopped");
    const handler = ipcMain._handlers.get(channel);
    if (!handler) throw new Error(`dyad.invoke: no IPC handler registered for channel "${channel}"`);
    const event = {
      sender: { id: 0, isDestroyed: () => false, send: (eventChannel: string, ...args: unknown[]) =>
        eventBus.emit(eventChannel, args.length === 1 ? args[0] : args) },
      processId: process.pid,
      frameId: 0,
    };
    const result = await handler(event, ...payload);
    return (result && typeof result === "object" && "ok" in result) ? (result as T) : ({ ok: true, data: result } as T);
  };

  const ping = async () => ({ pong: "pong" as const, time: new Date().toISOString() });
  return {
    invoke,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    ping,
    async request(method, params) {
      if (method === "engine/ping") return ping();
      if (previewRouter.isPreviewMethod(method)) return previewRouter.handle(method, params);
      throw new Error(`embedded dyad runtime does not implement method "${method}"`);
    },
    async shutdown() {
      if (stopped) return;
      stopped = true;
      unsubscribeBus();
      previewRouter.dispose();
      await app._fireQuitHandlers();
      db.closeDatabase();
    },
  };
}
