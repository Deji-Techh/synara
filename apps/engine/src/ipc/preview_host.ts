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
import { promises as fsp } from "node:fs";
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
  ensureFlutterSdkAvailable,
  getDartDefineFromFileArgs,
  getDartExecutable,
  getFlutterExecutable,
  isFlutterApp,
} from "@/ipc/utils/flutter_utils";
import { spawnStreaming } from "@/ipc/utils/spawn_streaming";
import { runFlutterAppTestsCore } from "@/ipc/processors/flutter_tests";
import type { RunAppTestsResult, TestResult as EngineTestResult } from "@/ipc/types/tests";
import { emit } from "@/ipc/utils/event_bus";
import { createHash } from "node:crypto";
import {
  getLastManagedFlutterInstallProgress,
  inspectManagedFlutterToolchain,
  installManagedFlutterToolchain,
} from "@/ipc/services/managed_flutter_toolchain_service";

const logger = log.scope("preview_host");

/** Rolling line cap for preview/build log buffers (newest last). Matches the
 * contracts PREVIEW_MAX_LOGS limit so no lines are dropped in transit. */
const MAX_LOG_LINES = 500;
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
  device: "web-server" | "emulator" | "simulator";
  deviceId: string | null;
}

// ── realtime watcher (hot-reload on file change) ───────────────────────

const PREVIEW_WATCH_DEBOUNCE_MS = 500;
const previewWatchers = new Map<string, { close: () => void }>();

function collectSubdirs(root: string): string[] {
  const result: string[] = [];
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;
      if (entry.name === "build" || entry.name === ".dart_tool") continue;
      const full = path.join(root, entry.name);
      result.push(full);
      result.push(...collectSubdirs(full));
    }
  } catch {}
  return result;
}

function startPreviewWatcher(entry: PreviewEntry): void {
  stopPreviewWatcher(entry.appDir);
  let debounce: NodeJS.Timeout | null = null;
  const scheduleReload = () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = null;
      if (!entry.running || !entry.child?.stdin?.writable) return;
      try {
        entry.child.stdin.write("r\n");
        appendLogLines(entry.logs, "[preview] auto hot reload (file change)");
        logger.info(`preview: auto hot reload for ${entry.appDir}`);
      } catch {}
    }, PREVIEW_WATCH_DEBOUNCE_MS);
  };

  const watchers: fs.FSWatcher[] = [];
  const watchTargets = [path.join(entry.appDir, "lib"), entry.appDir];

  for (const target of watchTargets) {
    if (!fs.existsSync(target)) continue;
    try {
      const watcher = fs.watch(
        target,
        { recursive: true } as unknown as fs.WatchOptions,
        (_event: string, filename: string | Buffer | null) => {
          const name = typeof filename === "string" ? filename : filename ? filename.toString() : "";
          if (
            name.includes(".dart_tool") ||
            name.includes(`${path.sep}build${path.sep}`) ||
            name.startsWith("build") ||
            name.includes(".git") ||
            name.includes(".caide")
          ) {
            return;
          }
          scheduleReload();
        },
      );
      watcher.on("error", () => {});
      watchers.push(watcher);
    } catch {
      // recursive not supported — watch non-recursive and fan out to subdirs
      try {
        const watcher = fs.watch(target, (_event: string, filename: string | Buffer | null) => {
          const name = typeof filename === "string" ? filename : filename ? filename.toString() : "";
          if (name.includes(".dart_tool") || name.includes("build") || name.includes(".git")) return;
          scheduleReload();
        });
        watcher.on("error", () => {});
        watchers.push(watcher);
      } catch {}
    }
  }

  // Fallback: enumerate lib subdirs for platforms where recursive watch is a no-op
  // (Linux older kernels). This ensures nested lib/ files still trigger reload.
  try {
    const libDir = path.join(entry.appDir, "lib");
    if (fs.existsSync(libDir) && watchers.length <= 1) {
      const subdirs = collectSubdirs(libDir);
      for (const sub of subdirs) {
        try {
          const watcher = fs.watch(sub, (_event: string) => scheduleReload());
          watcher.on("error", () => {});
          watchers.push(watcher);
        } catch {}
      }
    }
  } catch {}

  if (watchers.length === 0) return;
  previewWatchers.set(entry.appDir, {
    close: () => {
      if (debounce) clearTimeout(debounce);
      for (const watcher of watchers) {
        try {
          watcher.close();
        } catch {}
      }
    },
  });
}

