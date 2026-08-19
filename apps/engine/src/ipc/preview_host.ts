// FILE: src/ipc/preview_host.ts
// Purpose: JSON-RPC handlers for the engine's preview/analyze/test/build
// vertical — the raw (non-dyad) methods the server's EngineAdapter proxies:
//   preview/start|stop|reload|state|screenshot
//   analyze/run, test/run
//   build/start|state
// Preview lifecycle manages a `flutter run -d web-server` child per appDir
// (rolling log buffer + hot-reload stdin). Builds run in the background keyed
// by buildId. analyze/test run synchronously and map their results onto the
// protocol result schemas in src/protocol.ts.
// Layer: Engine protocol handlers (raw JSON-RPC methods)
// Depends on: src/protocol.ts (schemas), ipc/processors/flutter.ts +
//   ipc/processors/flutter_tests.ts, ipc/utils/flutter_utils.ts, electron-log

import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import treeKill from "tree-kill";
import log from "electron-log";

import { CaideError, CaideErrorKind } from "@/errors/caide_error";
import { safeFlutterEnvironment } from "@/safeEnvironment";
import {
  AnalyzeRunParamsSchema,
  BuildStartParamsSchema,
  BuildStateParamsSchema,
  PreviewReloadParamsSchema,
  PreviewStartParamsSchema,
  PreviewStateParamsSchema,
  PreviewStopParamsSchema,
  TestRunParamsSchema,
  type AnalyzeIssue,
  type BuildStatus,
  type BuildTarget,
  type PreviewReloadResult,
  type PreviewScreenshotResult,
  type PreviewStartResult,
  type PreviewStateResult,
  type PreviewStopResult,
  type TestResult as ProtocolTestResult,
} from "@/protocol.ts";
import {
  getDartDefineFromFileArgs,
  getDartExecutable,
  getFlutterExecutable,
  isFlutterApp,
} from "@/ipc/utils/flutter_utils";
import { spawnStreaming } from "@/ipc/utils/spawn_streaming";
import { runFlutterAppTestsCore } from "@/ipc/processors/flutter_tests";
import type {
  RunAppTestsResult,
  TestResult as EngineTestResult,
} from "@/ipc/types/tests";

const logger = log.scope("preview_host");

/** Rolling line cap for preview/build log buffers (newest last). */
const MAX_LOG_LINES = 200;
/** How long `flutter run -d web-server` may take before it serves a URL. */
const PREVIEW_START_TIMEOUT_MS = 120_000;
/** Grace period between SIGTERM and SIGKILL when stopping a preview child. */
const FORCE_KILL_GRACE_MS = 5_000;
/** Long-running dart/flutter steps (pub get, analyze) may fetch/sync. */
const FLUTTER_STEP_TIMEOUT_MS = 5 * 60 * 1000;

const DEFAULT_PREVIEW_HOSTNAME = "localhost";
const DEFAULT_PREVIEW_PORT = 8080;

/** Machine-format analyzer lines: SEVERITY|errorType|code|file|line|col|len|message. */
const MACHINE_LINE_RE = /^(ERROR|WARNING|INFO)\|/;

interface PreviewEntry {
  appDir: string;
  child: ChildProcess | null;
  port: number;
  url: string;
  running: boolean;
  logs: string[];
}

interface BuildEntry {
  buildId: string;
  appDir: string;
  target: BuildTarget;
  channel: BuildChannel;
  status: BuildStatus;
  exitCode: number | null;
  outputPath: string | null;
  logs: string[];
  error: string | null;
  child: ChildProcess | null;
}

type BuildChannel = NonNullable<NonNullable<(typeof BuildStartParamsSchema)["_output"]>["channel"]>;

// ── Log buffer helpers ───────────────────────────────────────────────

