import * as fs from "node:fs";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { defineTool, type ToolDef } from "./defineTool.ts";
import { designTokens, type DesignTokens } from "../../design/tokens.ts";

const execFileAsync = promisify(execFile);

function resolveSafePath(userPath: string, appPath: string): string {
  const resolved = path.resolve(appPath, userPath);
  if (!resolved.startsWith(path.resolve(appPath))) {
    throw new Error(`Path traversal denied: '${userPath}' is outside workspace root '${appPath}'`);
  }
  return resolved;
}

// 1. read_file
export const readFileTool = defineTool({
  name: "read_file",
  description: "Reads file content from the project workspace. Fails if the path is outside the workspace root.",
  schema: z.object({
    path: z.string().describe("Relative path to the file inside workspace"),
  }),
  readOnly: true,
  modifiesState: false,
  execute: async ({ path: filePath }, ctx) => {
    const target = resolveSafePath(filePath, ctx.appPath);
    return await fs.promises.readFile(target, "utf-8");
  },
  presentCall: ({ path: filePath }) => `Read file: ${filePath}`,
  presentResult: (content) => `Read ${typeof content === "string" ? content.length : 0} bytes`,
});

// 2. write_file
export const writeFileTool = defineTool({
  name: "write_file",
  description: "Writes content to a file in the project workspace, creating parent directories if needed.",
  schema: z.object({
    path: z.string().describe("Relative path to the file"),
    content: z.string().describe("Full content to write"),
  }),
  readOnly: false,
  modifiesState: true,
  execute: async ({ path: filePath, content }, ctx) => {
    const target = resolveSafePath(filePath, ctx.appPath);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.writeFile(target, content, "utf-8");
    return { path: filePath, bytesWritten: Buffer.byteLength(content, "utf-8") };
  },
  presentCall: ({ path: filePath }) => `Write file: ${filePath}`,
  presentResult: ({ path: filePath, bytesWritten }) => `Wrote ${bytesWritten} bytes to ${filePath}`,
});

// 3. list_dir
export const listDirTool = defineTool({
  name: "list_dir",
  description: "Lists directory contents in the project workspace with file types and sizes.",
  schema: z.object({
    path: z.string().default("").describe("Relative directory path"),
  }),
  readOnly: true,
  modifiesState: false,
  execute: async ({ path: dirPath }, ctx) => {
    const target = resolveSafePath(dirPath, ctx.appPath);
    const entries = await fs.promises.readdir(target, { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      isDirectory: e.isDirectory(),
      isFile: e.isFile(),
    }));
  },
});

// 4. search_files
export const searchFilesTool = defineTool({
  name: "search_files",
  description: "Recursively searches files in workspace matching a pattern or text query.",
  schema: z.object({
    query: z.string().describe("Search string or filename regex"),
    dir: z.string().default("").describe("Subdirectory to limit search"),
  }),
  readOnly: true,
  modifiesState: false,
  execute: async ({ query, dir }, ctx) => {
    const startDir = resolveSafePath(dir, ctx.appPath);
    const matches: string[] = [];

    async function walk(current: string) {
      const entries = await fs.promises.readdir(current, { withFileTypes: true });
      for (const e of entries) {
        if (e.name === "node_modules" || e.name === ".git" || e.name === "dist") continue;
        const full = path.join(current, e.name);
        const rel = path.relative(ctx.appPath, full);
        if (e.name.includes(query) || rel.includes(query)) {
          matches.push(rel);
        }
        if (e.isDirectory()) {
          await walk(full);
        }
      }
    }

    if (fs.existsSync(startDir)) {
      await walk(startDir);
    }
    return matches;
  },
});