function stopPreviewWatcher(appDir: string): void {
  const existing = previewWatchers.get(appDir);
  if (!existing) return;
  previewWatchers.delete(appDir);
  try {
    existing.close();
  } catch {}
}

interface BuildEntry {
  buildId: string;
  appDir: string;
  target: BuildTarget;
  channel: BuildChannel;
  status: BuildStatus;
  exitCode: number | null;
  outputPath: string | null;
  sha256: string | null;
  logs: string[];
  error: string | null;
  child: ChildProcess | null;
  signing?: {
    keystorePath: string;
    keyAlias: string;
    storePassword: string;
    keyPassword: string;
  } | null;
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
    throw new CaideError(`App directory not found: ${appDir}`, CaideErrorKind.Precondition);
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
  await ensureFlutterAvailable();
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
            new CaideError("could not allocate a free port for preview", CaideErrorKind.External),
          );
        } else {
          resolve(tryListen(0));
        }
      });
      server.listen(port, "127.0.0.1", () => {
        const address = server.address();
        server.close(() => {
          resolve(typeof address === "object" && address !== null ? address.port : port);
        });
      });
    });
  return tryListen(preferred ?? DEFAULT_PREVIEW_PORT);
}

function emitFlutterProgress(progress: {
  phase: string;
  percent: number;
  componentPercent: number;
  downloadedBytes: number;
  totalBytes: number | null;
  message: string;
}): void {
  try {
    emit("flutter:toolchain:progress", progress);
  } catch {}
}

async function ensureFlutterAvailable(): Promise<string> {
  try {
    const bin = await ensureFlutterSdkAvailable((p) => emitFlutterProgress(p));
    return bin;
  } catch (error) {
    // Surface as CaideError so preview/build show actionable message
    if (error instanceof CaideError) throw error;
    throw new CaideError(
      `Flutter SDK unavailable: ${error instanceof Error ? error.message : String(error)}`,
      CaideErrorKind.External,
    );
  }
}

// ── analyze ──────────────────────────────────────────────────────────

/**
 * Parse `dart analyze --format=machine` output into protocol AnalyzeIssue[].
 * Mirrors processors/flutter.ts's machine parser (identical line shape and
 * message formatting) but retains SEVERITY, which the protocol requires and
 * the shared Problem type does not carry.
 */
export function parseAnalyzeIssues(output: string, appPath: string): AnalyzeIssue[] {
  const issues: AnalyzeIssue[] = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!MACHINE_LINE_RE.test(line)) {
      continue;
    }
    // SEVERITY|errorType|code|file|line|col|length|message
    const [severity, , code, file, lineNo, colNo, , ...rest] = line.split("|");
    const message = rest.join("|");
    if (!file || !lineNo || !colNo) {
      continue;
    }
    const parsedCode = Number.parseInt(code ?? "", 10);
    const ruleName = !Number.isNaN(parsedCode) || !code ? "" : `${code}: `;
    issues.push({
      severity: severity === "ERROR" ? "error" : severity === "WARNING" ? "warning" : "info",
      path: path.isAbsolute(file) ? path.relative(appPath, file) : file,
      line: Number.parseInt(lineNo, 10),
      column: Number.parseInt(colNo, 10),
      message: `${ruleName}${message}`.trim(),
    });
  }
  return issues;
}

async function runAnalyze(appDir: string): Promise<{ issues: AnalyzeIssue[]; output: string }> {
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
export function aggregateTestCounts(results: EngineTestResult[]): {
  passed: number;
  failed: number;
  skipped: number;
} {
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
  await ensureFlutterAvailable();
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
    logger.warn(`test/run: infra error for ${parsed.appDir}: ${result.infraError.message}`);
    output += `\n\n[test infra] ${result.infraError.message}\n`;
  }
  return { ...counts, output };
}

// ── preview lifecycle ────────────────────────────────────────────────

