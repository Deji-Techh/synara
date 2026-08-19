import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearTestRecordings,
  listRunRecordings,
  recordingKind,
  resolveRecordingPath,
} from "./test_recordings";

const tempDirs: string[] = [];

function makeApp(): string {
  const appPath = fs.mkdtempSync(path.join(os.tmpdir(), "caide-rec-"));
  tempDirs.push(appPath);
  fs.mkdirSync(path.join(appPath, "test-results"), { recursive: true });
  return appPath;
}

function writeRecording(
  appPath: string,
  relPath: string,
  mtimeMs: number,
): void {
  const abs = path.join(appPath, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, "");
  fs.utimesSync(abs, new Date(mtimeMs), new Date(mtimeMs));
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("recordingKind", () => {
  it("recognizes trace zips and webm videos, rejects everything else", () => {
    expect(recordingKind("test-results/signup.spec.ts-w1-trace.zip")).toBe(
      "trace",
    );
    expect(recordingKind("signup.spec.ts-1-signup-test.webm")).toBe("video");
    expect(recordingKind("test-results/signup.spec.ts-1.png")).toBeNull();
    expect(recordingKind("test-results/results.json")).toBeNull();
  });
});

describe("listRunRecordings", () => {
  it("returns empty when there is no test-results dir", () => {
    const appPath = fs.mkdtempSync(path.join(os.tmpdir(), "caide-rec-"));
    tempDirs.push(appPath);
    expect(listRunRecordings(appPath)).toEqual({ traceZips: [], videos: [] });
  });

  it("lists trace zips and videos as app-relative paths, newest first", () => {
    const appPath = makeApp();
    const now = Date.now();
    writeRecording(appPath, "test-results/a.spec.ts-w1-trace.zip", now - 2000);
    writeRecording(appPath, "test-results/b.spec.ts-w1-trace.zip", now);
    writeRecording(appPath, "test-results/a.spec.ts-1-old.webm", now - 1000);
    writeRecording(appPath, "test-results/a.spec.ts-2-new.webm", now);
    // Non-recordings must be ignored.
    writeRecording(appPath, "test-results/a.spec.ts-1.png", now);

    const recordings = listRunRecordings(appPath);
    expect(recordings.traceZips).toEqual([
      "test-results/b.spec.ts-w1-trace.zip",
      "test-results/a.spec.ts-w1-trace.zip",
    ]);
    expect(recordings.videos).toEqual([
      "test-results/a.spec.ts-2-new.webm",
      "test-results/a.spec.ts-1-old.webm",
    ]);
  });
});

describe("clearTestRecordings", () => {
  it("removes only recordings, keeping screenshots and the report", () => {
    const appPath = makeApp();
    writeRecording(appPath, "test-results/a.spec.ts-w1-trace.zip", 1);
    writeRecording(appPath, "test-results/a.spec.ts-1.webm", 1);
    writeRecording(appPath, "test-results/a.spec.ts-1.png", 1);
    writeRecording(appPath, "test-results/results.json", 1);

    clearTestRecordings(appPath);

    expect(fs.existsSync(path.join(appPath, "test-results"))).toBe(true);
    expect(listRunRecordings(appPath)).toEqual({ traceZips: [], videos: [] });
    expect(
      fs.existsSync(path.join(appPath, "test-results/a.spec.ts-1.png")),
    ).toBe(true);
    expect(fs.existsSync(path.join(appPath, "test-results/results.json"))).toBe(
      true,
    );
  });
});

describe("resolveRecordingPath", () => {
  it("resolves an app-relative recording to an absolute path inside it", () => {
    const appPath = makeApp();
    writeRecording(appPath, "test-results/a.spec.ts-w1-trace.zip", 1);
    const resolved = resolveRecordingPath(
      appPath,
      "test-results/a.spec.ts-w1-trace.zip",
    );
    expect(resolved).toBe(
      path.join(appPath, "test-results/a.spec.ts-w1-trace.zip"),
    );
  });

  it("rejects files that aren't recordings, escape the app, or sit outside test-results", () => {
    const appPath = makeApp();
    writeRecording(appPath, "test-results/a.spec.ts-1.png", 1);
    writeRecording(appPath, "test-results/a.spec.ts-1.webm", 1);

    expect(resolveRecordingPath(appPath, "test-results/a.spec.ts-1.png")).toBe(
      null,
    );
    expect(resolveRecordingPath(appPath, "test-results/a.spec.ts-1.webm")).toBe(
      path.join(appPath, "test-results/a.spec.ts-1.webm"),
    );
    // Path traversal out of the app.
    expect(
      resolveRecordingPath(appPath, "../escape.spec.ts-w1-trace.zip"),
    ).toBe(null);
    // Not under test-results/.
    expect(resolveRecordingPath(appPath, "src/x-trace.zip")).toBe(null);
  });
});
