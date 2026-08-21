// FILE: previewPanel.logic.ts
// Purpose: Pure, testable state machine for the right-dock Flutter preview pane.
// Layer: Chat right-dock UI helpers
// Exports: pane state factory, start/stop/reload transitions, and engine-state merge.
//
// The engine owns the actual `flutter run` process (server-side, one preview per
// thread). This machine only tracks what the pane should *show*: whether a
// start was requested, whether the engine reported a running preview, where it
// is served from, and the latest `flutter run` log ring. The engine pushes no
// events, so the panel poll-merges `preview.getState` snapshots while visible.

import type {
  PreviewAnalyzeIssue,
  PreviewBuildChannel,
  PreviewBuildStateResult,
  PreviewBuildStatus,
  PreviewBuildTarget,
  PreviewTestResult,
} from "@caide/contracts";

import type { PreviewDeviceId } from "~/rightDockStore.logic";

export type PreviewPanelStatus = "idle" | "starting" | "running" | "failed";

/** Tabs in the preview pane; the console is folded into the preview tab. */
export type PreviewPaneTab = "preview" | "tests" | "problems" | "qualityGate" | "release";

export const DEFAULT_PREVIEW_DEVICE_ID: PreviewDeviceId = "mobile";

export interface PreviewAnalyzeState {
  /** True while `preview.analyze` is in flight. */
  readonly running: boolean;
  /** Newest analyze result; last-wins, replaced whole. */
  readonly issues: readonly PreviewAnalyzeIssue[];
  readonly clean: boolean | null;
  readonly output: string;
  readonly error: string | null;
}

export interface PreviewTestState {
  readonly running: boolean;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly output: string;
  readonly error: string | null;
}

export interface PreviewBuildState {
  /** True once a build has been requested and hasn't succeeded/failed yet. */
  readonly running: boolean;
  readonly buildId: string | null;
  readonly status: PreviewBuildStatus | null;
  readonly target: PreviewBuildTarget;
  readonly channel: PreviewBuildChannel;
  readonly exitCode: number | null;
  readonly outputPath: string | null;
  readonly sha256?: string | null;
  readonly error: string | null;
  readonly logs: readonly string[];
}

export interface PreviewPanelState {
  status: PreviewPanelStatus;
  /** URL the engine serves the app at, when running. */
  readonly url: string | null;
  /**
   * How the running preview renders: "web" in an iframe, "native" via device
   * screenshot polling inside the device frame. Null when not running.
   */
  readonly kind: "web" | "native" | null;
  /** Human-readable start failure (flutter missing, port in use, ...). */
  readonly error: string | null;
  /**
   * Newest-last `flutter run` output, mirroring the engine's ring buffer.
   * Replaced wholesale from poll snapshots (the engine is the source of truth).
   */
  readonly logs: readonly string[];
  readonly deviceId: PreviewDeviceId;
  /**
   * Bumped on each start/reload so the iframe remounts and re-navigates,
   * which is what actually applies hot reload vs hot restart server-side.
   */
  readonly reloadToken: number;
  /** Active pane tab. */
  readonly activeTab: PreviewPaneTab;
  readonly analyze: PreviewAnalyzeState;
  readonly test: PreviewTestState;
  readonly build: PreviewBuildState;
}

export function createInitialPreviewPanelState(
  deviceId: PreviewDeviceId = DEFAULT_PREVIEW_DEVICE_ID,
): PreviewPanelState {
  return {
    status: "idle",
    url: null,
    kind: null,
    error: null,
    logs: [],
    deviceId,
    reloadToken: 0,
    activeTab: "preview",
    analyze: { running: false, issues: [], clean: null, output: "", error: null },
    test: { running: false, passed: 0, failed: 0, skipped: 0, output: "", error: null },
    build: {
      running: false,
      buildId: null,
      status: null,
      target: "apk",
      channel: "release",
      exitCode: null,
      outputPath: null,
      error: null,
      logs: [],
    },
  };
}

export function previewStartRequested(state: PreviewPanelState): PreviewPanelState {
  return {
    ...state,
    status: "starting",
    url: null,
    kind: null,
    error: null,
    logs: [],
    reloadToken: state.reloadToken + 1,
  };
}

export function previewStarted(
  state: PreviewPanelState,
  url: string,
  logs: readonly string[] = [],
  kind: "web" | "native" | null = null,
): PreviewPanelState {
  return { ...state, status: "running", url, kind, error: null, logs };
}

export function previewStartFailed(state: PreviewPanelState, error: string): PreviewPanelState {
  return { ...state, status: "failed", error, logs: [...state.logs, error] };
}

/** Requires a running preview; bumps the remount token so the iframe reloads. */
export function previewReloadRequested(state: PreviewPanelState): PreviewPanelState {
  if (state.status !== "running" || state.url === null) {
    return state;
  }
  return { ...state, reloadToken: state.reloadToken + 1 };
}

export function previewDeviceChanged(
  state: PreviewPanelState,
  deviceId: PreviewDeviceId,
): PreviewPanelState {
  if (state.deviceId === deviceId) {
    return state;
  }
  return { ...state, deviceId };
}