async function stopPreviewEntry(entry: PreviewEntry): Promise<void> {
  stopPreviewWatcher(entry.appDir);
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

function validateDevicePlatform(device: "web-server" | "emulator" | "simulator"): void {
  if (device === "emulator" && process.platform !== "linux" && process.platform !== "win32") {
    throw new CaideError(
      "Android emulator preview is only available on Linux and Windows. Use web-server preview on this platform.",
      CaideErrorKind.Precondition,
    );
  }
  if (device === "simulator" && process.platform !== "darwin") {
    throw new CaideError(
      "iOS Simulator preview is only available on macOS. Use web-server preview on this platform.",
      CaideErrorKind.Precondition,
    );
  }
}

function spawnFlutterRun(appPath: string, entry: PreviewEntry, hostname: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const device = entry.device ?? "web-server";
    validateDevicePlatform(device);
    const flutter = getFlutterExecutable();
    let args: string[];
    if (device === "web-server") {
      args = [
        "run",
        "-d",
        "web-server",
        "--web-port",
        String(entry.port),
        "--web-hostname",
        hostname,
      ];
      args.push(...getDartDefineFromFileArgs(appPath));
    } else if (device === "emulator") {
      const target = entry.deviceId && entry.deviceId.length > 0 ? entry.deviceId : "emulator";
      args = ["run", "-d", target];
      args.push(...getDartDefineFromFileArgs(appPath));
    } else {
      // simulator
      const target = entry.deviceId && entry.deviceId.length > 0 ? entry.deviceId : "simulator";
      args = ["run", "-d", target];
      args.push(...getDartDefineFromFileArgs(appPath));
    }

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

    const isNative = device !== "web-server";
    const nativeUrl = `native:${device}${entry.deviceId ? `:${entry.deviceId}` : ""}`;

    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      appendLogLines(entry.logs, text);
      if (!isNative) {
        const url = extractPreviewUrl(text, entry.port);
        if (url) {
          entry.url = url;
          finish(() => {
            entry.running = true;
            logger.info(`preview: serving ${appPath} at ${url}`);
            startPreviewWatcher(entry);
            resolve(url);
          });
        }
      } else {
        // Native device: resolve only on markers flutter prints after the app
        // is actually installed and running on the device. Resolving on the
        // first output chunk would report "running" while Gradle is still
        // building, long before anything renders on screen.
        if (/Flutter run key commands|Application running|A Dart VM Service on/i.test(text)) {
          entry.url = nativeUrl;
          finish(() => {
            entry.running = true;
            logger.info(`preview: native ${device} confirmed running for ${appPath}`);
            startPreviewWatcher(entry);
            resolve(nativeUrl);
          });
        }
      }
    };

    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("error", (error) => {
      finish(() => {
        logger.error(`preview: flutter run spawn error for ${appPath}: ${error.message}`);
        reject(
          new CaideError(`flutter run could not start: ${error.message}`, CaideErrorKind.External),
        );
      });
    });
    child.once("close", (code) => {
      const tail = entry.logs.slice(-20).join("\n");
      finish(() => {
        appendLogLines(entry.logs, `\n[preview] flutter run exited (code ${code ?? "null"})`);
        entry.running = false;
        entry.child = null;
        stopPreviewWatcher(appPath);
        reject(
          new CaideError(
            `flutter run exited (code ${code ?? "null"}) before serving.\n\n${tail || "(no output)"}`,
            CaideErrorKind.External,
          ),
        );
      });
    });

    // Post-serve exit: when a running preview's child dies (crash/stop), tear
    // down the watcher and mark it idle so the pane can retry.
    child.on("close", (code) => {
      if (!settled) return;
      if (!entry.running) return;
      entry.running = false;
      entry.child = null;
      stopPreviewWatcher(appPath);
      appendLogLines(entry.logs, `\n[preview] flutter run exited (code ${code ?? "null"})`);
      logger.warn(`preview: ${appPath} exited after serving (code ${code ?? "null"})`);
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
      return { url: existing.url, kind: existing.device === "web-server" ? "web" : "native" };
    }
    // Stale entry from a previous crash/exit — clear it before restarting.
    await stopPreviewEntry(existing);
    activePreviews.delete(parsed.appDir);
  }

  await ensureFlutterAvailable();
  await runFlutterPubGet(parsed.appDir);

  const device = (parsed.device ?? "web-server") as PreviewEntry["device"];
  validateDevicePlatform(device);
  const port =
    device === "web-server" ? (parsed.port ?? (await pickFreePort(DEFAULT_PREVIEW_PORT))) : 0;
  const hostname = parsed.hostname ?? DEFAULT_PREVIEW_HOSTNAME;
  const entry: PreviewEntry = {
    appDir: parsed.appDir,
    child: null,
    port,
    url: "",
    running: false,
    logs: [],
    device,
    deviceId: parsed.deviceId ?? null,
  };
  activePreviews.set(parsed.appDir, entry);
  const url = await spawnFlutterRun(parsed.appDir, entry, hostname);
  return { url, kind: device === "web-server" ? "web" : "native" };
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
  return {
    running: entry.running,
    url: entry.url,
    logs: [...entry.logs],
    kind: entry.device === "web-server" ? "web" : "native",
  };
}

