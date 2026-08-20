import fs from "node:fs";
import path from "node:path";
import { globSync } from "glob";

/**
 * Where Playwright writes per-run artifacts (traces, videos, screenshots),
 * relative to the app root.
 */
export const TEST_RESULTS_DIR = "test-results";

/**
 * Which recorded artifact a Playwright output filename is, or null when it's
 * neither a trace nor a video (e.g. a failure screenshot PNG). Traces land as
 * `*-trace.zip`, videos as `*.webm` — both under `test-results/`.
 */
export function recordingKind(filePath: string): "trace" | "video" | null {
  const base = path.basename(filePath);
  if (base.endsWith("-trace.zip")) return "trace";
  if (base.endsWith(".webm")) return "video";
  return null;
}

/** The recorded artifacts Playwright produced under an app's `test-results/`. */
export interface TestRecordings {
  /** Paths relative to the app root, newest first. */
  traceZips: string[];
  /** Paths relative to the app root, newest first. */
  videos: string[];
}

function listArtifacts(appPath: string): string[] {
  const resultsDir = path.join(appPath, TEST_RESULTS_DIR);
  if (!fs.existsSync(resultsDir)) return [];
  try {
    return globSync("**/*", { cwd: resultsDir, nodir: true, posix: true });
  } catch {
    return [];
  }
}

/** Newest-first sort by file mtime (recording artifacts, so mtime is fresh). */
function newestFirst(appPath: string, paths: string[]): string[] {
  return paths.sort((a, b) => {
    const ma = fs.statSync(path.join(appPath, TEST_RESULTS_DIR, a)).mtimeMs;
    const mb = fs.statSync(path.join(appPath, TEST_RESULTS_DIR, b)).mtimeMs;
    return mb - ma;
  });
}

/**
 * List the run's recordings. Paths are relative to the app root (with the
 * `test-results/` prefix) so the renderer can hand them straight back to
 * `openRecording`, which re-validates them against the app dir. Newest first:
 * a just-finished run's artifacts always surface at the top even when older
 * runs left traces/videos behind.
 */
export function listRunRecordings(appPath: string): TestRecordings {
  const traces: string[] = [];
  const videos: string[] = [];
  for (const rel of listArtifacts(appPath)) {
    const kind = recordingKind(rel);
    if (!kind) continue;
    try {
      if (!fs.statSync(path.join(appPath, TEST_RESULTS_DIR, rel)).isFile()) {
        continue;
      }
    } catch {
      continue;
    }
    if (kind === "trace") traces.push(rel);
    else videos.push(rel);
  }
  const withPrefix = (arr: string[]) => arr.map((f) => `${TEST_RESULTS_DIR}/${f}`);
  return {
    traceZips: withPrefix(newestFirst(appPath, traces)),
    videos: withPrefix(newestFirst(appPath, videos)),
  };
}

/**
 * Delete leftover traces/videos from previous runs. A watched run clears them
 * first so the recorded artifacts that surface in the Tests panel belong to
 * THIS run, not a mix of every run ever made. Only touches trace zips and
 * webm files; failure screenshots and results.json are left alone.
 */
export function clearTestRecordings(appPath: string): void {
  const resultsDir = path.join(appPath, TEST_RESULTS_DIR);
  if (!fs.existsSync(resultsDir)) return;
  for (const rel of listArtifacts(appPath)) {
    if (!recordingKind(rel)) continue;
    try {
      fs.rmSync(path.join(resultsDir, rel));
    } catch {
      // best-effort; a locked file shouldn't fail the run
    }
  }
}

/**
 * Resolve a recording path (relative, as returned by `listRunRecordings`) to an
 * absolute path inside the app, or null when it isn't one of our recordings.
 * Mirrors the `getTestScreenshot` containment checks: realpath-resolves both
 * sides (symlinks inside the app could otherwise escape it) and requires the
 * file to live under `test-results/`. Never throws.
 */
export function resolveRecordingPath(appPath: string, relPath: string): string | null {
  if (!recordingKind(relPath)) return null;
  const resolved = path.resolve(appPath, relPath);
  let realAppPath: string;
  let realPath: string;
  try {
    realAppPath = fs.realpathSync(appPath);
    realPath = fs.realpathSync(resolved);
  } catch {
    return null;
  }
  if (!fs.statSync(realPath, { throwIfNoEntry: false })?.isFile()) {
    return null;
  }
  const rel = path.relative(realAppPath, realPath);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    return null;
  }
  const [firstSegment] = rel.split(path.sep);
  if (firstSegment !== TEST_RESULTS_DIR) return null;
  return realPath;
}