/** Append a raw output chunk to a rolling log array (newest last, capped). */
export function appendLogLines(logs: string[], chunk: string): void {
  for (const raw of chunk.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.length === 0) {
      continue;
    }
    logs.push(line);
  }
  if (logs.length > MAX_LOG_LINES) {
    logs.splice(0, logs.length - MAX_LOG_LINES);
  }
}

/** Extract a server URL from a `flutter run` chunk; prefers `port` when given. */
export function extractPreviewUrl(chunk: string, port?: number): string | null {
  for (const match of chunk.matchAll(/https?:\/\/[^\s'"`]+/g)) {
    const url = match[0].replace(/[.,;:)\]}\/]+$/, "");
    if (port !== undefined) {
      if (url.includes(`:${port}`)) {
        return url;
      }
    } else {
      return url;
    }
  }
  return null;
}

// ── Shared validation / helpers ──────────────────────────────────────

function assertFlutterApp(appDir: string): void {
  if (!fs.existsSync(appDir)) {
    throw new CaideError(
      `App directory not found: ${appDir}`,
      CaideErrorKind.Precondition,
    );
  }
  if (!isFlutterApp(appDir)) {
    throw new CaideError(
      `Not a Flutter app (no pubspec.yaml declaring sdk: flutter): ${appDir}`,
      CaideErrorKind.Validation,
    );
  }
}

/**
 * Ensure `flutter pub get` has been run so `.dart_tool/package_config.json`
 * exists. A freshly created app fails `dart analyze` otherwise, so every
 * operation that needs analysis/build first resolves dependencies.
 */
export async function runFlutterPubGet(appPath: string): Promise<void> {
  const run = await spawnStreaming({
    command: getFlutterExecutable(),
    args: ["pub", "get"],
    cwd: appPath,
    env: safeFlutterEnvironment({ CI: "1" }),
    timeoutMs: FLUTTER_STEP_TIMEOUT_MS,
  });
  if (run.code !== 0) {
    const tail = (run.stderr.trim() || run.stdout.trim()).slice(-1500);
    throw new CaideError(
      `flutter pub get failed (exit code ${run.code ?? "unknown"}).\n\n${tail}`,
      CaideErrorKind.External,
    );
  }
}

/** Allocate a TCP port on 127.0.0.1 — preferred one, or an ephemeral one. */
async function pickFreePort(preferred?: number): Promise<number> {
  const tryListen = (port: number): Promise<number> =>
    new Promise<number>((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.once("error", () => {
        if (port === 0) {
          reject(
            new CaideError(
              "could not allocate a free port for preview",
              CaideErrorKind.External,
            ),
          );
        } else {
          resolve(tryListen(0));
        }
      });
      server.listen(port, "127.0.0.1", () => {
        const address = server.address();
        server.close(() => {
          resolve(
            typeof address === "object" && address !== null ? address.port : port,
          );
        });
      });
    });
  return tryListen(preferred ?? DEFAULT_PREVIEW_PORT);
}

// ── analyze ──────────────────────────────────────────────────────────

/**
 * Parse `dart analyze --format=machine` output into protocol AnalyzeIssue[].
 * Mirrors processors/flutter.ts's machine parser (identical line shape and
 * message formatting) but retains SEVERITY, which the protocol requires and
 * the shared Problem type does not carry.
 */
export function parseAnalyzeIssues(
  output: string,
  appPath: string,
): AnalyzeIssue[] {
  const issues: AnalyzeIssue[] = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!MACHINE_LINE_RE.test(line)) {
      continue;
    }
    // SEVERITY|errorType|code|file|line|col|length|message
    const [severity, , code, file, lineNo, colNo, , ...rest] =
      line.split("|");
    const message = rest.join("|");
    if (!file || !lineNo || !colNo) {
      continue;
    }
    const parsedCode = Number.parseInt(code ?? "", 10);
    const ruleName =
      !Number.isNaN(parsedCode) || !code ? "" : `${code}: `;
    issues.push({
      severity:
        severity === "ERROR"
          ? "error"
          : severity === "WARNING"
            ? "warning"
            : "info",
      path: path.isAbsolute(file) ? path.relative(appPath, file) : file,
      line: Number.parseInt(lineNo, 10),
      column: Number.parseInt(colNo, 10),
      message: `${ruleName}${message}`.trim(),
    });
  }
  return issues;
}