async function listPreviewDevices(): Promise<{
  devices: Array<{
    id: string;
    name: string;
    isEmulator: boolean;
    platform?: "android" | "ios" | "web";
  }>;
}> {
  const devices: Array<{
    id: string;
    name: string;
    isEmulator: boolean;
    platform?: "android" | "ios" | "web";
  }> = [{ id: "web-server", name: "Web Preview", isEmulator: false, platform: "web" }];

  // Android emulator devices (linux/win32 only)
  if (process.platform === "linux" || process.platform === "win32") {
    try {
      // Try to list AVDs via emulator -list-avds
      const avdRun = await spawnStreaming({
        command: "emulator",
        args: ["-list-avds"],
        cwd: process.cwd(),
        env: safeFlutterEnvironment(),
        timeoutMs: 5_000,
      }).catch(() => null);
      if (avdRun && avdRun.code === 0) {
        const avds = avdRun.stdout
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
        for (const avd of avds) {
          if (!devices.some((d) => d.id === avd)) {
            devices.push({
              id: avd,
              name: `${avd} (Emulator AVD)`,
              isEmulator: true,
              platform: "android",
            });
          }
        }
      }
    } catch {}
    try {
      const adbRun = await spawnStreaming({
        command: "adb",
        args: ["devices", "-l"],
        cwd: process.cwd(),
        env: safeFlutterEnvironment(),
        timeoutMs: 5_000,
      }).catch(() => null);
      if (adbRun && adbRun.code === 0) {
        const lines = adbRun.stdout.split(/\r?\n/).slice(1);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const parts = trimmed.split(/\s+/);
          const id = parts[0];
          if (!id || id.startsWith("*")) continue;
          const isEmulator = id.startsWith("emulator-");
          if (!devices.some((d) => d.id === id)) {
            devices.push({
              id,
              name: `${id} (${isEmulator ? "Emulator" : "Device"})`,
              isEmulator,
              platform: "android",
            });
          }
        }
      }
    } catch {}
    // Only advertise a generic emulator fallback when the host actually has
    // emulator tooling (at least one AVD or a running emulator/adb device).
    // Otherwise the UI would offer "Android Phone → emulator" on a machine
    // with no AVD (e.g. Arch Linux CI), and `flutter run -d emulator` fails
    // with "No supported devices matching 'emulator'. Found: Linux (desktop)".
    const hasRealAndroidDevice = devices.some((d) => d.platform === "android");
    if (hasRealAndroidDevice && !devices.some((d) => d.id === "emulator")) {
      devices.push({
        id: "emulator",
        name: "Android Emulator",
        isEmulator: true,
        platform: "android",
      });
    }
  }

  // iOS Simulator (darwin only)
  if (process.platform === "darwin") {
    try {
      const simRun = await spawnStreaming({
        command: "xcrun",
        args: ["simctl", "list", "devices", "available", "--json"],
        cwd: process.cwd(),
        env: safeFlutterEnvironment(),
        timeoutMs: 8_000,
      }).catch(() => null);
      if (simRun && simRun.code === 0) {
        try {
          const parsed = JSON.parse(simRun.stdout);
          const devicesObj = parsed?.devices ?? {};
          for (const runtime of Object.keys(devicesObj)) {
            const list = devicesObj[runtime];
            if (!Array.isArray(list)) continue;
            for (const dev of list as Array<{
              udid?: string;
              name?: string;
              isAvailable?: boolean;
            }>) {
              if (!dev.udid || !dev.name) continue;
              if (dev.isAvailable === false) continue;
              if (!devices.some((d) => d.id === dev.udid)) {
                devices.push({
                  id: dev.udid!,
                  name: `${dev.name} (Simulator)`,
                  isEmulator: true,
                  platform: "ios",
                });
              }
            }
          }
        } catch {}
      }
      // Fallback: at least offer generic simulator entry
      if (!devices.some((d) => d.id === "simulator")) {
        devices.push({ id: "simulator", name: "iOS Simulator", isEmulator: true, platform: "ios" });
      }
    } catch {}
  }

  return { devices };
}

