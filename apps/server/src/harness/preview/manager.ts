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
}

const MAX_LOGS = 500;
const MAX_LOG_LEN = 4096;
const START_TIMEOUT_MS = 60_000;

const sessions = new Map<string, PreviewSession>();

/** Matches http(s) URLs in dev-server output. */
const URL_PATTERN = /(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|[a-zA-Z0-9._-]+)(?::\d+)?(?:\/[^\s]*)?)/;

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
} {
  const session = sessions.get(threadId);
  if (!session || session.process.exitCode !== null) {
    return { running: false, url: "", logs: [] };
  }
  return { running: true, url: session.url, logs: [...session.logs], kind: session.kind };
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

function resolveDevCommand(appDir: string, defaultCmd: string): string {
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
      if (scripts.web) {
        return "npm run web";
      }
      return "npx --yes expo start --web";
    }

    if (scripts.dev) {
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
}): Promise<{ url: string; kind?: "web" | "native" }> {
  const existing = sessions.get(input.threadId);
  if (existing && existing.process.exitCode === null) {
    return { url: existing.url, kind: existing.kind };
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
  const rawDevCommand = framework?.devCommand;
  if (!rawDevCommand) {
    throw new Error(`No dev command configured for this framework`);
  }
  const devCommand = resolveDevCommand(appDir, rawDevCommand);

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
  };
  sessions.set(input.threadId, session);

  // Auto-install dependencies if package.json exists and node_modules is missing
  await ensureDependenciesInstalled(appDir, (line) => pushLog(session, line));

  const compatPreloadPath = path.join(__dirname, "compatPreload.cjs");
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
  const urlPromise = new Promise<{ url: string; kind: "web" | "native" }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (!resolvedUrl) {
        reject(new Error(`Preview did not report a URL within ${START_TIMEOUT_MS / 1000}s`));
      }
    }, START_TIMEOUT_MS);

    const onData = (data: Buffer) => {
      const text = data.toString();
      for (const line of text.split("\n")) {
        if (line) pushLog(session, line);
        const m = line.match(URL_PATTERN);
        if (m && m[1] && !resolvedUrl) {
          const url = m[1];
          resolvedUrl = url;
          const isNative = !url.startsWith("http://") && !url.startsWith("https://");
          session.kind = isNative ? "native" : "web";
          session.url = url;
          clearTimeout(timeout);
          resolve({ url, kind: session.kind });
        }
      }
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("exit", (code) => {
      if (!resolvedUrl) {
        clearTimeout(timeout);
        reject(new Error(`Preview process exited (code ${code}) before reporting a URL`));
      }
    });
  });

  try {
    return await urlPromise;
  } catch (err) {
    sessions.delete(input.threadId);
    child.kill("SIGTERM");
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

export function reloadPreview(threadId: string): boolean {
  const session = sessions.get(threadId);
  if (!session || session.process.exitCode !== null) return false;
  // A SIGUSR2 is the conventional "reload" for dev servers that support it;
  // for others this is a no-op that reports true so the UI clears the spinner.
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
