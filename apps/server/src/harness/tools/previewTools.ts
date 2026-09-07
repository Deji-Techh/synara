// FILE: previewTools.ts
// Purpose: Agent-autonomous preview control — the agent opens, restarts,
// inspects, and stops the preview itself (no manual / command needed), and
// builds installable debug APKs. Wraps harness/preview/manager.ts.
// Donor pattern: dyad restart/reinstall + native_release debug-apk flow
// (debug signing only — release signing stays a human-gated action).

import * as fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { defineTool, type ToolDef } from "./defineTool.ts";

const execFileAsync = promisify(execFile);

function detectFramework(appPath: string): string {
  try {
    const fj = `${appPath}/.caide/framework.json`;
    if (fs.existsSync(fj)) {
      const p = JSON.parse(fs.readFileSync(fj, "utf-8")) as Record<string, unknown>;
      const fw = String(p.framework ?? "").toLowerCase();
      if (fw === "react-native" || fw === "flutter" || fw === "website" || fw === "blank") {
        return fw;
      }
    }
    if (fs.existsSync(`${appPath}/pubspec.yaml`)) return "flutter";
    if (fs.existsSync(`${appPath}/package.json`)) {
      const pkg = JSON.parse(fs.readFileSync(`${appPath}/package.json`, "utf-8")) as Record<
        string,
        unknown
      >;
      const deps = {
        ...((pkg.dependencies ?? {}) as Record<string, unknown>),
        ...((pkg.devDependencies ?? {}) as Record<string, unknown>),
      };
      if (deps.expo || deps["react-native"]) return "react-native";
      return "website";
    }
  } catch {
    // fall through to blank
  }
  return "blank";
}

// 1. open_preview — start the dev preview autonomously (idempotent)
export const openPreviewTool = defineTool({
  name: "open_preview",
  description:
    "Starts the app preview for this thread (RN: expo, Flutter: web-server build, Website: dev server) and returns { url, kind }. Idempotent — returns the running session if one exists. Call this yourself after building a slice to verify visually; do NOT ask the user to open it manually. Blank projects have no preview.",
  schema: z.object({
    port: z.number().int().positive().max(65535).optional().describe("Preferred port"),
  }),
  readOnly: false,
  modifiesState: true,
  timeoutMs: 90_000,
  execute: async ({ port }, ctx) => {
    const framework = detectFramework(ctx.appPath);
    if (framework === "blank") {
      return { started: false, url: null, framework, reason: "Preview not available for Blank projects" };
    }
    const { startPreview } = await import("../preview/manager.ts");
    const { url, kind } = await startPreview({
      threadId: ctx.sessionId,
      appDir: ctx.appPath,
      port,
    });
    return { started: true, url, kind, framework };
  },
  presentCall: () => "Open preview",
});

// 2. restart_preview — stop + start (picks up config/native changes)
export const restartPreviewTool = defineTool({
  name: "restart_preview",
  description:
    "Restarts the app preview (stop + start). Use after dependency installs, config changes, or native-layer edits that hot-reload cannot pick up.",
  schema: z.object({}),
  readOnly: false,
  modifiesState: true,
  timeoutMs: 120_000,
  execute: async (_, ctx) => {
    const { stopPreview, startPreview } = await import("../preview/manager.ts");
    await stopPreview(ctx.sessionId);
    const { url, kind } = await startPreview({ threadId: ctx.sessionId, appDir: ctx.appPath });
    return { restarted: true, url, kind };
  },
  presentCall: () => "Restart preview",
});

// 3. preview_status — running state + recent dev-server logs
export const previewStatusTool = defineTool({
  name: "preview_status",
  description:
    "Returns the preview session state { running, url, kind } plus the last dev-server log lines. Use to diagnose a preview that fails to load before restarting it.",
  schema: z.object({
    tail: z.number().int().positive().max(100).default(30).describe("Log lines to return"),
  }),
  readOnly: true,
  modifiesState: false,
  execute: async ({ tail }, ctx) => {
    const { getPreviewState } = await import("../preview/manager.ts");
    const state = getPreviewState(ctx.sessionId);
    return { ...state, logs: state.logs.slice(-tail) };
  },
  presentCall: () => "Check preview status",
});