async function runAnalyze(
  appDir: string,
): Promise<{ issues: AnalyzeIssue[]; output: string }> {
  assertFlutterApp(appDir);
  await runFlutterPubGet(appDir);
  const run = await spawnStreaming({
    command: getDartExecutable(),
    args: ["analyze", "--format=machine"],
    cwd: appDir,
    env: safeFlutterEnvironment({ CI: "1" }),
    timeoutMs: FLUTTER_STEP_TIMEOUT_MS,
  });
  const output = `${run.stdout}\n${run.stderr}`.trim();
  const issues = parseAnalyzeIssues(output, appDir);
  // Exit 0 = clean, 1 = issues found, and compile-time errors (e.g. an
  // undefined identifier) can surface as exit 3 while still emitting machine
  // lines. Prefer the parsed issues whenever any were emitted; only treat a
  // non-zero exit without diagnostics as a real failure.
  if (issues.length > 0) {
    return { issues, output };
  }
  if (run.code !== 0) {
    throw new CaideError(
      `flutter analyze failed (exit code ${run.code ?? "unknown"}).\n\n${output.slice(-2000)}`,
      CaideErrorKind.External,
    );
  }
  return { issues, output };
}

// ── test ─────────────────────────────────────────────────────────────

/**
 * Aggregate per-test counts from the Tests panel's per-file results. Each
 * TestCaseResult knows its own status, so counts go per-test; files without
 * per-test detail fall back to the file-level status.
 */
export function aggregateTestCounts(
  results: EngineTestResult[],
): { passed: number; failed: number; skipped: number } {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const fileResult of results) {
    if (fileResult.tests && fileResult.tests.length > 0) {
      for (const test of fileResult.tests) {
        if (test.status === "failed") {
          failed += 1;
        } else if (test.status === "inconclusive") {
          skipped += 1;
        } else {
          passed += 1;
        }
      }
    } else if (fileResult.status === "failed") {
      failed += 1;
    } else if (fileResult.status === "inconclusive") {
      skipped += 1;
    } else {
      passed += 1;
    }
  }
  return { passed, failed, skipped };
}

async function runTests(params: unknown): Promise<ProtocolTestResult> {
  const parsed = TestRunParamsSchema.parse(params);
  assertFlutterApp(parsed.appDir);
  let output = "";
  const result: RunAppTestsResult = await runFlutterAppTestsCore({
    appId: 0,
    appPath: parsed.appDir,
    testFile: parsed.testPath,
    onOutput: (chunk) => {
      output += chunk;
    },
  });
  const counts = aggregateTestCounts(result.results);
  if (result.infraError) {
    logger.warn(
      `test/run: infra error for ${parsed.appDir}: ${result.infraError.message}`,
    );
    output += `\n\n[test infra] ${result.infraError.message}\n`;
  }
  return { ...counts, output };
}

// ── preview lifecycle ────────────────────────────────────────────────

async function stopPreviewEntry(entry: PreviewEntry): Promise<void> {
  const child = entry.child;
  entry.child = null;
  entry.running = false;
  if (child?.pid) {
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(forceKillTimer);
        resolve();
      };
      const forceKillTimer = setTimeout(() => {
        try {
          treeKill(child.pid, "SIGKILL");
        } catch {
          // ignore
        }
        finish();
      }, FORCE_KILL_GRACE_MS);
      child.once("close", () => finish());
      try {
        treeKill(child.pid, "SIGTERM");
      } catch {
        finish();
      }
    });
  }
}