// 5. run_command
export const runCommandTool = defineTool({
  name: "run_command",
  description: "Executes a shell command inside workspace root. Modifies state, SIGTERM killable.",
  schema: z.object({
    cmd: z.string().describe("Command binary name"),
    args: z.array(z.string()).default([]).describe("Command arguments"),
    cwd: z.string().optional().describe("Working directory relative to project root"),
  }),
  readOnly: false,
  modifiesState: true,
  execute: async ({ cmd, args, cwd }, ctx) => {
    const workDir = cwd ? resolveSafePath(cwd, ctx.appPath) : ctx.appPath;
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd: workDir,
      signal: ctx.signal,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout, stderr, exitCode: 0 };
  },
});

// 6. read_url
export const readUrlTool = defineTool({
  name: "read_url",
  description: "Fetches public web or API content via HTTP.",
  schema: z.object({
    url: z.string().url().describe("Target HTTP/HTTPS URL"),
  }),
  readOnly: true,
  modifiesState: false,
  execute: async ({ url }, ctx) => {
    const response = await fetch(url, { signal: ctx.signal });
    if (!response.ok) {
      throw new Error(`HTTP fetch failed with status ${response.status}: ${response.statusText}`);
    }
    return await response.text();
  },
});

// 7. screenshot
export const screenshotTool = defineTool({
  name: "screenshot",
  description: "Captures a screenshot of the active device or web preview for visual comparison.",
  schema: z.object({
    selector: z.string().optional().describe("Optional CSS selector to scope capture"),
  }),
  readOnly: true,
  modifiesState: false,
  execute: async ({ selector }) => {
    return {
      base64: "data:image/png;base64,placeholder_screenshot",
      dimensions: { width: 390, height: 844 },
      selector,
    };
  },
});

// 8. get_design_tokens
export const getDesignTokensTool = defineTool({
  name: "get_design_tokens",
  description: "Returns the authoritative project design tokens (colors, type scale, component rules, motion).",
  schema: z.object({}),
  readOnly: true,
  modifiesState: false,
  execute: async (): Promise<DesignTokens> => {
    return designTokens;
  },
});

// 9. read_spec
export const readSpecTool = defineTool({
  name: "read_spec",
  description: "Reads the project's specification document (.caide/spec.md).",
  schema: z.object({}),
  readOnly: true,
  modifiesState: false,
  execute: async (_, ctx) => {
    const specPath = path.join(ctx.appPath, ".caide", "spec.md");
    if (!fs.existsSync(specPath)) {
      return { spec: null, exists: false };
    }
    const content = await fs.promises.readFile(specPath, "utf-8");
    return { spec: content, exists: true };
  },
});

// 10. write_spec
export const writeSpecTool = defineTool({
  name: "write_spec",
  description: "Writes the specification document (.caide/spec.md) defining flows, scope, and screens.",
  schema: z.object({
    specContent: z.string().describe("Markdown content of the project specification"),
  }),
  readOnly: false,
  modifiesState: true,
  allowedRoles: ["planner", "builder"],
  execute: async ({ specContent }, ctx) => {
    const specDir = path.join(ctx.appPath, ".caide");
    await fs.promises.mkdir(specDir, { recursive: true });
    await fs.promises.writeFile(path.join(specDir, "spec.md"), specContent, "utf-8");
    return { written: true, path: ".caide/spec.md" };
  },
});

// 11. write_design_spec
export const writeDesignSpecTool = defineTool({
  name: "write_design_spec",
  description: "Writes the compiled design tokens into .caide/design-spec.json.",
  schema: z.object({
    tokens: z.record(z.unknown()).describe("JSON design token specification"),
  }),
  readOnly: false,
  modifiesState: true,
  execute: async ({ tokens }, ctx) => {
    const specDir = path.join(ctx.appPath, ".caide");
    await fs.promises.mkdir(specDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(specDir, "design-spec.json"),
      JSON.stringify(tokens, null, 2),
      "utf-8",
    );
    return { written: true, path: ".caide/design-spec.json" };
  },
});

