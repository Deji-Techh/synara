// FILE: harness/preview/manager.ts
// Real preview lifecycle: spawns the framework's dev server, scans stdout for
// the serve URL, keeps a ring-buffered log per thread, and supports stop/reload.
import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ProjectFramework } from "@caide/contracts";

import { getFrameworkConfig } from "../framework/registry.ts";
import { getThreadWorkspaceCwd } from "../../harnessCompat.ts";

export interface PreviewSession {
  threadId: string;
  process: ChildProcess;
  url: string;
  kind: "web" | "native";
  logs: string[];
  appDir: string;
  /** True when spawned with a LAN-bound command (serves phones on the same WiFi). */
  lan: boolean;
  /** Spawn epoch ms; readyAt set when the URL resolves (cold-start metric). */
  startedAt: number;
  readyAt?: number;
  /** Last reload request epoch ms. */
  lastReloadAt?: number;
}

const MAX_LOGS = 500;
const MAX_LOG_LEN = 4096;
// First boot compiles the web bundle (Expo Metro for RN) — aligned with the
// open_preview tool timeout (90s) so slow first runs don't false-fail.
const START_TIMEOUT_MS = 90_000;

const sessions = new Map<string, PreviewSession>();

/** Strips ANSI color codes dev servers emit even with NO_COLOR set. */
const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;

/** Matches http(s) URLs in dev-server output. */
const URL_PATTERN = /(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|[a-zA-Z0-9._-]+)(?::\d+)?(?:\/[^\s]*)?)/;

/** Output shapes emitted when the dev-server port is already taken. */
export const PORT_CONFLICT_PATTERN =
  /EADDRINUSE|address already in use|port .* already in use|is already running on|is running .* in another window|use port \d+ instead|use a different port/i;

/**
 * Extracts a renderable preview URL from one dev-server output line.
 * Handles Expo/Metro phrasing ("Web is waiting on http://…") and rewrites
 * 0.0.0.0 to localhost (unroutable as an iframe src). Returns null when the
 * line carries no usable http(s) URL (e.g. exp:// deep links).
 */
export function extractPreviewUrl(line: string): string | null {
  const cleaned = line.replace(ANSI_PATTERN, "");
  const match = cleaned.match(URL_PATTERN);
  if (!match?.[1]) return null;
  return normalizePreviewUrl(match[1]);
}

/** Rewrites wildcard-host URLs to localhost and trims trailing punctuation. */
export function normalizePreviewUrl(url: string): string {
  return url.replace("://0.0.0.0", "://localhost").replace(/[.,;:!?]+$/, "");
}

function pushLog(session: PreviewSession, line: string) {
  const trimmed = line.slice(0, MAX_LOG_LEN);
  session.logs.push(trimmed);
  if (session.logs.length > MAX_LOGS) session.logs.splice(0, session.logs.length - MAX_LOGS);
}

export function getPreviewState(threadId: string): {
  running: boolean;
  url: string;
  logs: string[];
  kind?: "web" | "native";
  coldStartMs?: number;
  lastReloadAt?: number;
} {
  const session = sessions.get(threadId);
  if (!session || session.process.exitCode !== null) {
    return { running: false, url: "", logs: [] };
  }
  return {
    running: true,
    url: session.url,
    logs: [...session.logs],
    kind: session.kind,
    ...(session.readyAt !== undefined && session.startedAt
      ? { coldStartMs: Math.max(0, session.readyAt - session.startedAt) }
      : {}),
    ...(session.lastReloadAt !== undefined ? { lastReloadAt: session.lastReloadAt } : {}),
  };
}

