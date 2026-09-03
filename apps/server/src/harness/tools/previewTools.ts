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

export const ALL_PREVIEW_TOOLS: ToolDef[] = [
  openPreviewTool,
  restartPreviewTool,
  previewStatusTool,
  stopPreviewTool,
  buildApkTool,
];
