
//#region src/embedded.d.ts
interface EmbeddedEngineOptions {
  readonly dataDir: string;
  readonly appsDir?: string;
  readonly settings?: {
    readonly selectedModel?: unknown;
    readonly providerSettings?: unknown;
  };
}
interface EmbeddedEngineNotification {
  readonly channel: string;
  readonly payload: unknown;
}
interface EmbeddedEngine {
  readonly invoke: <T = unknown>(channel: string, ...payload: unknown[]) => Promise<T>;
  readonly subscribe: (listener: (notification: EmbeddedEngineNotification) => void) => () => void;
  readonly ping: () => Promise<{
    pong: "pong";
    time: string;
  }>;
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
declare function createEmbeddedEngine(options: EmbeddedEngineOptions): Promise<EmbeddedEngine>;
//#endregion
export { EmbeddedEngine, EmbeddedEngineNotification, EmbeddedEngineOptions, createEmbeddedEngine };