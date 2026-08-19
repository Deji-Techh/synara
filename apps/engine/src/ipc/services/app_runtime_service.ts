// FILE: src/ipc/services/app_runtime_service.ts
// Purpose: Stub — web app dev-server runtime (vite/pnpm/web proxies) is
// stripped in the Flutter-only engine. Flutter run/build/preview supervision
// replaces these surfaces in Milestone 5; today every call degrades
// gracefully (cleanup still works, spawns throw a classified error).

import killPort from "kill-port";
import { CaideError, CaideErrorKind } from "@/errors/caide_error";

export async function cleanUpPort(port: number): Promise<void> {
  if (!Number.isFinite(port) || port <= 0) {
    return;
  }
  try {
    await killPort(port);
  } catch {
    // Port may already be free — cleanup is best-effort.
  }
}

export function emitProxyServerStarted(_options?: unknown): void {
  // no-op: web preview proxies are not part of the Flutter Builder engine.
}

export async function ensureProxyForRunningApp(
  _options?: unknown,
): Promise<string | null> {
  return null;
}

export async function executeApp(_options?: unknown): Promise<never> {
  throw new CaideError(
    "Web app dev-server runtime (executeApp) is not available in the Flutter Builder engine.",
    CaideErrorKind.Precondition,
  );
}

export function formatCloudSandboxError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function registerCloudSandboxSyncUpdateListener(_listener?: unknown): void {
  // no-op
}

export function startCloudSandboxLogStream(_options?: unknown): { dispose: () => void } {
  return { dispose: () => {} };
}