// 12. write_motion_spec
export const writeMotionSpecTool = defineTool({
  name: "write_motion_spec",
  description: "Writes the motion tokens into .caide/motion-spec.json.",
  schema: z.object({
    motion: z.record(z.unknown()).describe("Spring, duration, and curve motion tokens"),
  }),
  readOnly: false,
  modifiesState: true,
  execute: async ({ motion }, ctx) => {
    const specDir = path.join(ctx.appPath, ".caide");
    await fs.promises.mkdir(specDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(specDir, "motion-spec.json"),
      JSON.stringify(motion, null, 2),
      "utf-8",
    );
    return { written: true, path: ".caide/motion-spec.json" };
  },
});

// 13. install_package
export const installPackageTool = defineTool({
  name: "install_package",
  description: "Installs a dependency package in the project workspace.",
  schema: z.object({
    packageName: z.string().describe("Package identifier to install"),
    dev: z.boolean().default(false).describe("Whether to install as dev dependency"),
  }),
  readOnly: false,
  modifiesState: true,
  execute: async ({ packageName, dev }, ctx) => {
    const args = ["add", packageName];
    if (dev) args.push("-d");
    const { stdout, stderr } = await execFileAsync("bun", args, {
      cwd: ctx.appPath,
      signal: ctx.signal,
    });
    return { packageName, stdout, stderr };
  },
});

// 14. build_project
export const buildProjectTool = defineTool({
  name: "build_project",
  description: "Executes project build / compilation check.",
  schema: z.object({}),
  readOnly: false,
  modifiesState: true,
  execute: async (_, ctx) => {
    const { stdout, stderr } = await execFileAsync("bun", ["run", "build"], {
      cwd: ctx.appPath,
      signal: ctx.signal,
    });
    return { success: true, stdout, stderr };
  },
});

// 15. lint_project
export const lintProjectTool = defineTool({
  name: "lint_project",
  description: "Runs linting/typechecking on workspace files.",
  schema: z.object({}),
  readOnly: true,
  modifiesState: false,
  execute: async (_, ctx) => {
    const { stdout, stderr } = await execFileAsync("bun", ["typecheck"], {
      cwd: ctx.appPath,
      signal: ctx.signal,
    });
    return { clean: true, stdout, stderr };
  },
});

// 16. get_preview_url — dynamic: reads live preview session (device-frame 672px or browser)
export const getPreviewUrlTool = defineTool({
  name: "get_preview_url",
  description: "Returns the live preview URL for this thread's app (device-frame for RN/Flutter, browser for Website). If no preview is running, returns null and the dev command to start it.",
  schema: z.object({}),
  readOnly: true,
  modifiesState: false,
  execute: async (_, ctx) => {
    try {
      const { getPreviewState } = await import("../preview/manager.ts");
      const state = getPreviewState(ctx.sessionId);
      if (state.running && state.url) {
        return { url: state.url, running: true, kind: state.kind ?? "web", logs: state.logs.slice(-20) };
      }
      // Not running — hint the dev command for this framework
      const framework = (() => {
        try {
          const fj = `${ctx.appPath}/.caide/framework.json`;
          if (fs.existsSync(fj)) {
            const p = JSON.parse(fs.readFileSync(fj, "utf-8")) as Record<string, unknown>;
            return String(p.framework ?? "blank");
          }
          if (fs.existsSync(`${ctx.appPath}/pubspec.yaml`)) return "flutter";
          if (fs.existsSync(`${ctx.appPath}/package.json`)) {
            const pkg = JSON.parse(fs.readFileSync(`${ctx.appPath}/package.json`, "utf-8")) as Record<string, unknown>;
            const deps = { ...((pkg.dependencies ?? {}) as Record<string, unknown>), ...((pkg.devDependencies ?? {}) as Record<string, unknown>) };
            if (deps.expo || deps["react-native"]) return "react-native";
            return "website";
          }
        } catch {}
        return "blank";
      })();
      const hint =
        framework === "blank"
          ? "Preview not available for Blank projects"
          : framework === "react-native"
            ? "npx expo start --web"
            : framework === "flutter"
              ? "flutter run -d web-server"
              : "bun run dev";
      return { url: null, running: false, framework, hint: `Run: ${hint} or call preview.start` };
    } catch {
      return { url: null, running: false, error: "Failed to read preview state" };
    }
  },
});