async function previewScreenshot(params: unknown): Promise<PreviewScreenshotResult> {
  const parsed = ((): { deviceId?: string; outputPath?: string; appDir?: string } => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = params as any;
      return { deviceId: p?.deviceId, outputPath: p?.outputPath, appDir: p?.appDir };
    } catch {
      return {};
    }
  })();

  // Try to determine device context from running previews
  let targetDeviceId = parsed.deviceId?.trim() ?? "";
  let targetAppDir = parsed.appDir?.trim() ?? "";

  // If no explicit deviceId but we have a running native preview, use its device
  if (!targetDeviceId) {
    for (const entry of activePreviews.values()) {
      if (entry.running && entry.device !== "web-server") {
        targetDeviceId = entry.deviceId ?? entry.device;
        targetAppDir = entry.appDir;
        break;
      }
    }
    // If still none, fallback to any running preview's appDir for screenshot context
    if (!targetDeviceId && !targetAppDir) {
      for (const entry of activePreviews.values()) {
        if (entry.running) {
          targetAppDir = entry.appDir;
          targetDeviceId = entry.deviceId ?? entry.device;
          break;
        }
      }
    }
  }

  // Web preview has no native screenshot; return no image
  if (!targetDeviceId || targetDeviceId === "web-server") {
    // Check if caller is web-server preview → no native capture
    const isWebOnly = [...activePreviews.values()].every(
      (e) => !e.running || e.device === "web-server",
    );
    if (isWebOnly && !targetDeviceId) {
      return { success: false, outputPath: "", image: null };
    }
  }

  const tmpDir = targetAppDir
    ? path.join(targetAppDir, ".caide", "evidence")
    : path.join(process.cwd(), ".caide", "evidence");
  try {
    await fsp.mkdir(tmpDir, { recursive: true });
  } catch {}
  const outputPath =
    parsed.outputPath && parsed.outputPath.length > 0
      ? parsed.outputPath
      : path.join(tmpDir, `device_${Date.now()}.png`);

  // Try Android via adb first (emulator)
  const isEmulatorLike =
    targetDeviceId.startsWith("emulator") ||
    targetDeviceId === "emulator" ||
    targetDeviceId.includes("avd");
  const isSimulatorLike = targetDeviceId === "simulator" || /^[0-9A-F-]{36}$/i.test(targetDeviceId);

  // Attempt adb exec-out screencap
  try {
    const adbArgs =
      targetDeviceId && targetDeviceId.startsWith("emulator-")
        ? ["-s", targetDeviceId, "exec-out", "screencap", "-p"]
        : ["exec-out", "screencap", "-p"];
    // Only try adb if we are on linux/win32 or target looks like android
    if (
      isEmulatorLike ||
      targetDeviceId.startsWith("emulator-") ||
      process.platform === "linux" ||
      process.platform === "win32"
    ) {
      const result = await new Promise<{ code: number | null; stdout: Buffer }>((resolve) => {
        const child = spawn("adb", adbArgs, {
          env: safeFlutterEnvironment(),
          stdio: ["ignore", "pipe", "pipe"],
        });
        const chunks: Buffer[] = [];
        child.stdout.on("data", (c: Buffer) => chunks.push(c));
        let stderr = "";
        child.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
        child.on("close", (code) => resolve({ code, stdout: Buffer.concat(chunks) }));
        child.on("error", () => resolve({ code: 1, stdout: Buffer.alloc(0) }));
        setTimeout(() => {
          try {
            child.kill("SIGTERM");
          } catch {}
        }, 10_000);
      });
      if (result.code === 0 && result.stdout.length > 100) {
        // Check PNG header
        if (result.stdout[0] === 0x89 && result.stdout[1] === 0x50) {
          await fsp.writeFile(outputPath, result.stdout).catch(() => undefined);
          const image = result.stdout.toString("base64");
          return { success: true, outputPath, image };
        }
      }
    }
  } catch {}

  // Try iOS simctl (darwin)
  if (process.platform === "darwin" || isSimulatorLike) {
    try {
      const simDevice =
        targetDeviceId && /^[0-9A-F-]{36}$/i.test(targetDeviceId) ? targetDeviceId : "booted";
      const simResult = await spawnStreaming({
        command: "xcrun",
        args: ["simctl", "io", simDevice, "screenshot", "--type", "png", outputPath],
        cwd: targetAppDir || process.cwd(),
        env: safeFlutterEnvironment(),
        timeoutMs: 10_000,
      }).catch(() => null);
      if (simResult && simResult.code === 0 && fs.existsSync(outputPath)) {
        const data = await fsp.readFile(outputPath).catch(() => null);
        if (data && data.length > 0) {
          return { success: true, outputPath, image: data.toString("base64") };
        }
      }
    } catch {}
  }

  // No BrowserWindow fallback: the engine is a headless process and the
  // electron shim can never produce a real window to capture.

  return { success: false, outputPath: "", image: null };
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
  const apkDir = path.join(appDir, "build", "app", "outputs", "apk");
  const bundleDir = path.join(appDir, "build", "app", "outputs", "bundle");
  const candidates: string[] = [];
  if (target === "apk") {
    candidates.push(
      path.join(flutterApkDir, `app-${channel}.apk`),
      path.join(flutterApkDir, "app-release.apk"),
      path.join(flutterApkDir, "app-debug.apk"),
      path.join(flutterApkDir, "app-profile.apk"),
      // split per-abi
      path.join(flutterApkDir, `app-${channel}-arm64-v8a.apk`),
      path.join(flutterApkDir, `app-${channel}-armeabi-v7a.apk`),
      path.join(flutterApkDir, `app-${channel}-x86_64.apk`),
      // fallback to generic apk output dir
      path.join(apkDir, channel, `app-${channel}.apk`),
      path.join(apkDir, "release", "app-release.apk"),
    );
    // Any apk in flutter-apk dir as fallback (newest)
    try {
      const apks = fs
        .readdirSync(flutterApkDir)
        .filter((f) => f.endsWith(".apk"))
        .map((f) => path.join(flutterApkDir, f));
      candidates.push(...apks);
    } catch {}
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
      // Sort by mtime newest first when multiple
      ipas.sort((a, b) => {
        try {
          return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
        } catch {
          return 0;
        }
      });
      candidates.push(...ipas);
    } catch {
      // build/ios/ipa may not exist — fall through to candidates.
    }
  }
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