function spawnFlutterRun(
  appPath: string,
  entry: PreviewEntry,
  hostname: string,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const flutter = getFlutterExecutable();
    const args = [
      "run",
      "-d",
      "web-server",
      "--web-port",
      String(entry.port),
      "--web-hostname",
      hostname,
    ];
    args.push(...getDartDefineFromFileArgs(appPath));

    let child: ChildProcess;
    try {
      child = spawn(flutter, args, {
        cwd: appPath,
        stdio: ["pipe", "pipe", "pipe"],
        env: safeFlutterEnvironment(),
      });
    } catch (error) {
      reject(
        new CaideError(
          `flutter run could not start: ${error instanceof Error ? error.message : String(error)}`,
          CaideErrorKind.External,
        ),
      );
      return;
    }
    entry.child = child;

    let settled = false;
    let timer: NodeJS.Timeout;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      const url = extractPreviewUrl(text, entry.port);
      if (url) {
        entry.url = url;
        finish(() => {
          entry.running = true;
          logger.info(`preview: serving ${appPath} at ${url}`);
          resolve(url);
        });
      }
      appendLogLines(entry.logs, text);
    };

    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("error", (error) => {
      finish(() => {
        logger.error(`preview: flutter run spawn error for ${appPath}: ${error.message}`);
        reject(
          new CaideError(
            `flutter run could not start: ${error.message}`,
            CaideErrorKind.External,
          ),
        );
      });
    });
    child.once("close", (code) => {
      const tail = entry.logs.slice(-20).join("\n");
      finish(() => {
        appendLogLines(
          entry.logs,
          `\n[preview] flutter run exited (code ${code ?? "null"})`,
        );
        entry.running = false;
        entry.child = null;
        reject(
          new CaideError(
            `flutter run exited (code ${code ?? "null"}) before serving.\n\n${tail || "(no output)"}`,
            CaideErrorKind.External,
          ),
        );
      });
    });

    timer = setTimeout(() => {
      finish(() => {
        logger.error(
          `preview: ${appPath} did not serve within ${PREVIEW_START_TIMEOUT_MS / 1000}s`,
        );
        void stopPreviewEntry(entry);
        reject(
          new CaideError(
            `flutter run did not start serving within ${PREVIEW_START_TIMEOUT_MS / 1000}s.\n\n${entry.logs.slice(-30).join("\n") || "(no output)"}`,
            CaideErrorKind.External,
          ),
        );
      });
    }, PREVIEW_START_TIMEOUT_MS);
  });
}

async function startPreview(params: unknown): Promise<PreviewStartResult> {
  const parsed = PreviewStartParamsSchema.parse(params);
  assertFlutterApp(parsed.appDir);

  const existing = activePreviews.get(parsed.appDir);
  if (existing) {
    if (existing.running) {
      // Idempotent start: reuse the live preview.
      return { url: existing.url };
    }
    // Stale entry from a previous crash/exit — clear it before restarting.
    await stopPreviewEntry(existing);
    activePreviews.delete(parsed.appDir);
  }

  await runFlutterPubGet(parsed.appDir);

  const port =
    parsed.port ?? (await pickFreePort(DEFAULT_PREVIEW_PORT));
  const hostname = parsed.hostname ?? DEFAULT_PREVIEW_HOSTNAME;
  const entry: PreviewEntry = {
    appDir: parsed.appDir,
    child: null,
    port,
    url: "",
    running: false,
    logs: [],
  };
  activePreviews.set(parsed.appDir, entry);
  const url = await spawnFlutterRun(parsed.appDir, entry, hostname);
  return { url };
}

async function stopPreview(params: unknown): Promise<PreviewStopResult> {
  const parsed = PreviewStopParamsSchema.parse(params);
  const entry = activePreviews.get(parsed.appDir);
  if (!entry) {
    return { stopped: false };
  }
  await stopPreviewEntry(entry);
  activePreviews.delete(parsed.appDir);
  return { stopped: true };
}