function ensureNodeModulesBinSymlinks(appDir: string): void {
  const nodeModulesPath = path.join(appDir, "node_modules");
  if (!fs.existsSync(nodeModulesPath)) return;

  const binDir = path.join(nodeModulesPath, ".bin");
  if (!fs.existsSync(binDir)) {
    try {
      fs.mkdirSync(binDir, { recursive: true });
    } catch {}
  }

  const packagesToCheck: { pkgName: string; dir: string }[] = [];
  try {
    const entries = fs.readdirSync(nodeModulesPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith("@")) {
        const scopeDir = path.join(nodeModulesPath, entry.name);
        try {
          const scopedEntries = fs.readdirSync(scopeDir, { withFileTypes: true });
          for (const se of scopedEntries) {
            if (se.isDirectory()) {
              packagesToCheck.push({
                pkgName: `${entry.name}/${se.name}`,
                dir: path.join(scopeDir, se.name),
              });
            }
          }
        } catch {}
      } else if (!entry.name.startsWith(".")) {
        packagesToCheck.push({
          pkgName: entry.name,
          dir: path.join(nodeModulesPath, entry.name),
        });
      }
    }
  } catch {}

  for (const { dir } of packagesToCheck) {
    const pkgJsonPath = path.join(dir, "package.json");
    if (!fs.existsSync(pkgJsonPath)) continue;
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
      if (!pkg.bin) continue;

      const bins: Record<string, string> =
        typeof pkg.bin === "string"
          ? { [path.basename(pkg.name)]: pkg.bin }
          : typeof pkg.bin === "object" && pkg.bin !== null
            ? pkg.bin
            : {};

      for (const [binName, relBinPath] of Object.entries(bins)) {
        const targetFile = path.resolve(dir, relBinPath);
        const linkPath = path.join(binDir, binName);
        if (fs.existsSync(targetFile)) {
          try {
            fs.chmodSync(targetFile, 0o755);
          } catch {}
          if (!fs.existsSync(linkPath)) {
            try {
              const relTarget = path.relative(binDir, targetFile);
              fs.symlinkSync(relTarget, linkPath);
            } catch {
              try {
                fs.copyFileSync(targetFile, linkPath);
                fs.chmodSync(linkPath, 0o755);
              } catch {}
            }
          }
        }
      }
    } catch {}
  }
}

function ensureWsCompatibility(appDir: string): void {
  const wsIndexPath = path.join(appDir, "node_modules", "ws", "index.js");
  if (!fs.existsSync(wsIndexPath)) return;

  try {
    const content = fs.readFileSync(wsIndexPath, "utf-8");
    if (!content.includes("WebSocketServer")) {
      const patched = content.replace(
        /WebSocket\.Server\s*=\s*require\(['"]\.\/lib\/websocket-server['"]\);?/,
        (match) => `${match}\nWebSocket.WebSocketServer = WebSocket.Server;`,
      );
      if (patched !== content) {
        fs.writeFileSync(wsIndexPath, patched, "utf-8");
      }
    }
  } catch {}
}

function resolveDevCommand(appDir: string, defaultCmd: string, lan = false): string {
  const pkgPath = path.join(appDir, "package.json");
  if (!fs.existsSync(pkgPath)) return defaultCmd;

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const scripts = (pkg.scripts || {}) as Record<string, string>;
    const deps = {
      ...((pkg.dependencies || {}) as Record<string, string>),
      ...((pkg.devDependencies || {}) as Record<string, string>),
    };

    if (deps.expo || deps["react-native"]) {
      // Expo binds all interfaces by default — same command serves LAN.
      if (scripts.web) {
        return "npm run web";
      }
      return "npx --yes expo start --web";
    }

    if (scripts.dev) {
      // Vite needs an explicit host flag to serve LAN phones.
      if (lan && (deps.vite || deps["@vitejs/plugin-react"])) {
        return "npm run dev -- --host 0.0.0.0";
      }
      return "npm run dev";
    }
  } catch {}

  return defaultCmd;
}

async function ensureDependenciesInstalled(
  appDir: string,
  onLog: (line: string) => void,
): Promise<void> {
  const pkgPath = path.join(appDir, "package.json");
  if (!fs.existsSync(pkgPath)) return;

  const nodeModulesPath = path.join(appDir, "node_modules");
  if (fs.existsSync(nodeModulesPath)) {
    ensureNodeModulesBinSymlinks(appDir);
    ensureWsCompatibility(appDir);
    return;
  }

  onLog("[preview] Missing node_modules detected. Installing project dependencies...");

  let cmd = "bun";
  let args = ["install"];

  const hasBunLock =
    fs.existsSync(path.join(appDir, "bun.lock")) || fs.existsSync(path.join(appDir, "bun.lockb"));
  const hasPnpmLock = fs.existsSync(path.join(appDir, "pnpm-lock.yaml"));
  const hasYarnLock = fs.existsSync(path.join(appDir, "yarn.lock"));
  const hasNpmLock = fs.existsSync(path.join(appDir, "package-lock.json"));

  if (hasBunLock) {
    cmd = "bun";
    args = ["install"];
  } else if (hasPnpmLock) {
    cmd = "pnpm";
    args = ["install"];
  } else if (hasYarnLock) {
    cmd = "yarn";
    args = ["install"];
  } else if (hasNpmLock) {
    cmd = "npm";
    args = ["install", "--no-audit", "--no-fund"];
  } else {
    try {
      const { execSync } = await import("node:child_process");
      execSync("bun --version", { stdio: "ignore" });
    } catch {
      cmd = "npm";
      args = ["install", "--no-audit", "--no-fund"];
    }
  }

  onLog(`[preview] Running: ${cmd} ${args.join(" ")} in ${appDir}`);

  await new Promise<void>((resolve, reject) => {
    const installProc = spawn(cmd, args, {
      cwd: appDir,
      shell: true,
      env: { ...process.env, CI: "1", NO_COLOR: "1" },
    });

    installProc.stdout?.on("data", (d) => {
      for (const line of d.toString().split("\n")) {
        if (line.trim()) onLog(`[install] ${line.trim()}`);
      }
    });

    installProc.stderr?.on("data", (d) => {
      for (const line of d.toString().split("\n")) {
        if (line.trim()) onLog(`[install] ${line.trim()}`);
      }
    });

    const timeout = setTimeout(() => {
      installProc.kill("SIGKILL");
      reject(new Error("Dependency installation timed out after 120s"));
    }, 120_000);

    installProc.on("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        onLog("[preview] Dependencies installed successfully.");
        ensureNodeModulesBinSymlinks(appDir);
        ensureWsCompatibility(appDir);
        resolve();
      } else {
        reject(new Error(`Dependency installation failed with code ${code}`));
      }
    });
  });
}

