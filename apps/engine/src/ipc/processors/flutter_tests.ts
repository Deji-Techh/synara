/**
 * Flutter widget/integration test support for the Tests panel.
 *
 * The Playwright-based Tests pipeline targets web E2E (spec files under the
 * app's `tests/` folder, run against a running dev server). Flutter apps
 * instead keep their widget tests in `test/` (and `integration_test/`) as
 * Dart files and run them through the Flutter SDK. This module reuses the same
 * spec/result shapes the panel already understands (`TestSpec`, `TestResult`,
 * `TestCase`) so the Tests UI works unchanged: listing surfaces Dart test
 * files with parsed `testWidgets(...)`/`test(...)` cases, and a run executes
 * `flutter test` with the machine reporter and translates the output back into
 * the panel's result shape.
 */

import fs from "node:fs";
import path from "node:path";
import { getFlutterExecutable, isFlutterApp } from "@/ipc/utils/flutter_utils";
import { spawnStreaming } from "@/ipc/utils/spawn_streaming";
import type {
  TestCase,
  TestCaseResult,
  TestResult,
  RunAppTestsResult,
} from "@/ipc/types/tests";

// ============================================================================
// Flutter spec identity
// ============================================================================

/** Glob matching every Dart widget test under an app's `test/` + `integration_test/`. */
export const FLUTTER_TEST_GLOB = "{test,integration_test}/**/*_test.dart";

/**
 * A Dart test file must look like the paths `listAppTests` produces for a
 * Flutter app: relative, under `test/` or `integration_test/`, ending in
 * `_test.dart`, with no traversal or leading dash. Mirrors the guard used for
 * Playwright specs so a compromised renderer can't sneak flag-like values into
 * `flutter test`.
 */
const FLUTTER_TEST_FILE_PATTERN = new RegExp(
  `^(test|integration_test)/(?!.*\\.\\.)(?!(?:-|.*/-))[^\\\\:\\x00-\\x1f]+\\.dart$`,
);

export function normalizeFlutterTestFile(testFile: string): string | null {
  const normalized = path.posix.normalize(testFile.replace(/\\/g, "/"));
  return FLUTTER_TEST_FILE_PATTERN.test(normalized) ? normalized : null;
}

/** Whether a path looks like the Dart test file (`listAppTests` output). */
export function isFlutterTestFile(testFile: string): boolean {
  return FLUTTER_TEST_FILE_PATTERN.test(path.posix.normalize(testFile));
}

// ============================================================================
// Static test-case parsing (best-effort, mirrors parse_test_cases for specs)
// ============================================================================