function reloadPreview(params: unknown): PreviewReloadResult {
  const parsed = PreviewReloadParamsSchema.parse(params);
  const entry = activePreviews.get(parsed.appDir);
  if (!entry?.running || !entry.child?.stdin?.writable) {
    return { reloaded: false };
  }
  try {
    // 'r' = hot reload, 'R' = hot restart; newline closes the line read.
    entry.child.stdin.write(parsed.hotReload ? "r\n" : "R\n");
    return { reloaded: true };
  } catch {
    return { reloaded: false };
  }
}

function previewState(params: unknown): PreviewStateResult {
  const parsed = PreviewStateParamsSchema.parse(params);
  const entry = activePreviews.get(parsed.appDir);
  if (!entry) {
    return { running: false, url: "", logs: [] };
  }
  return { running: entry.running, url: entry.url, logs: [...entry.logs] };
}

function previewScreenshot(): PreviewScreenshotResult {
  // The web-server preview has no device backend; screenshots come from the
  // emulator/simulator path. Best-effort no-op keeps the adapter happy.
  return { success: false, outputPath: "" };
}

// ── build lifecycle ──────────────────────────────────────────────────

function channelArgs(channel: BuildEntry["channel"]): string[] {
  switch (channel) {
    case "debug":
      return ["--debug"];
    case "profile":
      return ["--profile"];
    default:
      return [];
  }
}

