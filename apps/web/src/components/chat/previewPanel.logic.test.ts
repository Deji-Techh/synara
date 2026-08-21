// FILE: previewPanel.logic.test.ts
// Purpose: Unit tests for the preview pane state machine transitions.

import { describe, expect, it } from "vitest";

import {
  analyzeFailed,
  analyzeFinished,
  analyzeRequested,
  buildAccepted,
  buildFailed,
  buildRequested,
  createInitialPreviewPanelState,
  mergeBuildState,
  mergeEnginePreviewState,
  previewDeviceChanged,
  previewReloadRequested,
  previewStartFailed,
  previewStartRequested,
  previewStarted,
  previewTabChanged,
  testFailed,
  testFinished,
  testRequested,
} from "./previewPanel.logic";

describe("createInitialPreviewPanelState", () => {
  it("starts idle with no url, error, or logs", () => {
    const state = createInitialPreviewPanelState();
    expect(state).toEqual({
      status: "idle",
      url: null,
      kind: null,
      error: null,
      logs: [],
      deviceId: "mobile",
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

  it("carries the engine render kind and falls back to the native: prefix", () => {
    const starting = previewStartRequested(createInitialPreviewPanelState());
    const explicit = mergeEnginePreviewState(starting, {
      running: true,
      url: "native:emulator-5554",
      logs: [],
      kind: "native",
    });
    expect(explicit.kind).toBe("native");

    const inferred = mergeEnginePreviewState(starting, {
      running: true,
      url: "native:simulator",
      logs: [],
    });
    expect(inferred.kind).toBe("native");

    const web = mergeEnginePreviewState(starting, {
      running: true,
      url: "http://127.0.0.1:54321",
      logs: [],
    });
    expect(web.kind).toBe("web");
  });

  it("clears the render kind when the preview stops", () => {
    const running = previewStarted(
      createInitialPreviewPanelState(),
      "http://127.0.0.1:54321",
      [],
      "web",
    );
    const merged = mergeEnginePreviewState(running, { running: false, url: "", logs: [] });
    expect(merged.kind).toBeNull();
  });
});

describe("previewTabChanged", () => {
  it("switches the active tab and is identity-stable when unchanged", () => {
    const state = createInitialPreviewPanelState();
    const next = previewTabChanged(state, "release");
    expect(next.activeTab).toBe("release");
    expect(previewTabChanged(next, "release")).toBe(next);
  });
});

describe("analyze transitions", () => {
  it("marks analyze running then stores the result", () => {
    const running = analyzeRequested(createInitialPreviewPanelState());
    expect(running.analyze.running).toBe(true);
    const done = analyzeFinished(running, {
      issues: [{ severity: "error", path: "lib/main.dart", message: "avoid print" }],
      clean: false,
      output: "1 issue found",
    });
    expect(done.analyze.running).toBe(false);
    expect(done.analyze.clean).toBe(false);
    expect(done.analyze.issues).toHaveLength(1);
    expect(done.analyze.error).toBeNull();
  });

  it("records an analyze failure", () => {
    const state = analyzeFailed(
      analyzeRequested(createInitialPreviewPanelState()),
      "flutter: not found",
    );
    expect(state.analyze.running).toBe(false);
    expect(state.analyze.error).toBe("flutter: not found");
  });
});

describe("test transitions", () => {
  it("marks test running then stores counts", () => {
    const running = testRequested(createInitialPreviewPanelState());
    expect(running.test.running).toBe(true);
    const done = testFinished(running, { passed: 3, failed: 1, skipped: 0, output: "3 passed" });
    expect(done.test.running).toBe(false);
    expect(done.test.passed).toBe(3);
    expect(done.test.failed).toBe(1);
    expect(done.test.output).toBe("3 passed");
  });

  it("records a test failure", () => {
    const state = testFailed(
      testRequested(createInitialPreviewPanelState()),
      "Could not run flutter test",
    );
    expect(state.test.running).toBe(false);
    expect(state.test.error).toBe("Could not run flutter test");
  });
});

describe("build transitions", () => {
  it("buildRequested resets build state with the requested target/channel", () => {
    const state = buildRequested(createInitialPreviewPanelState(), {
      target: "appbundle",
      channel: "debug",
    });
    expect(state.build.running).toBe(true);
    expect(state.build.status).toBe("running");
    expect(state.build.target).toBe("appbundle");
    expect(state.build.channel).toBe("debug");
    expect(state.build.buildId).toBeNull();
    expect(state.build.logs).toEqual([]);
  });

  it("buildAccepted records the engine-issued build id", () => {
    const state = buildAccepted(
      buildRequested(createInitialPreviewPanelState(), { target: "apk", channel: "release" }),
      "b_42",
    );
    expect(state.build.buildId).toBe("b_42");
  });

  it("mergeBuildState flips to running with logs while in progress", () => {
    const state = buildAccepted(
      buildRequested(createInitialPreviewPanelState(), { target: "apk", channel: "release" }),
      "b_42",
    );
    const merged = mergeBuildState(state, {
      buildId: "b_42",
      status: "running",
      logs: ["Building APK…"],
    });
    expect(merged.build.running).toBe(true);
    expect(merged.build.status).toBe("running");
    expect(merged.build.logs).toEqual(["Building APK…"]);
  });

  it("mergeBuildState stops polling on a terminal status and keeps artifact info", () => {
    const state = buildAccepted(
      buildRequested(createInitialPreviewPanelState(), { target: "apk", channel: "release" }),
      "b_42",
    );
    const done = mergeBuildState(state, {
      buildId: "b_42",
      status: "succeeded",
      exitCode: 0,
      outputPath: "build/app/outputs/flutter-apk/app-release.apk",
      logs: ["Built"],
    });
    expect(done.build.running).toBe(false);
    expect(done.build.status).toBe("succeeded");
    expect(done.build.outputPath).toBe("build/app/outputs/flutter-apk/app-release.apk");
    expect(done.build.exitCode).toBe(0);
  });

  it("buildFailed records the error and stops the poll", () => {
    const state = buildFailed(
      buildRequested(createInitialPreviewPanelState(), { target: "ipa", channel: "release" }),
      "Signing failed",
    );
    expect(state.build.running).toBe(false);
    expect(state.build.status).toBe("failed");
    expect(state.build.error).toBe("Signing failed");
  });
});
