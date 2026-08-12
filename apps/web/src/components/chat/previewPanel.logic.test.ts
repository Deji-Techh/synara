// FILE: previewPanel.logic.test.ts
// Purpose: Unit tests for the preview pane state machine transitions.

import { describe, expect, it } from "vitest";

import {
  createInitialPreviewPanelState,
  mergeEnginePreviewState,
  previewDeviceChanged,
  previewReloadRequested,
  previewStartFailed,
  previewStartRequested,
  previewStarted,
} from "./previewPanel.logic";

describe("createInitialPreviewPanelState", () => {
  it("starts idle with no url, error, or logs", () => {
    const state = createInitialPreviewPanelState();
    expect(state).toEqual({
      status: "idle",
      url: null,
      error: null,
      logs: [],
      deviceId: "mobile",
      reloadToken: 0,
    });
  });

  it("honors a device preset override and persists it through transitions", () => {
    const state = createInitialPreviewPanelState("tablet");
    expect(previewStartRequested(state).deviceId).toBe("tablet");
  });
});

describe("previewStartRequested", () => {
  it("moves to starting, clears stale url/error/logs, and bumps the reload token", () => {
    const prior = previewStarted(createInitialPreviewPanelState(), "http://127.0.0.1:54321", [
      "Serving",
    ]);
    const state = previewStartRequested(prior);
    expect(state.status).toBe("starting");
    expect(state.url).toBeNull();
    expect(state.error).toBeNull();
    expect(state.logs).toEqual([]);
    expect(state.reloadToken).toBe(prior.reloadToken + 1);
  });
});

describe("previewStarted / previewStartFailed", () => {
  it("marks the pane running with the served url", () => {
    const state = previewStarted(
      previewStartRequested(createInitialPreviewPanelState()),
      "http://127.0.0.1:54321",
      ["Flutter run key commands", "Hot reload"],
    );
    expect(state.status).toBe("running");
    expect(state.url).toBe("http://127.0.0.1:54321");
    expect(state.logs).toEqual(["Flutter run key commands", "Hot reload"]);
  });

  it("marks the pane failed and appends the error to the logs", () => {
    const state = previewStartFailed(
      previewStartRequested(createInitialPreviewPanelState()),
      "flutter: command not found",
    );
    expect(state.status).toBe("failed");
    expect(state.error).toBe("flutter: command not found");
    expect(state.logs).toEqual(["flutter: command not found"]);
  });
});

describe("previewReloadRequested", () => {
  it("bumps the reload token only while running", () => {
    const running = previewStarted(createInitialPreviewPanelState(), "http://127.0.0.1:54321");
    const reloaded = previewReloadRequested(running);
    expect(reloaded.reloadToken).toBe(running.reloadToken + 1);
    expect(reloaded.status).toBe("running");
  });

  it("is a no-op when nothing runs", () => {
    const idle = createInitialPreviewPanelState();
    expect(previewReloadRequested(idle)).toBe(idle);
  });
});

describe("previewDeviceChanged", () => {
  it("updates the device preset and is identity-stable on the same choice", () => {
    const state = createInitialPreviewPanelState();
    const next = previewDeviceChanged(state, "desktop");
    expect(next.deviceId).toBe("desktop");
    expect(previewDeviceChanged(next, "desktop")).toBe(next);
  });
});

describe("mergeEnginePreviewState", () => {
  it("promotes a starting pane to running once the engine reports a url", () => {
    const starting = previewStartRequested(createInitialPreviewPanelState());
    const merged = mergeEnginePreviewState(starting, {
      running: true,
      url: "http://127.0.0.1:54321",
      logs: ["Launching lib/main.dart"],
    });
    expect(merged.status).toBe("running");
    expect(merged.url).toBe("http://127.0.0.1:54321");
    expect(merged.logs).toEqual(["Launching lib/main.dart"]);
  });

  it("falls back to idle when the engine reports stopped after running/starting", () => {
    const running = previewStarted(createInitialPreviewPanelState(), "http://127.0.0.1:54321", [
      "A previous crash line",
    ]);
    const merged = mergeEnginePreviewState(running, { running: false, url: "", logs: [] });
    expect(merged.status).toBe("idle");
    expect(merged.url).toBeNull();
    expect(merged.logs).toEqual(["A previous crash line"]);
  });

  it("keeps a failed start intact so the error message survives polls", () => {
    const failed = previewStartFailed(
      createInitialPreviewPanelState(),
      "flutter: command not found",
    );
    const merged = mergeEnginePreviewState(failed, { running: false, url: "", logs: [] });
    expect(merged).toBe(failed);
  });

  it("recovers an idle pane if a preview started elsewhere", () => {
    const idle = createInitialPreviewPanelState();
    const merged = mergeEnginePreviewState(idle, {
      running: true,
      url: "http://127.0.0.1:54321",
      logs: [],
    });
    expect(merged.status).toBe("running");
    expect(merged.url).toBe("http://127.0.0.1:54321");
  });

  it("does not wipe local logs when the engine snapshot is empty while running", () => {
    const running = previewStarted(createInitialPreviewPanelState(), "http://127.0.0.1:54321", [
      "Keep me",
    ]);
    const merged = mergeEnginePreviewState(running, {
      running: true,
      url: "http://127.0.0.1:54321",
      logs: [],
    });
    expect(merged.logs).toEqual(["Keep me"]);
  });
});
