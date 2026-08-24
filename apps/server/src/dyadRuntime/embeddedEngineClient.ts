import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { JsonRpcResponse } from "@caide/engine/protocol";

interface EmbeddedRuntime {
  invoke<T = unknown>(channel: string, ...payload: unknown[]): Promise<T>;
  subscribe(listener: (event: { channel: string; payload: unknown }) => void): () => void;
  ping(): Promise<{ pong: "pong"; time: string }>;
  request(method: string, params?: unknown): Promise<unknown>;
  shutdown(): Promise<void>;
}

interface EmbeddedModule {
  createEmbeddedEngine(options: {
    dataDir: string;
    appsDir?: string;
    settings?: { selectedModel?: unknown; providerSettings?: unknown };
  }): Promise<EmbeddedRuntime>;
}

function resolveEmbeddedEntry(): string {
  const candidates = [
    fileURLToPath(new URL("./dyad-engine/embedded.mjs", import.meta.url)),
    fileURLToPath(new URL("../../../engine/dist-single/embedded.mjs", import.meta.url)),
  ];
  const entry = candidates.find(existsSync);
  if (!entry) throw new Error(`embedded dyad bundle missing; checked ${candidates.join(", ")}`);
  return entry;
}

function resolveDrizzleDir(entry: string): string {
  const candidates = [
    path.join(path.dirname(entry), "drizzle"),
    fileURLToPath(new URL("../../../engine/drizzle", import.meta.url)),
  ];
  const drizzleDir = candidates.find((candidate) =>
    existsSync(path.join(candidate, "meta", "_journal.json")),
  );
  if (!drizzleDir) {
    throw new Error(`embedded dyad migrations missing; checked ${candidates.join(", ")}`);
  }
  return drizzleDir;
}

function response(result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id: 1, result };
}

export class EmbeddedEngineClient {
  private constructor(
    private readonly runtime: EmbeddedRuntime,
    private readonly unsubscribe: () => void,
  ) {}

  static async create(options: {
    dataDir: string;
    appsDir?: string;
    settings?: { selectedModel?: unknown; providerSettings?: unknown };
    onNotification?: (method: string, params: unknown) => void;
  }): Promise<EmbeddedEngineClient> {
    const entry = resolveEmbeddedEntry();
    process.env.CAIDE_USER_DATA_DIR = path.resolve(options.dataDir);
    process.env.CAIDE_ENGINE_DATA_DIR = path.resolve(options.dataDir);
    if (options.appsDir) process.env.CAIDE_DEV_APPS_DIR = path.resolve(options.appsDir);
    process.env.CAIDE_ENGINE_DRIZZLE_DIR = resolveDrizzleDir(entry);
    const module = (await import(pathToFileURL(entry).href)) as EmbeddedModule;
    const runtime = await module.createEmbeddedEngine(options);
    const unsubscribe = runtime.subscribe(({ channel, payload }) =>
      options.onNotification?.("dyad/event", { channel, payload }),
    );
    return new EmbeddedEngineClient(runtime, unsubscribe);
  }

  describeHealth() { return "embedded dyad runtime"; }
  async waitForSpawn() {}
  async initialize() { return response({ serverName: "caide-engine", serverVersion: "embedded", protocolVersion: 1, capabilities: { flutter: true, preview: true } }); }
  async ping() { return response(await this.runtime.ping()); }
  async dyadInvoke<T = unknown>(channel: string, payload?: unknown): Promise<T> {
    const envelope = await this.runtime.invoke<{ ok: boolean; value?: unknown; data?: unknown; error?: unknown }>(channel, payload);
    if (!envelope?.ok) throw new Error(typeof envelope?.error === "object" && envelope.error && "message" in envelope.error ? String((envelope.error as { message: unknown }).message) : String(envelope?.error ?? `engine channel ${channel} failed`));
    return (envelope.value !== undefined ? envelope.value : envelope.data) as T;
  }
  private async call(method: string, params?: unknown) { return response(await this.runtime.request(method, params)); }
  previewStart(params: unknown) { return this.call("preview/start", params); }
  previewStop(params: unknown) { return this.call("preview/stop", params); }
  previewReload(params: unknown) { return this.call("preview/reload", params); }
  previewState(params: unknown) { return this.call("preview/state", params); }
  previewScreenshot(params?: unknown) { return this.call("preview/screenshot", params ?? {}); }
  previewDevices() { return this.call("preview/devices", {}); }
  analyzeRun(params: unknown) { return this.call("analyze/run", params); }
  testRun(params: unknown) { return this.call("test/run", params); }
  buildStart(params: unknown) { return this.call("build/start", params); }
  buildState(params: unknown) { return this.call("build/state", params); }
  flutterToolchainStatus() { return this.call("flutter/toolchain/status", {}); }
  flutterToolchainInstall() { return this.call("flutter/toolchain/install", {}); }
  async shutdown() { this.unsubscribe(); await this.runtime.shutdown(); }
  kill() { this.unsubscribe(); void this.runtime.shutdown(); }
}
