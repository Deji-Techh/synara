// FILE: limits.ts
// Purpose: Sandbox budgets and clamps.
// Donor: dyad x caide src/ipc/utils/sandbox/limits.ts (verbatim values).

export const SANDBOX_SCRIPT_SOURCE_LIMIT_BYTES = 128 * 1024;
export const SANDBOX_LLM_OUTPUT_LIMIT_BYTES = 256 * 1024;
export const SANDBOX_UI_OUTPUT_LIMIT_BYTES = 10 * 1024 * 1024;
export const SANDBOX_READ_FILE_LIMIT_BYTES = 20 * 1024 * 1024;

export const DEFAULT_SANDBOX_TIMEOUT_MS = 60_000;
export const MAX_SANDBOX_TIMEOUT_MS = 60_000;
export const SANDBOX_WALL_CLOCK_TIMEOUT_MS = 5 * 60_000;

export function clampSandboxTimeoutMs(timeoutMs: number | undefined): number {
  if (!Number.isFinite(timeoutMs)) {
    return DEFAULT_SANDBOX_TIMEOUT_MS;
  }
  return Math.min(
    Math.max(Math.floor(timeoutMs ?? DEFAULT_SANDBOX_TIMEOUT_MS), 1),
    MAX_SANDBOX_TIMEOUT_MS,
  );
}