export interface EnginePreviewSnapshot {
  readonly running: boolean;
  readonly url: string;
  readonly logs: readonly string[];
  readonly kind?: "web" | "native";
}

/**
 * Merge a `preview.getState` poll snapshot. The machine treats the engine as
 * the source of truth while staying conservative about things it should not
 * clobber:
 *
 * - engine running while the pane is idle/starting/failed -> running (covers
 *   both "start finished between polls" and "preview started elsewhere");
 * - engine stopped while the pane was running/starting -> idle (process died or
 *   was stopped), keeping the last logs so the user can read crash output;
 * - engine stopped while the pane is idle/failed -> untouched, so a failed
 *   start's error message survives until the user retries.
 *
 * Logs are always replaced from the snapshot (newest-last ring), except when
 * the engine has nothing and the pane would otherwise lose a failure message.
 */
export function mergeEnginePreviewState(
  state: PreviewPanelState,
  snapshot: EnginePreviewSnapshot,
): PreviewPanelState {
  if (!snapshot.running) {
    if (state.status === "running" || state.status === "starting") {
      return { ...state, status: "idle", url: null, kind: null };
    }
    return state;
  }
  const logs = snapshot.logs.length > 0 ? snapshot.logs : state.logs;
  // The engine reports the render kind explicitly; older engines (or a
  // mid-upgrade server) may omit it, so fall back to the pseudo-URL prefix.
  const kind = snapshot.kind ?? (snapshot.url.startsWith("native:") ? "native" : ("web" as const));
  return { ...state, status: "running", url: snapshot.url, kind, error: null, logs };
}

export function previewTabChanged(
  state: PreviewPanelState,
  tab: PreviewPaneTab,
): PreviewPanelState {
  if (state.activeTab === tab) {
    return state;
  }
  return { ...state, activeTab: tab };
}

// ── Quality gates: flutter analyze ──────────────────────────────────────────

export function analyzeRequested(state: PreviewPanelState): PreviewPanelState {
  return {
    ...state,
    analyze: { ...state.analyze, running: true, error: null },
  };
}

export function analyzeFinished(
  state: PreviewPanelState,
  result: { issues: readonly PreviewAnalyzeIssue[]; clean: boolean; output: string },
): PreviewPanelState {
  return {
    ...state,
    analyze: {
      running: false,
      issues: result.issues,
      clean: result.clean,
      output: result.output,
      error: null,
    },
  };
}

export function analyzeFailed(state: PreviewPanelState, error: string): PreviewPanelState {
  return {
    ...state,
    analyze: { ...state.analyze, running: false, error },
  };
}

// ── Quality gates: flutter test ─────────────────────────────────────────────

export function testRequested(state: PreviewPanelState): PreviewPanelState {
  return {
    ...state,
    test: { ...state.test, running: true, error: null },
  };
}

export function testFinished(
  state: PreviewPanelState,
  result: PreviewTestResult,
): PreviewPanelState {
  return {
    ...state,
    test: {
      running: false,
      passed: result.passed,
      failed: result.failed,
      skipped: result.skipped,
      output: result.output,
      error: null,
    },
  };
}

export function testFailed(state: PreviewPanelState, error: string): PreviewPanelState {
  return {
    ...state,
    test: { ...state.test, running: false, error },
  };
}

// ── Release builds ──────────────────────────────────────────────────────────

export interface BuildRequestOptions {
  readonly target: PreviewBuildTarget;
  readonly channel: PreviewBuildChannel;
}

export function buildRequested(
  state: PreviewPanelState,
  options: BuildRequestOptions,
): PreviewPanelState {
  return {
    ...state,
    build: {
      running: true,
      buildId: null,
      status: "running",
      target: options.target,
      channel: options.channel,
      exitCode: null,
      outputPath: null,
      error: null,
      logs: [],
    },
  };
}

export function buildAccepted(state: PreviewPanelState, buildId: string): PreviewPanelState {
  return { ...state, build: { ...state.build, buildId } };
}

/**
 * Merge a `preview.buildState` poll snapshot. Once the engine reports a
 * terminal status the poll stops naturally (the panel only polls while the
 * machine thinks the build is running).
 */
export function mergeBuildState(
  state: PreviewPanelState,
  snapshot: PreviewBuildStateResult,
): PreviewPanelState {
  const isTerminal = snapshot.status === "succeeded" || snapshot.status === "failed";
  const sha256 = (snapshot as unknown as { sha256?: string | null }).sha256 ?? null;
  return {
    ...state,
    build: {
      running: !isTerminal,
      buildId: snapshot.buildId,
      status: snapshot.status,
      target: state.build.target,
      channel: state.build.channel,
      exitCode: snapshot.exitCode ?? null,
      outputPath: snapshot.outputPath ?? null,
      sha256,
      error: snapshot.error ?? null,
      logs: snapshot.logs,
    },
  };
}

export function buildFailed(state: PreviewPanelState, error: string): PreviewPanelState {
  return {
    ...state,
    build: { ...state.build, running: false, status: "failed", error },
  };
}