// 4. stop_preview — free the dev server (end of session / port conflicts)
export const stopPreviewTool = defineTool({
  name: "stop_preview",
  description: "Stops the app preview dev server for this thread. Use at session end or to resolve port conflicts before reopening.",
  schema: z.object({}),
  readOnly: false,
  modifiesState: true,
  execute: async (_, ctx) => {
    const { stopPreview } = await import("../preview/manager.ts");
    const stopped = await stopPreview(ctx.sessionId);
    return { stopped };
  },
  presentCall: () => "Stop preview",
});

// 5. build_apk — installable debug APK (debug signing only)
export const buildApkTool = defineTool({
  name: "build_apk",
  description:
    "Builds an installable DEBUG APK. Flutter: `flutter build apk --debug`. React Native: `gradlew assembleDebug` (requires android/ from `npx expo prebuild` — errors with that guidance otherwise). Website/Blank: not applicable (structured error, not a crash). Debug signing only; release signing stays human-gated. Long-running (up to 10 min), abortable.",
  schema: z.object({}),
  readOnly: false,
  modifiesState: true,
  timeoutMs: 600_000,
  execute: async (_, ctx) => {
    const framework = detectFramework(ctx.appPath);
    if (framework === "flutter") {
      try {
        const { stdout, stderr } = await execFileAsync("flutter", ["build", "apk", "--debug"], {
          cwd: ctx.appPath,
          signal: ctx.signal,
          maxBuffer: 20 * 1024 * 1024,
          timeout: 590_000,
        });
        return { success: true, framework, stdout: stdout.slice(-8000), stderr: stderr.slice(-4000) };
      } catch (e: any) {
        return {
          success: false,
          framework,
          error: e.message ?? String(e),
          stdout: (e.stdout ?? "").slice(-8000),
          stderr: (e.stderr ?? "").slice(-4000),
        };
      }
    }
    if (framework === "react-native") {
      const gradlew = `${ctx.appPath}/android/gradlew${process.platform === "win32" ? ".bat" : ""}`;
      if (!fs.existsSync(gradlew)) {
        return {
          success: false,
          framework,
          error:
            "No android/ project found. Run `npx expo prebuild` first to generate native shells, then call build_apk again.",
        };
      }
      try {
        const { stdout, stderr } = await execFileAsync(
          gradlew,
          ["assembleDebug", "--offline"],
          {
            cwd: `${ctx.appPath}/android`,
            signal: ctx.signal,
            maxBuffer: 20 * 1024 * 1024,
            timeout: 590_000,
          },
        );
        return { success: true, framework, stdout: stdout.slice(-8000), stderr: stderr.slice(-4000) };
      } catch (e: any) {
        return {
          success: false,
          framework,
          error: e.message ?? String(e),
          stdout: (e.stdout ?? "").slice(-8000),
          stderr: (e.stderr ?? "").slice(-4000),
        };
      }
    }
    return {
      success: false,
      framework,
      error:
        framework === "blank"
          ? "No build for Blank projects."
          : "APK output applies to mobile frameworks only; use build_project for Website.",
    };
  },
  presentCall: () => "Build debug APK",
});