const DART_TEST_CALL_RE = /\b(?:test|testWidgets)\(\s*(['"])(?<title>.*?)\1/g;

/**
 * Extract `test('title', ...)` / `testWidgets('title', ...)` calls from a Dart
 * test file. Returns the title plus the 1-based line of the call. Grouped
 * tests are flattened as their individual `test` calls appear.
 */
export function parseFlutterTestCases(source: string): TestCase[] {
  const cases: TestCase[] = [];
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    DART_TEST_CALL_RE.lastIndex = 0;
    for (const match of line.matchAll(DART_TEST_CALL_RE)) {
      const title = (match.groups?.title ?? "").trim();
      if (!title) continue;
      cases.push({ title, line: i + 1 });
    }
  }
  return cases;
}

// ============================================================================
// Machine-protocol result parsing
// ============================================================================

interface MachineSuite {
  id: number;
  path: string;
}

interface MachineTestStart {
  id: number;
  name: string;
  suiteId: number;
}

/**
 * Translate `flutter test --machine` JSON-lines output into the panel's
 * `TestResult` shape. Suite paths from the machine reporter are absolute, so
 * pass the app root to relativize them to `test/...` paths (the same shape
 * `listAppTests` returns and the panel re-passes to run). When `targetFile`
 * is set only results for that file are returned (single-file run).
 */
export function parseFlutterMachineResults(
  output: string,
  opts?: { appPath?: string; targetFile?: string },
): TestResult[] {
  const { appPath, targetFile } = opts ?? {};
  const suites = new Map<number, MachineSuite>();
  const started = new Map<number, MachineTestStart>();
  const errors = new Map<number, string[]>();
  const fileStatus = new Map<string, "passed" | "failed" | "inconclusive">();
  const fileTests = new Map<string, TestCaseResult[]>();
  const perFileError = new Map<string, string>();

  const mergeStatus = (
    current: "passed" | "failed" | "inconclusive" | undefined,
    incoming: "passed" | "failed" | "inconclusive",
  ): "passed" | "failed" | "inconclusive" => {
    if (incoming === "failed" || current === "failed") return "failed";
    if (incoming === "inconclusive" || current === "inconclusive") {
      return "inconclusive";
    }
    return "passed";
  };

  const relativize = (absolute: string): string => {
    const resolved = path.resolve(absolute);
    return appPath ? path.relative(appPath, resolved) : resolved;
  };

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith("{")) continue;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const type = event.type;
    if (type === "suite") {
      const suite = event.suite as { id?: number; path?: string };
      if (typeof suite?.id === "number" && typeof suite.path === "string") {
        suites.set(suite.id, { id: suite.id, path: suite.path });
      }
      continue;
    }
    if (type === "testStart") {
      const test = event.test as {
        id?: number;
        name?: string;
        suiteID?: number;
      };
      if (typeof test?.id === "number" && typeof test.name === "string") {
        started.set(test.id, {
          id: test.id,
          name: test.name,
          suiteId: typeof test.suiteID === "number" ? test.suiteID : -1,
        });
      }
      continue;
    }
    if (type === "testDone") {
      const testID = event.testID as number;
      const result = event.result as string | undefined;
      const meta = started.get(testID);
      if (!meta) continue;
      const suite = suites.get(meta.suiteId);
      if (!suite?.path) continue;
      const file = relativize(suite.path);
      if (targetFile && file !== targetFile) continue;
      const failed = result === "failure";
      const skipped = result === "skipped";
      const status: TestCaseResult["status"] = failed
        ? "failed"
        : skipped
          ? "inconclusive"
          : "passed";
      const testError = (errors.get(testID) ?? []).join("\n") || undefined;
      const existing = fileTests.get(file) ?? [];
      existing.push({
        title: meta.name,
        status,
        durationMs:
          typeof event.time === "number"
            ? Math.round(event.time / 1000)
            : undefined,
        error: testError,
      });
      fileTests.set(file, existing);
      fileStatus.set(
        file,
        mergeStatus(
          fileStatus.get(file),
          status === "inconclusive"
            ? "inconclusive"
            : failed
              ? "failed"
              : "passed",
        ),
      );
      if (failed && testError && !perFileError.has(file)) {
        perFileError.set(file, testError);
      }
      continue;
    }
    if (type === "error") {
      const testID = event.testID as number;
      if (typeof testID === "number") {
        const errText = [event.error, event.stackTrace]
          .filter((v): v is string => typeof v === "string" && v.length > 0)
          .join("\n\n");
        if (errText) {
          const existing = errors.get(testID) ?? [];
          existing.push(errText);
          errors.set(testID, existing);
        }
      }
      continue;
    }
  }

  const results: TestResult[] = [];
  for (const [file, tests] of fileTests) {
    results.push({
      file,
      status: fileStatus.get(file) ?? "inconclusive",
      error: perFileError.get(file),
      tests,
    });
  }
  return results;
}

// ============================================================================
// Runner
// ============================================================================

export interface RunFlutterAppTestsOptions {
  appId: number;
  appPath: string;
  /** Single-file run target (relative path). Omit to run the whole suite. */
  testFile?: string | null;
  /** When set (with testFile), runs only the test at this 1-based line. */
  testLine?: number;
  /** Aborts an in-flight run. */
  signal?: AbortSignal;
  /** Streams raw `flutter test` output as it arrives. */
  onOutput?: (chunk: string, phase: "setup" | "running") => void;
}