export async function startPreview(input: {
  threadId: string;
  appDir?: string;
  port?: number;
  hostname?: string;
  device?: string;
  /** Spawn with a LAN-bound command so phones on the same WiFi can load it. */
  lan?: boolean;
}): Promise<{ url: string; kind?: "web" | "native" }> {
  const wantLan = input.lan === true;
  const existing = sessions.get(input.threadId);
  if (existing && existing.process.exitCode === null) {
    // A localhost-bound session also serves loopback after a LAN restart, but
    // a LAN session always satisfies plain requests — reuse when compatible.
    if (!wantLan || existing.lan) {
      return { url: existing.url, kind: existing.kind };
    }
    await stopPreview(input.threadId);
  }

  let appDir = input.appDir;
  if (!appDir || appDir === process.cwd()) {
    const threadCwd = getThreadWorkspaceCwd(input.threadId);
    if (threadCwd && threadCwd !== process.cwd() && fs.existsSync(threadCwd)) {
      appDir = threadCwd;
    } else {
      appDir = appDir ?? process.cwd();
    }
  }

  const framework = getFrameworkConfigForAppDir(appDir);
  const rawDevCommand = wantLan
    ? (framework?.lanDevCommand || framework?.devCommand)
    : framework?.devCommand;
  if (!rawDevCommand) {
    throw new Error(`No dev command configured for this framework`);
  }
  const devCommand = resolveDevCommand(appDir, rawDevCommand, wantLan);

  // Pre-register session so installation logs can be streamed and viewed immediately
  const initialLogs: string[] = [];
  const dummyProcess = { exitCode: null, kill: () => false } as unknown as ChildProcess;
  const session: PreviewSession = {
    threadId: input.threadId,
    process: dummyProcess,
    url: "",
    kind: "web",
    logs: initialLogs,
    appDir,
    lan: wantLan,
    startedAt: Date.now(),
  };
  sessions.set(input.threadId, session);

  // Auto-install dependencies if package.json exists and node_modules is missing
  await ensureDependenciesInstalled(appDir, (line) => pushLog(session, line));

  // NOTE: bare __dirname is not defined in the packaged ESM bundle (it threw
  // ReferenceError in the AppImage) — follow the codebase convention and use
  // import.meta.dirname. Missing file simply disables the preload (existsSync).
  const compatPreloadPath = path.join(import.meta.dirname ?? "", "compatPreload.cjs");
  const nodeOptions = [
    process.env.NODE_OPTIONS || "",
    fs.existsSync(compatPreloadPath) ? `-r ${compatPreloadPath}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const binPath = path.join(appDir, "node_modules", ".bin");
  const envPath = process.env.PATH ? `${binPath}:${process.env.PATH}` : binPath;

  // env with an optional explicit port, suppressing external browser launch
  const env: Record<string, string | undefined> = {
    ...process.env,
    PATH: envPath,
    NODE_OPTIONS: nodeOptions || undefined,
    BROWSER: "none",
    CI: "1",
    EXPO_NO_BROWSER: "1",
    NO_COLOR: "1",
  };
  if (input.port) env.CAIDE_PREVIEW_PORT = String(input.port);

  const child = spawn(devCommand, { cwd: appDir, shell: true, env });
  session.process = child;

  let resolvedUrl: string | null = null;
  let failed = false;
  const urlPromise = new Promise<{ url: string; kind: "web" | "native" }>((resolve, reject) => {
    const fail = (message: string) => {
      if (resolvedUrl || failed) return;
      failed = true;
      clearTimeout(timeout);
      reject(new Error(message));
    };
    const timeout = setTimeout(() => {
      fail(`Preview did not report a URL within ${START_TIMEOUT_MS / 1000}s`);
    }, START_TIMEOUT_MS);

    const onData = (data: Buffer) => {
      const text = data.toString();
      for (const line of text.split("\n")) {
        if (line) pushLog(session, line);
        if (resolvedUrl || failed) continue;
        // A manually-started dev server holding the port (e.g. `npx expo start
        // --web` in the user's terminal) makes the managed server hang on an
        // interactive prompt or die — fail fast with guidance instead of
        // burning the whole start timeout on silence.
        if (PORT_CONFLICT_PATTERN.test(line)) {
          fail(
            "Preview port is already in use — stop the manually-started dev server in your terminal (e.g. the running `npx expo start --web`), then press Retry",
          );
          continue;
        }
        const url = extractPreviewUrl(line);
        if (url) {
          resolvedUrl = url;
          session.kind = "web";
          session.url = url;
          session.readyAt = Date.now();
          clearTimeout(timeout);
          resolve({ url, kind: session.kind });
        }
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("exit", (code) => {
      fail(`Preview process exited (code ${code}) before reporting a URL`);
    });
  });

  try {
    return await urlPromise;
  } catch (err) {
    // Keep the log tail on the error so the preview pane's failed state shows
    // actionable output (missing deps, port in use, bundler error) instead of
    // a bare timeout — the #1 cause of "blank white preview" reports.
    // Structured boot findings (Metro/Flutter/Expo) lead when present.
    const tail = session.logs.slice(-15).join("\n");
    sessions.delete(input.threadId);
    child.kill("SIGTERM");
    const { parseBootErrors } = await import("./buildRunner.ts");
    const structured = parseBootErrors(session.logs.join("\n")).slice(0, 5);
    const structuredBlock =
      structured.length > 0
        ? `\nStructured findings:\n${structured
            .map((e) => `- ${e.file ? `${e.file}${e.line ? `:${e.line}` : ""} — ` : ""}${e.message}`)
            .join("\n")}`
        : "";
    if (err instanceof Error && tail && !err.message.includes("Recent output")) {
      throw new Error(`${err.message}.${structuredBlock}\nRecent output:\n${tail}`);
    }
    throw err;
  }
}