// 6. read_logs — donor read_logs schema/filters over the preview console.
// Donor description kept verbatim; source adapted: Dyad reads the Electron
// log store (client/server/edge/network); Caide reads the thread's preview
// dev-server console (string lines), so type filters other than server/all
// and level filters apply as case-insensitive matches over the lines.
const readLogsSchema = z.object({
  type: z
    .enum(["all", "client", "server", "edge-function", "network-requests"])
    .optional()
    .describe(
      "Filter by log source type (default: all). The preview console carries dev-server output ('server'); other types match lines mentioning the source.",
    ),
  level: z
    .enum(["all", "info", "warn", "error"])
    .optional()
    .describe("Filter by log level (default: all)"),
  searchTerm: z
    .string()
    .optional()
    .describe("Search for logs containing this text (case-insensitive)"),
  limit: z
    .number()
    .min(1)
    .max(200)
    .optional()
    .describe("Maximum number of logs to return (default: 50, max: 200)"),
});

function truncateLogMessage(message: string, maxLength: number = 1000): string {
  if (message.length <= maxLength) return message;
  const lines = message.split("\n");
  if (lines.some((line) => line.startsWith("    at "))) {
    return `${lines[0]}\n${lines.filter((l) => l.startsWith("    at ")).slice(0, 5).join("\n")}\n... [stack trace truncated]`;
  }
  const half = Math.floor((maxLength - 20) / 2);
  return `${message.slice(0, half)}\n... [truncated] ...\n${message.slice(-half)}`;
}

export const readLogsTool = defineTool({
  name: "read_logs",
  description:
    "Read logs at the moment this tool is called. Includes client logs, server logs, edge function logs, and network requests. Use this to debug errors, investigate issues, or understand app behavior. IMPORTANT: Logs are a snapshot from when you call this tool - they will NOT update while you are writing code or making changes. Use filters (searchTerm, type, level) to narrow down relevant logs on the first call.",
  schema: readLogsSchema,
  readOnly: true,
  modifiesState: false,
  execute: async (args, ctx) => {
    const parsed = readLogsSchema.parse(args);
    const { getPreviewState } = await import("../preview/manager.ts");
    const state = getPreviewState(ctx.sessionId);
    if (!state.running && state.logs.length === 0) {
      return "No preview console logs: the preview is not running for this thread. Start it with open_preview first.";
    }
    const type = parsed.type ?? "all";
    const level = parsed.level ?? "all";
    const query = parsed.searchTerm?.toLowerCase();
    const limit = parsed.limit ?? 50;
    const levelWords: Record<string, string[]> = {
      // Substring matches (no "log": it over-matches dialog/login/catalog).
      info: ["info"],
      warn: ["warn", "warning"],
      error: ["error", "exception", "failed", "failure", "eaddrinuse"],
    };
    const filtered = state.logs.filter((line) => {
      const lower = line.toLowerCase();
      if (query && !lower.includes(query)) return false;
      if (type !== "all" && type !== "server" && !lower.includes(type.replace("-", " "))) return false;
      if (level !== "all" && !(levelWords[level] ?? []).some((w) => lower.includes(w))) return false;
      return true;
    });
    const tail = filtered.slice(-limit).map((l) => truncateLogMessage(l));
    return `Found ${tail.length} log${tail.length === 1 ? "" : "s"} (preview console, snapshot):\n\n${tail.join("\n")}`;
  },
  presentCall: () => "Read preview logs",
});

// 7. restart_app — donor restart_app over the Caide preview runtime.
// Donor schema + description + consent kept verbatim; the Electron
// app-run actor is replaced by preview stop + start for this thread.
export const restartAppTool = defineTool({
  name: "restart_app",
  description:
    "Restart the current app's development server without reinstalling dependencies. Use only when the user explicitly asks, the server is stopped/unresponsive/stale, a process-boundary change requires it (such as dev-server config, startup scripts, environment variables, or server initialization), or diagnostics explicitly require it. Do not use after ordinary source/style/asset edits or as routine verification. Finish related edits first and do not repeat it for the same unchanged cause.",
  schema: z.object({}),
  readOnly: false,
  modifiesState: true,
  timeoutMs: 120_000,
  execute: async (_, ctx) => {
    if (ctx.signal?.aborted) {
      throw new Error("The app lifecycle operation was cancelled before it started");
    }
    if (detectFramework(ctx.appPath) === "blank") {
      throw new Error("restart_app does not apply to Blank projects (no preview to restart).");
    }
    const { stopPreview, startPreview } = await import("../preview/manager.ts");
    await stopPreview(ctx.sessionId);
    const { url, kind } = await startPreview({ threadId: ctx.sessionId, appDir: ctx.appPath });
    return `The app restarted successfully (preview ${kind} at ${url}).`;
  },
  presentCall: () => "Restart the current app",
});

