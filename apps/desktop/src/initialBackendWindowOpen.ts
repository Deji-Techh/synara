// FILE: initialBackendWindowOpen.ts
// Purpose: Coordinates first packaged-window reveal without waiting on backend readiness.
// Layer: Desktop startup utility
// Exports: openInitialBackendWindow

export type BackendWindowReadySource = "listening" | "http";

export interface InitialBackendWindowOpenOptions {
  readonly isDevelopment: boolean;
  readonly baseUrl: string;
  readonly hasExistingWindow: () => boolean;
  readonly createWindow: () => void;
  readonly getReadinessInFlight: () => Promise<void> | null;
  readonly setReadinessInFlight: (promise: Promise<void> | null) => void;
  readonly waitForBackendWindowReady: (baseUrl: string) => Promise<BackendWindowReadySource>;
  readonly writeLog: (message: string) => void;
  readonly isReadinessAborted: (error: unknown) => boolean;
  readonly formatErrorMessage: (error: unknown) => string;
  readonly warn: (message: string, error: unknown) => void;
}

export function openInitialBackendWindow(options: InitialBackendWindowOpenOptions): void {
  if (options.isDevelopment || options.baseUrl.length === 0) {
    return;
  }

  if (options.getReadinessInFlight() !== null) {
    return;
  }

  // Wait for the backend to actually answer before surfacing the window. The
  // renderer connects to the backend on load; opening the window during the
  // backend-bind window makes it hit a refused connection and churn through a
  // reconnect storm (interrupted boot RPCs, frozen UI). Waiting keeps that from
  // happening. On readiness failure the window still opens so an error can be
  // shown rather than leaving the app windowless.
  const revealWindow = () => {
    if (options.hasExistingWindow()) {
      return;
    }
    options.createWindow();
    options.writeLog("bootstrap main window created");
  };

  const nextOpen = options
    .waitForBackendWindowReady(options.baseUrl)
    .then((source) => {
      options.writeLog(`bootstrap backend ready source=${source}`);
      revealWindow();
    })
    .catch((error) => {
      if (options.isReadinessAborted(error)) {
        return;
      }
      options.writeLog(
        `bootstrap backend readiness warning message=${options.formatErrorMessage(error)}`,
      );
      options.warn("[desktop] backend readiness observation ended before startup completed", error);
      revealWindow();
    })
    .finally(() => {
      if (options.getReadinessInFlight() === nextOpen) {
        options.setReadinessInFlight(null);
      }
    });

  options.setReadinessInFlight(nextOpen);
}
