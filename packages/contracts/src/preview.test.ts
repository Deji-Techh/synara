import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
  PreviewAnalyzeResult,
  PreviewBuildStateResult,
  PreviewBuildStartInput,
  PreviewGetStateInput,
  PreviewReloadInput,
  PreviewStartInput,
  PreviewState,
  PreviewTestResult,
} from "./preview";

function decodeSync<S extends Schema.Top>(schema: S, input: unknown): Schema.Schema.Type<S> {
  return Schema.decodeUnknownSync(schema as never)(input) as Schema.Schema.Type<S>;
}

function decodes<S extends Schema.Top>(schema: S, input: unknown): boolean {
  try {
    Schema.decodeUnknownSync(schema as never)(input);
    return true;
  } catch {
    return false;
  }
}

const THREAD_ID = "thread-123";

describe("preview WS schemas", () => {
  it("decodes a minimal start input (appDir optional)", () => {
    expect(decodes(PreviewStartInput, { threadId: THREAD_ID })).toBe(true);
    const withAppDir = decodeSync(PreviewStartInput, {
      threadId: THREAD_ID,
      appDir: "/tmp/workspace/hello_app",
      port: 54321,
    });
    expect(withAppDir.appDir).toBe("/tmp/workspace/hello_app");
    expect(withAppDir.port).toBe(54321);
  });

  it("rejects a start input without a threadId", () => {
    expect(decodes(PreviewStartInput, { appDir: "/tmp/workspace" })).toBe(false);
  });

  it("decodes reload with the hotReload flag", () => {
    expect(decodes(PreviewReloadInput, { threadId: THREAD_ID, hotReload: true })).toBe(true);
    expect(decodes(PreviewReloadInput, { threadId: THREAD_ID, hotReload: false })).toBe(true);
    expect(decodes(PreviewReloadInput, { threadId: THREAD_ID })).toBe(false);
  });

  it("decodes a preview state snapshot with running flag, url, and logs", () => {
    const decoded = decodeSync(PreviewState, {
      running: true,
      url: "http://127.0.0.1:54321",
      logs: ["Launching lib/main.dart...", "lib/main.dart is being served at"],
    });
    expect(decoded.running).toBe(true);
    expect(decoded.logs).toHaveLength(2);
  });

  it("rejects a state snapshot with a URL over the cap", () => {
    expect(
      decodes(PreviewState, { running: true, url: `http://x/${"a".repeat(9_000)}`, logs: [] }),
    ).toBe(false);
  });

  it("decodes getState input", () => {
    const decoded = decodeSync(PreviewGetStateInput, { threadId: THREAD_ID });
    expect(decoded.threadId).toBe(THREAD_ID);
  });

  it("decodes build start input with optional channel", () => {
    const decoded = decodeSync(PreviewBuildStartInput, {
      threadId: THREAD_ID,
      target: "apk",
    });
    expect(decoded.target).toBe("apk");
    expect(decodes(PreviewBuildStartInput, { threadId: THREAD_ID })).toBe(false);
    expect(decodes(PreviewBuildStartInput, { threadId: THREAD_ID, target: "ios" })).toBe(false);
  });

  it("decodes analyze result issues", () => {
    const decoded = decodeSync(PreviewAnalyzeResult, {
      issues: [
        {
          severity: "error",
          path: "lib/main.dart",
          line: 5,
          column: 18,
          message: "The argument type 'String' can't be assigned",
          code: "argument_type_not_assignable",
        },
      ],
      clean: false,
      output: "Analyzing lib...",
    });
    expect(decoded.issues[0]?.severity).toBe("error");
  });

  it("decodes test result counts", () => {
    const decoded = decodeSync(PreviewTestResult, {
      passed: 3,
      failed: 1,
      skipped: 0,
      output: "00:01 +3 -1: Some tests failed.",
    });
    expect(decoded.failed).toBe(1);
  });

  it("decodes build state with optional exit code and output path", () => {
    const elapsed = decodeSync(PreviewBuildStateResult, {
      buildId: "abc",
      status: "succeeded",
      exitCode: 0,
      outputPath: "build/app/outputs/flutter-apk/app-release.apk",
      logs: ["✓ Built ..."],
    });
    expect(elapsed.outputPath).toBe("build/app/outputs/flutter-apk/app-release.apk");
    expect(decodes(PreviewBuildStateResult, { buildId: "abc", status: "running", logs: [] })).toBe(
      true,
    );
  });
});