// 8. reinstall_and_restart_app — donor reinstall flow over Caide preview.
// Donor schema + description + consent kept verbatim; dependency reinstall
// is framework-aware (bun install for website/RN, flutter pub get).
export const reinstallAndRestartAppTool = defineTool({
  name: "reinstall_and_restart_app",
  description:
    "Delete node_modules, reinstall dependencies, and restart the current app's development server. Use only when the user explicitly asks to reinstall dependencies, node_modules is missing/incomplete, dependency installation or package/lockfile/native-module state is demonstrably broken or stale, or diagnostics explicitly recommend it. Never use for ordinary code errors, UI changes, production build verification, or configuration changes that only require a restart. This operation includes a restart: never call both lifecycle tools for the same reason, and do not repeat it for the same unchanged cause.",
  schema: z.object({}),
  readOnly: false,
  modifiesState: true,
  timeoutMs: 600_000,
  execute: async (_, ctx) => {
    if (ctx.signal?.aborted) {
      throw new Error("The app lifecycle operation was cancelled before it started");
    }
    const framework = detectFramework(ctx.appPath);
    if (framework === "blank") {
      throw new Error("reinstall_and_restart_app does not apply to Blank projects (no dependencies, no preview).");
    }
    if (framework === "flutter") {
      // Best-effort clean of stale build outputs, then a strict pub get.
      try {
        await execFileAsync("flutter", ["clean"], {
          cwd: ctx.appPath,
          signal: ctx.signal,
          timeout: 120_000,
          maxBuffer: 4 * 1024 * 1024,
        });
      } catch {
        // ignore — pub get below is the real gate
      }
      try {
        await execFileAsync("flutter", ["pub", "get"], {
          cwd: ctx.appPath,
          signal: ctx.signal,
          timeout: 300_000,
          maxBuffer: 10 * 1024 * 1024,
        });
      } catch (e: any) {
        throw new Error(`flutter pub get failed: ${e?.message ?? String(e)}`);
      }
    } else {
      // Donor parity: broken/stale node_modules is deleted before the
      // reconcile install (guarded to the app dir — never above it).
      const nodeModules = `${ctx.appPath}/node_modules`;
      try {
        await fs.promises.rm(nodeModules, { recursive: true, force: true });
      } catch (e: any) {
        throw new Error(`Could not remove node_modules: ${e?.message ?? String(e)}`);
      }
      try {
        await execFileAsync("bun", ["install"], {
          cwd: ctx.appPath,
          signal: ctx.signal,
          timeout: 300_000,
          maxBuffer: 10 * 1024 * 1024,
        });
      } catch (e: any) {
        throw new Error(`bun install failed: ${e?.message ?? String(e)}`);
      }
    }
    const { stopPreview, startPreview } = await import("../preview/manager.ts");
    await stopPreview(ctx.sessionId);
    const { url, kind } = await startPreview({ threadId: ctx.sessionId, appDir: ctx.appPath });
    return `Dependencies were reinstalled and the app restarted successfully (preview ${kind} at ${url}).`;
  },
  presentCall: () => "Delete node_modules, reinstall dependencies, and restart the current app",
});

export const ALL_PREVIEW_TOOLS: ToolDef[] = [
  openPreviewTool,
  restartPreviewTool,
  previewStatusTool,
  stopPreviewTool,
  buildApkTool,
  readLogsTool,
  restartAppTool,
  reinstallAndRestartAppTool,
];
