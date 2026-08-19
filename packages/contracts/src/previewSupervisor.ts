import { Schema } from "effect";

import { ThreadId } from "./baseSchemas";
import {
  PreviewBuildChannel,
  PreviewBuildStatus,
  PreviewBuildTarget,
} from "./preview";

// ── WebSocket surface ────────────────────────────────────────────────
// Supervisor snapshot (M5): a server-side read-only mirror of the engine's
// build/analyze/test state for a thread's app. Separate from the `preview.*`
// method family (live `flutter run` state) so the pane can layer the two
// without the supervisor re-driving the live preview.

export const PREVIEW_SUPERVISOR_WS_METHODS = {
  getState: "preview.supervisorState",
} as const;

// ── Input ────────────────────────────────────────────────────────────

export const PreviewSupervisorGetStateInput = Schema.Struct({
  threadId: ThreadId,
});
export type PreviewSupervisorGetStateInput = typeof PreviewSupervisorGetStateInput.Type;

// ── Result shapes ────────────────────────────────────────────────────

export const PreviewSupervisorAnalyzeSnapshot = Schema.Struct({
  clean: Schema.Boolean,
  issueCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  /** ISO timestamp of the analyzer run. */
  ranAt: Schema.String,
});
export type PreviewSupervisorAnalyzeSnapshot = typeof PreviewSupervisorAnalyzeSnapshot.Type;

export const PreviewSupervisorTestSnapshot = Schema.Struct({
  passed: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  failed: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  skipped: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  /** ISO timestamp of the test run. */
  ranAt: Schema.String,
});
export type PreviewSupervisorTestSnapshot = typeof PreviewSupervisorTestSnapshot.Type;

export const PreviewSupervisorBuildSnapshot = Schema.Struct({
  status: PreviewBuildStatus,
  buildId: Schema.optional(Schema.String),
  target: Schema.optional(PreviewBuildTarget),
  channel: Schema.optional(PreviewBuildChannel),
  exitCode: Schema.optional(Schema.Int),
  /** Location of the produced artifact when the build finished successfully. */
  outputPath: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
  /** ISO timestamp of when the build run started. */
  startedAt: Schema.optional(Schema.String),
  /** ISO timestamp of the last build-status observation. */
  updatedAt: Schema.optional(Schema.String),
});
export type PreviewSupervisorBuildSnapshot = typeof PreviewSupervisorBuildSnapshot.Type;

export const PreviewSupervisorSnapshot = Schema.Struct({
  threadId: ThreadId,
  /** App display name (workspace root basename), best-effort. */
  appName: Schema.String,
  /** True when the last observed release build succeeded. */
  built: Schema.Boolean,
  /** True when the engine is serving a live preview the pane can render. */
  previewReady: Schema.Boolean,
  /** True when the engine reports a running `flutter run` for this thread. */
  running: Schema.Boolean,
  /** URL the engine serves the preview on, when running (empty otherwise). */
  url: Schema.String,
  lastAnalyze: Schema.optional(PreviewSupervisorAnalyzeSnapshot),
  lastTest: Schema.optional(PreviewSupervisorTestSnapshot),
  lastBuild: Schema.optional(PreviewSupervisorBuildSnapshot),
});
export type PreviewSupervisorSnapshot = typeof PreviewSupervisorSnapshot.Type;