export async function stopPreview(threadId: string): Promise<boolean> {
  const session = sessions.get(threadId);
  if (!session) return false;
  session.process.kill("SIGTERM");
  sessions.delete(threadId);
  return true;
}

/**
 * Resolves the LAN URL a phone on the same WiFi can open for this thread's
 * preview (used by the QR branch). Requires a running preview — restarts it
 * with a LAN-bound command when needed (loopback keeps working: binding
 * 0.0.0.0 / Expo's default also serves localhost, so the desktop pane is
 * unaffected). Throws a human-readable error when there is nothing to share.
 */
export async function getMobilePreviewUrl(input: {
  threadId: string;
  appDir?: string;
}): Promise<{ lanUrl: string; lanIp: string; restarted: boolean }> {
  const { getLanAddress, toLanUrl } = await import("./lanAddress.ts");
  const lanIp = getLanAddress();
  if (!lanIp) {
    throw new Error("No LAN address detected — connect this machine to WiFi first.");
  }
  let session = sessions.get(input.threadId);
  if (!session || session.process.exitCode !== null || !session.url) {
    throw new Error("Start the preview first, then open the phone QR again.");
  }
  let restarted = false;
  if (!session.lan) {
    await stopPreview(input.threadId);
    const { url } = await startPreview({
      threadId: input.threadId,
      appDir: input.appDir ?? session.appDir,
      lan: true,
    });
    restarted = true;
    session = sessions.get(input.threadId);
    if (!session || !url) {
      throw new Error("Preview restarted for LAN but reported no URL.");
    }
  }
  const lanUrl = toLanUrl(session.url, lanIp) ?? session.url;
  return { lanUrl, lanIp, restarted };
}

