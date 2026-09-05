// FILE: harness/preview/manager.ts
// Real preview lifecycle: spawns the framework's dev server, scans stdout for
// the serve URL, keeps a ring-buffered log per thread, and supports stop/reload.
import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";

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

/** Matches http(s) URLs and exp:// (Expo) URLs in dev-server output. */
const URL_PATTERN = /(https?:\/\/[a-zA-Z0-9._:\[\]-]+|exp:\/\/[a-zA-Z0-9._:-]+)/;

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
  const devCommand = framework?.devCommand;
  if (!devCommand) {
    throw new Error(`No dev command configured for this framework`);
  }
  // env with an optional explicit port
  const env = { ...process.env };
  if (input.port) env.CAIDE_PREVIEW_PORT = String(input.port);

  const child = spawn(devCommand, { cwd: appDir, shell: true, env });
  const session: PreviewSession = {
    threadId: input.threadId,
    process: child,
    url: "",
    kind: "web",
    logs: [],
    appDir,
  };
  sessions.set(input.threadId, session);

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
          const isNative = url.startsWith("exp://") || /flutter|emulator|simulator/i.test(line);
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

function getFrameworkConfigForAppDir(appDir?: string) {
  // Detects the framework from the workspace files when not explicitly known.
  // Priority: .caide/framework.json (written by scaffold) -> pubspec.yaml -> package.json deps -> blank.
  // For blank framework devCommand is "" and startPreview will throw explicitly (M16: "Preview not available").
  if (!appDir) return getFrameworkConfig("website");
  try {
    const frameworkJsonPath = `${appDir}/.caide/framework.json`;
    if (fs.existsSync(frameworkJsonPath)) {
      const parsed = JSON.parse(fs.readFileSync(frameworkJsonPath, "utf-8")) as Record<
        string,
        unknown
      >;
      const fw = String(parsed.framework ?? "").toLowerCase();
      if (fw === "react-native" || fw === "flutter" || fw === "website" || fw === "blank") {
        return getFrameworkConfig(fw as any);
      }
    }
    if (fs.existsSync(`${appDir}/pubspec.yaml`)) return getFrameworkConfig("flutter");
    const pkgPath = `${appDir}/package.json`;
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
      const deps = {
        ...((pkg.dependencies ?? {}) as Record<string, unknown>),
        ...((pkg.devDependencies ?? {}) as Record<string, unknown>),
      };
      if (deps.expo || deps["react-native"] || deps["expo-status-bar"]) {
        return getFrameworkConfig("react-native");
      }
      // Any package.json without RN deps is treated as website (Vite+React)
      return getFrameworkConfig("website");
    }
  } catch {
    // ignore — fall through to blank
  }
  return getFrameworkConfig("blank");
}