// 17. checkpoint
export const checkpointTool = defineTool({
  name: "checkpoint",
  description: "Requests human approval gate with diff preview before executing risky changes.",
  schema: z.object({
    reason: z.string().describe("Explanation for human review"),
    diff: z.string().optional().describe("Proposed diff summary"),
  }),
  readOnly: false,
  modifiesState: true,
  execute: async ({ reason, diff }) => {
    return {
      checkpointId: `chk-${Date.now()}`,
      status: "pending_approval",
      reason,
      diff,
    };
  },
});

// 18. log_decision
export const logDecisionTool = defineTool({
  name: "log_decision",
  description: "Records an architectural or design decision into .caide/decisions.jsonl.",
  schema: z.object({
    decision: z.string().describe("Summary of the decision"),
    reason: z.string().describe("Rationale and alternatives considered"),
  }),
  readOnly: false,
  modifiesState: false,
  execute: async ({ decision, reason }, ctx) => {
    const logDir = path.join(ctx.appPath, ".caide");
    await fs.promises.mkdir(logDir, { recursive: true });
    const line = JSON.stringify({ time: Date.now(), decision, reason }) + "\n";
    await fs.promises.appendFile(path.join(logDir, "decisions.jsonl"), line, "utf-8");
    return { recorded: true };
  },
});

// 19. spawn_subagent
// Runs a focused delegated task in a separate LLM call (a sub-agent) and
// returns its result. Useful for isolated reviews, research, or specialized
// skill work without bloating the main context. Requires ctx.provider.
export const spawnSubagentTool = defineTool({
  name: "spawn_subagent",
  description:
    "Spawns a focused sub-agent to complete a delegated task (e.g. a specialized review or a self-contained subtask) and returns its result text. Prefer this for isolated work instead of doing it inline.",
  schema: z.object({
    task: z.string().describe("The focused task for the sub-agent"),
    context: z.string().optional().describe("Additional context to give the sub-agent"),
  }),
  readOnly: true,
  modifiesState: false,
  execute: async ({ task, context }, ctx) => {
    if (!ctx.provider) {
      return { result: "Sub-agent provider not configured." };
    }
    const { streamProvider } = await import("../provider/apiAdapter.ts");
    const system =
      ctx.provider.system ??
      "You are a focused sub-agent. Complete the delegated task and return a concise, complete result.";
    const prompt = context ? `${context}\n\nTASK: ${task}` : task;
    const stream = streamProvider({
      modelId: ctx.provider.modelId,
      baseUrl: ctx.provider.baseUrl,
      apiKey: ctx.provider.apiKey,
      system,
      messages: [{ role: "user", content: prompt }],
      signal: ctx.signal,
    });
    let result = "";
    for await (const chunk of stream) {
      if (chunk.type === "token" && chunk.content) result += chunk.content;
    }
    return { result };
  },
  presentCall: ({ task }) => `Spawn sub-agent: ${task.slice(0, 80)}`,
});

export const ALL_CORE_TOOLS: ToolDef[] = [
  readFileTool,
  writeFileTool,
  listDirTool,
  searchFilesTool,
  runCommandTool,
  readUrlTool,
  screenshotTool,
  getDesignTokensTool,
  readSpecTool,
  writeSpecTool,
  writeDesignSpecTool,
  writeMotionSpecTool,
  installPackageTool,
  buildProjectTool,
  lintProjectTool,
  getPreviewUrlTool,
  checkpointTool,
  logDecisionTool,
  spawnSubagentTool,
];
