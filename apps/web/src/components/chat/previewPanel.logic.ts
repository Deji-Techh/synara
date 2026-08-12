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

import type { PreviewDeviceId } from "~/rightDockStore.logic";

export type PreviewPanelStatus = "idle" | "starting" | "running" | "failed";

export const DEFAULT_PREVIEW_DEVICE_ID: PreviewDeviceId = "mobile";

export interface PreviewPanelState {
  readonly status: PreviewPanelStatus;
  /** URL the engine serves the app at, when running. */
  readonly url: string | null;
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
}

export function createInitialPreviewPanelState(
  deviceId: PreviewDeviceId = DEFAULT_PREVIEW_DEVICE_ID,
): PreviewPanelState {
  return {
    status: "idle",
    url: null,
    error: null,
    logs: [],
    deviceId,
    reloadToken: 0,
  };
}

export function previewStartRequested(state: PreviewPanelState): PreviewPanelState {
  return {
    ...state,
    status: "starting",
    url: null,
    error: null,
    logs: [],
    reloadToken: state.reloadToken + 1,
  };
}

export function previewStarted(
  state: PreviewPanelState,
  url: string,
  logs: readonly string[] = [],
): PreviewPanelState {
  return { ...state, status: "running", url, error: null, logs };
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
      return { ...state, status: "idle", url: null };
    }
    return state;
  }
  const logs = snapshot.logs.length > 0 ? snapshot.logs : state.logs;
  return { ...state, status: "running", url: snapshot.url, error: null, logs };
}
