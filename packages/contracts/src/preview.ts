import { Schema } from "effect";

import { ThreadId, TrimmedNonEmptyString } from "./baseSchemas";

// ── WebSocket surface ────────────────────────────────────────────────

export const PREVIEW_WS_METHODS = {
  start: "preview.start",
  stop: "preview.stop",
  reload: "preview.reload",
  getState: "preview.getState",
} as const;

// ── Limits ───────────────────────────────────────────────────────────

const PREVIEW_PATH_MAX_LENGTH = 1_024;
const PREVIEW_LOG_MAX_LENGTH = 4_096;
const PREVIEW_MAX_LOGS = 500;

// ── Schemas ──────────────────────────────────────────────────────────

export const PreviewStartInput = Schema.Struct({
  threadId: ThreadId,
  /**
   * Optional app directory (the engine's flutter run cwd). Defaults to the
   * thread session's cwd (the workspace root) when omitted.
   */
  appDir: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(PREVIEW_PATH_MAX_LENGTH))),
  port: Schema.optional(Schema.Int.check(Schema.isGreaterThan(0))),
  hostname: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(256))),
});
export type PreviewStartInput = typeof PreviewStartInput.Type;

export const PreviewStartResult = Schema.Struct({
  /** The URL flutter actually serves, e.g. http://127.0.0.1:54321 */
  url: TrimmedNonEmptyString.check(Schema.isMaxLength(8_192)),
});
export type PreviewStartResult = typeof PreviewStartResult.Type;

export const PreviewStopInput = Schema.Struct({
  threadId: ThreadId,
});
export type PreviewStopInput = typeof PreviewStopInput.Type;

export const PreviewStopResult = Schema.Struct({
  /** false when no preview was running for this thread. */
  stopped: Schema.Boolean,
});
export type PreviewStopResult = typeof PreviewStopResult.Type;

export const PreviewReloadInput = Schema.Struct({
  threadId: ThreadId,
  /** true = hot reload (r), false = hot restart (R). */
  hotReload: Schema.Boolean,
});
export type PreviewReloadInput = typeof PreviewReloadInput.Type;

export const PreviewReloadResult = Schema.Struct({
  /** false when no preview is running for this thread (or flutter is gone). */
  reloaded: Schema.Boolean,
});
export type PreviewReloadResult = typeof PreviewReloadResult.Type;

export const PreviewGetStateInput = Schema.Struct({
  threadId: ThreadId,
});
export type PreviewGetStateInput = typeof PreviewGetStateInput.Type;

export const PreviewState = Schema.Struct({
  running: Schema.Boolean,
  url: Schema.String.check(Schema.isMaxLength(8_192)),
  /**
   * Lines of `flutter run` output, newest last, ring-buffered to
   * PREVIEW_MAX_LOGS. Polled by the pane (the engine has no push channel yet).
   */
  logs: Schema.Array(Schema.String.check(Schema.isMaxLength(PREVIEW_LOG_MAX_LENGTH))).check(
    Schema.isMaxLength(PREVIEW_MAX_LOGS),
  ),
});
export type PreviewState = typeof PreviewState.Type;