/** Locate the produced artifact for a finished build (best-effort). */
function resolveBuildOutputPath(
  appDir: string,
  target: BuildTarget,
  channel: BuildEntry["channel"],
): string | null {
  const flutterApkDir = path.join(appDir, "build", "app", "outputs", "flutter-apk");
  const bundleDir = path.join(appDir, "build", "app", "outputs", "bundle");
  const candidates: string[] = [];
  if (target === "apk") {
    candidates.push(
      path.join(flutterApkDir, `app-${channel}.apk`),
      path.join(flutterApkDir, "app-release.apk"),
      path.join(flutterApkDir, "app-debug.apk"),
      path.join(flutterApkDir, "app-profile.apk"),
    );
  } else if (target === "appbundle") {
    candidates.push(
      path.join(bundleDir, "release", "app-release.aab"),
      path.join(bundleDir, channel, `app-${channel}.aab`),
      path.join(bundleDir, "debug", "app-debug.aab"),
    );
  } else {
    // ipa: `flutter build ipa` writes build/ios/ipa/<name>.ipa
    const ipaDir = path.join(appDir, "build", "ios", "ipa");
    try {
      const ipas = fs
        .readdirSync(ipaDir)
        .filter((file) => file.toLowerCase().endsWith(".ipa"))
        .map((file) => path.join(ipaDir, file));
      candidates.push(...ipas);
    } catch {
      // build/ios/ipa may not exist — fall through to candidates.
    }
  }
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

async function runBuild(appDir: string, build: BuildEntry): Promise<void> {
  appendLogLines(build.logs, "[build] resolving dependencies (flutter pub get)…");
  try {
    await runFlutterPubGet(appDir);
  } catch (error) {
    build.status = "failed";
    build.error = error instanceof Error ? error.message : String(error);
    appendLogLines(build.logs, `[build] flutter pub get failed: ${build.error}`);
    return;
  }

  const args = ["build", build.target, ...channelArgs(build.channel)];
  appendLogLines(build.logs, `$ flutter ${args.join(" ")}`);
  let run;
  try {
    run = await spawnStreaming({
      command: getFlutterExecutable(),
      args,
      cwd: appDir,
      env: safeFlutterEnvironment({ CI: "1" }),
      onOutput: (chunk) => appendLogLines(build.logs, chunk),
      onProcess: (child) => {
        build.child = child;
      },
      timeoutMs: 30 * 60 * 1000,
    });
  } catch (error) {
    build.child = null;
    build.status = "failed";
    build.error = error instanceof Error ? error.message : String(error);
    return;
  }
  build.child = null;
  if (run.code === 0) {
    build.status = "succeeded";
    build.exitCode = 0;
    build.outputPath = resolveBuildOutputPath(appDir, build.target, build.channel) ?? null;
    appendLogLines(
      build.logs,
      `[build] succeeded${build.outputPath ? `: ${build.outputPath}` : ""}`,
    );
    return;
  }
  build.status = "failed";
  build.exitCode = run.code;
  build.error =
    (run.stderr.trim() || run.stdout.trim()).slice(-1500) ||
    `flutter build exited with code ${run.code}`;
}

async function buildStart(params: unknown): Promise<{ buildId: string }> {
  const parsed = BuildStartParamsSchema.parse(params);
  assertFlutterApp(parsed.appDir);
  const buildId = randomUUID();
  const build: BuildEntry = {
    buildId,
    appDir: parsed.appDir,
    target: parsed.target,
    channel: parsed.channel ?? "release",
    status: "running",
    exitCode: null,
    outputPath: null,
    logs: [],
    error: null,
    child: null,
  };
  activeBuilds.set(buildId, build);
  void runBuild(parsed.appDir, build);
  return { buildId };
}

async function buildState(params: unknown) {
  const parsed = BuildStateParamsSchema.parse(params);
  const build = activeBuilds.get(parsed.buildId);
  if (!build) {
    throw new CaideError(
      `unknown buildId: ${parsed.buildId}`,
      CaideErrorKind.NotFound,
    );
  }
  return {
    buildId: build.buildId,
    status: build.status,
    exitCode: build.exitCode,
    outputPath: build.outputPath,
    logs: [...build.logs],
    error: build.error,
  };
}

// ── router ───────────────────────────────────────────────────────────

const PREVIEW_METHODS = [
  "preview/start",
  "preview/stop",
  "preview/reload",
  "preview/state",
  "preview/screenshot",
  "analyze/run",
  "test/run",
  "build/start",
  "build/state",
] as const;

const activePreviews = new Map<string, PreviewEntry>();
const activeBuilds = new Map<string, BuildEntry>();

/**
 * Raw JSON-RPC dispatch for the engine's preview/analyze/test/build methods.
 * `handle` resolves with the method result and throws on failure; the caller
 * (src/index.ts) shapes the JSON-RPC error envelope.
 */
export interface PreviewJsonRpcRouter {
  isPreviewMethod(method: string): boolean;
  handle(method: string, params: unknown): Promise<unknown>;
  /** Kill any live preview/build children (engine shutdown / exit). */
  dispose(): void;
}

export function createPreviewJsonRpcRouter(): PreviewJsonRpcRouter {
  return {
    isPreviewMethod(method: string): boolean {
      return (PREVIEW_METHODS as readonly string[]).includes(method);
    },
    async handle(method: string, params: unknown): Promise<unknown> {
      switch (method) {
        case "preview/start":
          return startPreview(params);
        case "preview/stop":
          return stopPreview(params);
        case "preview/reload":
          return reloadPreview(params);
        case "preview/state":
          return previewState(params);
        case "preview/screenshot":
          return previewScreenshot();
        case "analyze/run": {
          const parsed = AnalyzeRunParamsSchema.parse(params);
          return runAnalyze(parsed.appDir);
        }
        case "test/run":
          return runTests(params);
        case "build/start":
          return buildStart(params);
        case "build/state":
          return buildState(params);
        default:
          throw new CaideError(
            `unhandled preview method: ${method}`,
            CaideErrorKind.Internal,
          );
      }
    },
    dispose(): void {
      for (const entry of activePreviews.values()) {
        void stopPreviewEntry(entry);
      }
      activePreviews.clear();
      for (const build of activeBuilds.values()) {
        if (build.child?.pid) {
          try {
            treeKill(build.child.pid, "SIGTERM");
          } catch {
            // ignore
          }
        }
      }
      activeBuilds.clear();
    },
  };
}