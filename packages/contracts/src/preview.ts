import { Schema } from "effect";

import { ThreadId, TrimmedNonEmptyString } from "./baseSchemas";

// ── WebSocket surface ────────────────────────────────────────────────

export const PREVIEW_WS_METHODS = {
  start: "preview.start",
  stop: "preview.stop",
  reload: "preview.reload",
  getState: "preview.getState",
  analyze: "preview.analyze",
  test: "preview.test",
  buildStart: "preview.buildStart",
  buildState: "preview.buildState",
  screenshot: "preview.screenshot",
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

export const PreviewScreenshotInput = Schema.Struct({
  threadId: ThreadId,
});
export type PreviewScreenshotInput = typeof PreviewScreenshotInput.Type;

export const PreviewScreenshotResult = Schema.Struct({
  image: Schema.NullOr(Schema.String),
});
export type PreviewScreenshotResult = typeof PreviewScreenshotResult.Type;

// ── Quality gates (M5): analyze / test / build ─────────────────────────

const PATH_MAX_LENGTH = 8_192;
const OUTPUT_MAX_LENGTH = 200_000;
const MAX_OUTPUT_LINES = 1_000;

export const PreviewSeverity = Schema.Literals(["error", "warning", "info"] as const);
export type PreviewSeverity = typeof PreviewSeverity.Type;

export const PreviewAnalyzeIssue = Schema.Struct({
  severity: PreviewSeverity,
  /** e.g. `lib/main.dart` */
  path: Schema.String.check(Schema.isMaxLength(PREVIEW_PATH_MAX_LENGTH)),
  line: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
  column: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
  message: Schema.String.check(Schema.isMaxLength(PREVIEW_LOG_MAX_LENGTH)),
  code: Schema.optional(Schema.String.check(Schema.isMaxLength(128))),
});
export type PreviewAnalyzeIssue = typeof PreviewAnalyzeIssue.Type;

export const PreviewAnalyzeInput = Schema.Struct({
  threadId: ThreadId,
});
export type PreviewAnalyzeInput = typeof PreviewAnalyzeInput.Type;

export const PreviewAnalyzeResult = Schema.Struct({
  issues: Schema.Array(PreviewAnalyzeIssue),
  clean: Schema.Boolean,
  output: Schema.String.check(Schema.isMaxLength(OUTPUT_MAX_LENGTH)),
});
export type PreviewAnalyzeResult = typeof PreviewAnalyzeResult.Type;

export const PreviewTestInput = Schema.Struct({
  threadId: ThreadId,
  testPath: Schema.optional(
    TrimmedNonEmptyString.check(Schema.isMaxLength(PREVIEW_PATH_MAX_LENGTH)),
  ),
});
export type PreviewTestInput = typeof PreviewTestInput.Type;

export const PreviewTestResult = Schema.Struct({
  passed: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  failed: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  skipped: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  output: Schema.String.check(Schema.isMaxLength(OUTPUT_MAX_LENGTH)),
});
export type PreviewTestResult = typeof PreviewTestResult.Type;

export const PreviewBuildTarget = Schema.Literals(["apk", "appbundle", "ipa"] as const);
export type PreviewBuildTarget = typeof PreviewBuildTarget.Type;

export const PreviewBuildChannel = Schema.Literals(["debug", "profile", "release"] as const);
export type PreviewBuildChannel = typeof PreviewBuildChannel.Type;

export const PreviewBuildStartInput = Schema.Struct({
  threadId: ThreadId,
  target: PreviewBuildTarget,
  channel: Schema.optional(PreviewBuildChannel),
});
export type PreviewBuildStartInput = typeof PreviewBuildStartInput.Type;

export const PreviewBuildStartResult = Schema.Struct({
  buildId: Schema.String.check(Schema.isMaxLength(128)),
});
export type PreviewBuildStartResult = typeof PreviewBuildStartResult.Type;

export const PreviewBuildStatus = Schema.Literals(["running", "succeeded", "failed"] as const);
export type PreviewBuildStatus = typeof PreviewBuildStatus.Type;

export const PreviewBuildStateInput = Schema.Struct({
  threadId: ThreadId,
  buildId: Schema.String.check(Schema.isMaxLength(128)),
});
export type PreviewBuildStateInput = typeof PreviewBuildStateInput.Type;

export const PreviewBuildStateResult = Schema.Struct({
  buildId: Schema.String.check(Schema.isMaxLength(128)),
  status: PreviewBuildStatus,
  exitCode: Schema.optional(Schema.Int),
  outputPath: Schema.optional(Schema.String.check(Schema.isMaxLength(PREVIEW_PATH_MAX_LENGTH))),
  logs: Schema.Array(Schema.String.check(Schema.isMaxLength(PREVIEW_LOG_MAX_LENGTH))).check(
    Schema.isMaxLength(MAX_OUTPUT_LINES),
  ),
  error: Schema.optional(Schema.String.check(Schema.isMaxLength(16_384))),
});
export type PreviewBuildStateResult = typeof PreviewBuildStateResult.Type;
