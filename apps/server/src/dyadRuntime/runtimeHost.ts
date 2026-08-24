export type DyadRuntimeLogLevel = "debug" | "info" | "warn" | "error";

export interface DyadRuntimeNotification {
  readonly channel: string;
  readonly payload: unknown;
}

export interface DyadRuntimeHostPaths {
  /** Fresh dyad-owned database and runtime state directory. */
  readonly runtimeDataDir: string;
  /** Default parent directory for managed projects. */
  readonly appsDir: string;
}

/**
 * Small host seam replacing Electron's BrowserWindow/ipcMain dependencies.
 * Imported dyad runtime modules may depend on this interface, never directly
 * on Caide orchestration services or the retired child-engine protocol.
 */
export interface DyadRuntimeHost {
  readonly paths: DyadRuntimeHostPaths;
  readonly notify: (notification: DyadRuntimeNotification) => void;
  readonly readSettings: () => Promise<Readonly<Record<string, unknown>>>;
  readonly readSecret: (key: string) => Promise<string | null>;
  readonly log: (
    level: DyadRuntimeLogLevel,
    message: string,
    context?: Readonly<Record<string, unknown>>,
  ) => void;
  readonly now: () => Date;
  readonly randomId: () => string;
}