/**
 * Run the Dart widget tests via the Flutter SDK's machine reporter and map the
 * output onto the Tests panel's result shape. Returns the same
 * `RunAppTestsResult` contract the Playwright runner uses, so the panel works
 * unchanged for Flutter apps.
 */
export async function runFlutterAppTestsCore({
  appId,
  appPath,
  testFile,
  testLine,
  signal,
  onOutput,
}: RunFlutterAppTestsOptions): Promise<RunAppTestsResult> {
  const emit = (chunk: string, phase: "setup" | "running") =>
    onOutput?.(chunk, phase);
  const flutter = getFlutterExecutable();

  // Resolve a line-target to the Dart test's title and pass it to flutter via
  // --plain-name (there is no line selector for the Dart runner).
  let plainName: string | undefined;
  let targetFile = testFile;
  if (testFile) {
    const normalized = normalizeFlutterTestFile(testFile);
    if (!normalized) {
      return {
        appId,
        results: [],
        infraError: { message: `Invalid test file: ${testFile}` },
      };
    }
    targetFile = normalized;
    if (testLine && Number.isInteger(testLine) && testLine > 0) {
      try {
        const source = fs.readFileSync(path.join(appPath, normalized), "utf8");
        const caseAtLine = parseFlutterTestCases(source).find(
          (tc) => tc.line === testLine,
        );
        plainName = caseAtLine?.title;
        if (!caseAtLine) {
          return {
            appId,
            results: [],
            infraError: {
              message: `No Dart test was found at line ${testLine} — it may have moved. Try running the whole file.`,
            },
          };
        }
      } catch {
        return {
          appId,
          results: [],
          infraError: { message: `Couldn't read ${normalized}` },
        };
      }
    }
  }

  const args = ["test", "--machine"];
  if (targetFile) {
    args.push(targetFile);
  } else {
    // Run the standard Flutter test dirs, but only the ones that exist —
    // `flutter test` fails on a missing target directory, and most apps have
    // no `integration_test/` folder yet.
    const testDir = path.join(appPath, "test");
    const integrationDir = path.join(appPath, "integration_test");
    if (fs.existsSync(testDir)) {
      args.push("test/");
    }
    if (fs.existsSync(integrationDir)) {
      args.push("integration_test/");
    }
  }
  if (plainName) {
    args.push("--plain-name", plainName);
  }

  emit(`$ ${flutter} ${args.join(" ")}\n`, "setup");

  let run;
  try {
    run = await spawnStreaming({
      command: flutter,
      args,
      cwd: appPath,
      env: {
        ...process.env,
        // Machine output is stable regardless of color config/CI flags.
        TERM: "dumb",
        CI: "1",
      },
      signal,
      onOutput: (chunk) => emit(chunk, "running"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { appId, results: [], infraError: { message } };
  }

  if (run.aborted) {
    return { appId, results: [], infraError: { message: "Test run stopped." } };
  }

  const results = parseFlutterMachineResults(run.stdout, {
    appPath,
    targetFile: targetFile ?? undefined,
  });

  if (results.length === 0) {
    // No machine events — flutter itself failed (missing SDK, bad fixture) or
    // nothing matched. Surface the tail as an infra error so the panel shows
    // why instead of silently going idle.
    const tail = run.stderr.trim() || run.stdout.trim();
    if (run.code === 0) {
      return { appId, results: [] };
    }
    return {
      appId,
      results,
      infraError: {
        message:
          tail.slice(-1500) ||
          "The Flutter test runner exited without results. Check the output for details.",
      },
    };
  }

  return { appId, results };
}

/** Re-exported so handlers keep a single import surface. */
export { isFlutterApp };