export function reloadPreview(threadId: string): boolean {
  const session = sessions.get(threadId);
  if (!session || session.process.exitCode !== null) return false;
  // A SIGUSR2 is the conventional "reload" for dev servers that support it;
  // for others this is a no-op that reports true so the UI clears the spinner.
  // The request instant is recorded for reload-latency diagnostics.
  session.lastReloadAt = Date.now();
  try {
    session.process.kill("SIGUSR2");
  } catch {
    // ignore — process may be gone
  }
  return true;
}

export function detectFrameworkForAppDir(appDir?: string): {
  framework: ProjectFramework;
  title: string;
} {
  // Detects framework and project title from workspace files.
  // Priority: .caide/framework.json -> pubspec.yaml (Flutter) -> package.json (RN if expo/react-native, else Website) -> blank.
  if (!appDir) return { framework: "website", title: "App" };
  const baseTitle = path.basename(appDir) || "App";
  try {
    const frameworkJsonPath = path.join(appDir, ".caide", "framework.json");
    if (fs.existsSync(frameworkJsonPath)) {
      const parsed = JSON.parse(fs.readFileSync(frameworkJsonPath, "utf-8")) as Record<
        string,
        unknown
      >;
      const fw = String(parsed.framework ?? "").toLowerCase();
      if (fw === "react-native" || fw === "flutter" || fw === "website" || fw === "blank") {
        return {
          framework: fw as ProjectFramework,
          title: (typeof parsed.title === "string" && parsed.title.trim()) || baseTitle,
        };
      }
    }
    const pubspecPath = path.join(appDir, "pubspec.yaml");
    if (fs.existsSync(pubspecPath)) {
      const content = fs.readFileSync(pubspecPath, "utf-8");
      const nameMatch = content.match(/^name:\s*([^\s#]+)/m);
      return {
        framework: "flutter",
        title: nameMatch?.[1] || baseTitle,
      };
    }
    const pkgPath = path.join(appDir, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
      const pkgName = typeof pkg.name === "string" ? pkg.name.trim() : "";
      const deps = {
        ...((pkg.dependencies ?? {}) as Record<string, unknown>),
        ...((pkg.devDependencies ?? {}) as Record<string, unknown>),
      };
      if (deps.expo || deps["react-native"] || deps["expo-status-bar"]) {
        return {
          framework: "react-native",
          title: pkgName || baseTitle,
        };
      }
      return {
        framework: "website",
        title: pkgName || baseTitle,
      };
    }
  } catch {
    // ignore — fall through to blank
  }
  return {
    framework: "blank",
    title: baseTitle,
  };
}

export function getFrameworkConfigForAppDir(appDir?: string) {
  const detected = detectFrameworkForAppDir(appDir);
  return getFrameworkConfig(detected.framework);
}