async function computeSha256(filePath: string): Promise<string | null> {
  try {
    const data = await fsp.readFile(filePath);
    return createHash("sha256").update(data).digest("hex");
  } catch {
    return null;
  }
}

// ── artifact snapshots ───────────────────────────────────────────────

/** Stable per-app store for build artifacts (survives rebuilds + flutter clean). */
function artifactStoreDir(appDir: string): string {
  return path.join(appDir, ".caide", "artifacts");
}

function artifactKindForTarget(target: BuildTarget): "apk" | "aab" | "ipa" {
  if (target === "appbundle") return "aab";
  if (target === "ipa") return "ipa";
  return "apk";
}

/**
 * Copy a successful build's binary into the stable artifact store and notify
 * the supervisor (`build:completed`). Flutter overwrites `build/app/outputs/…`
 * on every rebuild, so without this snapshot only the newest build survives.
 * Best-effort: failures are logged but never fail the build itself.
 */
async function snapshotBuildArtifact(appDir: string, build: BuildEntry): Promise<void> {
  if (!build.outputPath) return;
  try {
    const artifactId = randomUUID();
    const fileName = path.basename(build.outputPath);
    const destDir = path.join(artifactStoreDir(appDir), artifactId);
    await fsp.mkdir(destDir, { recursive: true });
    const destPath = path.join(destDir, fileName);
    await fsp.copyFile(build.outputPath, destPath);
    const sizeBytes = (await fsp.stat(destPath)).size;
    const payload = {
      buildId: build.buildId,
      appDir,
      artifactId,
      filePath: destPath,
      fileName,
      kind: artifactKindForTarget(build.target),
      channel: build.channel,
      target: build.target,
      sizeBytes,
      sha256: build.sha256,
      finishedAt: new Date().toISOString(),
    };
    await fsp.writeFile(
      path.join(destDir, "artifact.json"),
      JSON.stringify(payload, null, 2),
      "utf8",
    );
    emit("build:completed", payload);
    appendLogLines(build.logs, `[build] archived artifact ${fileName} (${artifactId})`);
  } catch (error) {
    appendLogLines(
      build.logs,
      `[build] WARNING: could not archive artifact: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function maybeWriteSigningConfig(
  appDir: string,
  signing:
    | { keystorePath: string; keyAlias: string; storePassword: string; keyPassword: string }
    | null
    | undefined,
  logs: string[],
): Promise<void> {
  if (!signing || !signing.keystorePath) return;
  const keystorePath = signing.keystorePath.trim();
  if (!keystorePath) return;
  // Verify keystore exists
  if (!fs.existsSync(keystorePath)) {
    appendLogLines(
      logs,
      `[signing] WARNING: keystore not found at ${keystorePath} — build will use debug signing`,
    );
    return;
  }
  const keyPropsPath = path.join(appDir, "android", "key.properties");
  try {
    await fsp.mkdir(path.dirname(keyPropsPath), { recursive: true });
    const content = [
      `storePassword=${signing.storePassword}`,
      `keyPassword=${signing.keyPassword}`,
      `keyAlias=${signing.keyAlias}`,
      `storeFile=${keystorePath}`,
    ].join("\n");
    await fsp.writeFile(keyPropsPath, content, "utf8");
    appendLogLines(logs, `[signing] wrote android/key.properties for ${signing.keyAlias}`);
  } catch (error) {
    appendLogLines(
      logs,
      `[signing] WARNING: could not write key.properties: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function runBuild(appDir: string, build: BuildEntry): Promise<void> {
  appendLogLines(build.logs, "[build] ensuring Flutter SDK…");
  try {
    await ensureFlutterAvailable();
  } catch (error) {
    build.status = "failed";
    build.error = error instanceof Error ? error.message : String(error);
    appendLogLines(build.logs, `[build] flutter unavailable: ${build.error}`);
    return;
  }
  appendLogLines(build.logs, "[build] resolving dependencies (flutter pub get)…");
  try {
    await runFlutterPubGet(appDir);
  } catch (error) {
    build.status = "failed";
    build.error = error instanceof Error ? error.message : String(error);
    appendLogLines(build.logs, `[build] flutter pub get failed: ${build.error}`);
    return;
  }

  // Signing config for Android release builds (best-practice)
  try {
    const signing = (
      build as unknown as {
        signing?: {
          keystorePath: string;
          keyAlias: string;
          storePassword: string;
          keyPassword: string;
        } | null;
      }
    ).signing;
    await maybeWriteSigningConfig(appDir, signing, build.logs);
  } catch {}

  // iOS builds only on macOS
  if (build.target === "ipa" && process.platform !== "darwin") {
    build.status = "failed";
    build.error = "iOS IPA builds require macOS with Xcode installed.";
    appendLogLines(build.logs, `[build] ${build.error}`);
    return;
  }

  const args = [
    "build",
    build.target,
    ...channelArgs(build.channel),
    ...getDartDefineFromFileArgs(appDir),
  ];
  appendLogLines(build.logs, `$ flutter ${args.join(" ")}`);
  let run;
  // Build env: include signing passwords if provided (Gradle can read key.properties, but also env)
  const signing = (
    build as unknown as {
      signing?: {
        keystorePath: string;
        keyAlias: string;
        storePassword: string;
        keyPassword: string;
      } | null;
    }
  ).signing;
  const buildEnv: NodeJS.ProcessEnv = { CI: "1" };
  if (signing?.keystorePath) {
    buildEnv.ANDROID_KEYSTORE_PATH = signing.keystorePath;
    buildEnv.ANDROID_KEY_ALIAS = signing.keyAlias;
    buildEnv.ANDROID_STORE_PASSWORD = signing.storePassword;
    buildEnv.ANDROID_KEY_PASSWORD = signing.keyPassword;
  }
  try {
    run = await spawnStreaming({
      command: getFlutterExecutable(),
      args,
      cwd: appDir,
      env: safeFlutterEnvironment(buildEnv),
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
    if (build.outputPath) {
      build.sha256 = await computeSha256(build.outputPath);
      try {
        if (build.sha256) {
          await fsp
            .writeFile(
              `${build.outputPath}.sha256`,
              `${build.sha256}  ${path.basename(build.outputPath)}\n`,
              "utf8",
            )
            .catch(() => undefined);
        }
      } catch {}
    }
    appendLogLines(
      build.logs,
      `[build] succeeded${build.outputPath ? `: ${build.outputPath}${build.sha256 ? ` (sha256:${build.sha256.slice(0, 12)}…)` : ""}` : ""}`,
    );
    await snapshotBuildArtifact(appDir, build);
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
    sha256: null,
    logs: [],
    error: null,
    child: null,
    signing:
      (
        parsed as {
          signing?: {
            keystorePath: string;
            keyAlias: string;
            storePassword: string;
            keyPassword: string;
          } | null;
        }
      ).signing ?? null,
  };
  activeBuilds.set(buildId, build);
  void runBuild(parsed.appDir, build);
  return { buildId };
}

async function buildState(params: unknown) {
  const parsed = BuildStateParamsSchema.parse(params);
  const build = activeBuilds.get(parsed.buildId);
  if (!build) {
    throw new CaideError(`unknown buildId: ${parsed.buildId}`, CaideErrorKind.NotFound);
  }
  return {
    buildId: build.buildId,
    status: build.status,
    exitCode: build.exitCode,
    outputPath: build.outputPath,
    sha256: build.sha256 ?? null,
    logs: [...build.logs],
    error: build.error,
  };
}

// ── flutter toolchain ────────────────────────────────────────────────

async function flutterToolchainStatus(): Promise<{
  supported: boolean;
  installed: boolean;
  version: string;
  root: string;
  sdkPath: string;
  flutterBin: string;
  estimatedDownloadBytes: number;
  unsupportedReason: string | null;
  installProgress?: ReturnType<typeof getLastManagedFlutterInstallProgress>;
}> {
  return {
    ...inspectManagedFlutterToolchain(),
    installProgress: getLastManagedFlutterInstallProgress(),
  };
}

async function flutterToolchainInstall(): Promise<{
  status: Awaited<ReturnType<typeof inspectManagedFlutterToolchain>>;
}> {
  const status = await installManagedFlutterToolchain({
    onProgress: (p) => emitFlutterProgress(p),
  });
  return { status };
}

// ── router ───────────────────────────────────────────────────────────

const PREVIEW_METHODS = [
  "preview/start",
  "preview/stop",
  "preview/reload",
  "preview/state",
  "preview/screenshot",
  "preview/devices",
  "analyze/run",
  "test/run",
  "build/start",
  "build/state",
  "flutter/toolchain/status",
  "flutter/toolchain/install",
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
          return previewScreenshot(params);
        case "preview/devices":
          return listPreviewDevices();
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
        case "flutter/toolchain/status":
          return flutterToolchainStatus();
        case "flutter/toolchain/install":
          return flutterToolchainInstall();
        default:
          throw new CaideError(`unhandled preview method: ${method}`, CaideErrorKind.Internal);
      }
    },
    dispose(): void {
      for (const [appDir] of previewWatchers.entries()) {
        stopPreviewWatcher(appDir);
      }
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
