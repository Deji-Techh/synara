import * as fs from "node:fs";
import * as path from "node:path";
import { exec, execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { defineTool, type ToolDef } from "./defineTool.ts";
import { designTokens, type DesignTokens } from "../../design/tokens.ts";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

function resolveSafePath(userPath: string, appPath: string): string {
  const base = path.resolve(appPath);
  const resolved = path.resolve(base, userPath);
  // Boundary-aware containment (not a raw startsWith: "/root2" must not
  // pass for base "/root"). Donor path_safety logic, Caide error contract.
  const rel = path.relative(base, resolved);
  const escapes = rel !== "" && (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel));
  if (escapes) {
    throw new Error(`Path traversal denied: '${userPath}' is outside workspace root '${appPath}'`);
  }
  return resolved;
}

// 1. read_file
export const readFileTool = defineTool({
  name: "read_file",
  description:
    "Reads file content from the project workspace. Fails if the path is outside the workspace root.",
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
  description:
    "Writes content to a file in the project workspace, creating parent directories if needed. Use relative paths like src/App.tsx, src/components/Card.tsx, src/pages/Home.tsx — never empty, never '.' or '/' or absolute, never the workspace root itself. Example: write_file({\"path\":\"src/App.tsx\",\"content\":\"full file\"})",
  schema: z
    .object({
      path: z
        .string()
        .min(2)
        .refine((p) => p !== "." && p !== "/" && !p.startsWith("/") && p.includes("."), {
          message: "path must be a valid relative file path like src/App.tsx, not '.' or '/' or empty",
        })
        .describe("Relative file path, e.g. src/App.tsx or src/components/Button.tsx"),
      content: z.string().min(1).describe("Full file content to write — must be complete, no placeholders"),
    })
    .strict(),
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
    command: z.string().optional().describe("Full shell command string to execute, e.g. 'bun add expo-router'"),
    cmd: z.string().optional().describe("Command binary name or full command"),
    args: z.array(z.string()).default([]).describe("Command arguments"),
    cwd: z.string().optional().describe("Working directory relative to project root"),
  }),
  readOnly: false,
  modifiesState: true,
  execute: async ({ command, cmd, args, cwd }, ctx) => {
    const workDir = cwd ? resolveSafePath(cwd, ctx.appPath) : ctx.appPath;
    const rawCmd = (command || cmd || "").trim();
    if (!rawCmd) {
      throw new Error("Missing command string in run_command");
    }
    const commandToRun =
      args && args.length > 0 && !rawCmd.includes(" ")
        ? `${rawCmd} ${args.map((a) => (a.includes(" ") ? JSON.stringify(a) : a)).join(" ")}`
        : rawCmd;

    const { stdout, stderr } = await execAsync(commandToRun, {
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
  description:
    "Captures a real screenshot of the running app preview for visual verification. Requires an active preview (open_preview first). Saves to .caide/evidence/ and records a screenshot evidence entry. Prefer this over describing visuals from code.",
  schema: z.object({
    selector: z.string().optional().describe("Optional CSS selector to scope capture (best-effort)"),
    width: z.number().int().min(320).max(2048).optional().describe("Viewport width (default 390)"),
    height: z.number().int().min(320).max(2048).optional().describe("Viewport height (default 844)"),
  }),
  readOnly: true,
  modifiesState: false,
  execute: async ({ selector, width, height }, ctx) => {
    const { getPreviewState } = await import("../preview/manager.ts");
    const { capturePreviewScreenshot, CaptureUnavailableError } = await import("../preview/capture.ts");
    const state = getPreviewState(ctx.sessionId);
    if (!state.running || !state.url) {
      throw new Error("No active preview — call open_preview first, then screenshot.");
    }
    let shot;
    try {
      shot = await capturePreviewScreenshot({ url: state.url, width, height });
    } catch (err) {
      if (err instanceof CaptureUnavailableError) throw err;
      throw new Error(`Screenshot capture failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    const rel = `.caide/evidence/shot-${Date.now()}.png`;
    try {
      const { default: path } = await import("node:path");
      const { default: fs } = await import("node:fs");
      const full = path.join(ctx.appPath, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, Buffer.from(shot.base64, "base64"));
      const { executeCaptureEvidence } = await import("../../dyad/misc/miscTools.ts");
      await executeCaptureEvidence(
        { kind: "screenshot", label: "preview screenshot", reference: rel, passed: true },
        ctx.sessionId,
        ctx.appPath,
      ).catch(() => {});
    } catch {
      // evidence persistence is best-effort; the bytes below still count
    }
    return {
      base64: `data:image/png;base64,${shot.base64}`,
      dimensions: { width: shot.width, height: shot.height },
      selector,
      path: rel,
    };
  },
});

// 8. get_design_tokens
export const getDesignTokensTool = defineTool({
  name: "get_design_tokens",
  description:
    "Returns the authoritative project design tokens (colors, type scale, component rules, motion).",
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
  description:
    "Writes the specification document (.caide/spec.md) defining flows, scope, and screens.",
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
    tokens: z.record(z.string(), z.unknown()).describe("JSON design token specification"),
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
    motion: z.record(z.string(), z.unknown()).describe("Spring, duration, and curve motion tokens"),
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

// 14. build_project — framework-aware (website: bun run build, RN: npx expo export, flutter: flutter build apk --debug, blank: no-op)
// NOTE: flutter uses --debug (no signing config needed); release signing stays human-gated — see build_apk.
export const buildProjectTool = defineTool({
  name: "build_project",
  description:
    "Executes project build using the framework's buildSteps (website: bun run build, RN: npx expo export, flutter: flutter build apk --debug). Returns structured { success, stdout, stderr, exitCode } — not raw compiler dump.",
  schema: z.object({}),
  readOnly: false,
  modifiesState: true,
  execute: async (_, ctx) => {
    const framework = (() => {
      try {
        const fj = `${ctx.appPath}/.caide/framework.json`;
        if (fs.existsSync(fj))
          return String(
            (JSON.parse(fs.readFileSync(fj, "utf-8")) as Record<string, unknown>).framework ??
              "blank",
          );
        if (fs.existsSync(`${ctx.appPath}/pubspec.yaml`)) return "flutter";
        if (fs.existsSync(`${ctx.appPath}/package.json`)) {
          const pkg = JSON.parse(fs.readFileSync(`${ctx.appPath}/package.json`, "utf-8")) as Record<
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
      } catch {}
      return "blank";
    })();
    const buildSteps: string[] =
      framework === "react-native"
        ? ["npx expo export"]
        : framework === "flutter"
          ? ["flutter build apk --debug"]
          : framework === "website"
            ? ["bun run build"]
            : [];
    if (buildSteps.length === 0)
      return { success: true, stdout: "No build step for blank", stderr: "", framework };
    // Run first step (most frameworks have one); if multiple, run sequentially
    let stdout = "";
    let stderr = "";
    for (const step of buildSteps) {
      const [cmd, ...args] = step.split(" ");
      const result = await execFileAsync(cmd, args, {
        cwd: ctx.appPath,
        signal: ctx.signal,
        maxBuffer: 10 * 1024 * 1024,
      }).catch((e: any) => {
        throw new Error(
          `Build step '${step}' failed: ${e.message ?? String(e)}\nstdout: ${e.stdout ?? ""}\nstderr: ${e.stderr ?? ""}`,
        );
      });
      stdout += result.stdout;
      stderr += result.stderr;
    }
    return {
      success: true,
      stdout: stdout.slice(0, 20000),
      stderr: stderr.slice(0, 20000),
      framework,
    };
  },
});

// 15. lint_project — framework-aware
export const lintProjectTool = defineTool({
  name: "lint_project",
  description:
    "Runs linting/typechecking (website/RN: bun typecheck, flutter: flutter analyze). Returns { clean, stdout, stderr }.",
  schema: z.object({}),
  readOnly: true,
  modifiesState: false,
  execute: async (_, ctx) => {
    const isFlutter = fs.existsSync(`${ctx.appPath}/pubspec.yaml`);
    const cmd = isFlutter ? "flutter" : "bun";
    const args = isFlutter ? ["analyze"] : ["typecheck"];
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd: ctx.appPath,
      signal: ctx.signal,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { clean: true, stdout: stdout.slice(0, 20000), stderr: stderr.slice(0, 20000) };
  },
});

// 15b. test_project — runs tests (bun run test / flutter test)
export const testProjectTool = defineTool({
  name: "test_project",
  description:
    "Runs project tests (website/RN: bun run test, flutter: flutter test). Returns structured { passed, stdout, stderr }.",
  schema: z.object({}),
  readOnly: true,
  modifiesState: false,
  execute: async (_, ctx) => {
    const isFlutter = fs.existsSync(`${ctx.appPath}/pubspec.yaml`);
    const cmd = isFlutter ? "flutter" : "bun";
    const args = isFlutter ? ["test"] : ["run", "test"];
    try {
      const { stdout, stderr } = await execFileAsync(cmd, args, {
        cwd: ctx.appPath,
        signal: ctx.signal,
        maxBuffer: 10 * 1024 * 1024,
        timeout: 120_000,
      });
      const output = `${stdout}\n${stderr}`.slice(0, 20000);
      const failed = /fail|error|✘|not ok/i.test(output);
      return { passed: !failed, stdout: stdout.slice(0, 20000), stderr: stderr.slice(0, 20000) };
    } catch (e: any) {
      const msg = e.message ?? String(e);
      return {
        passed: false,
        stdout: e.stdout?.slice(0, 20000) ?? "",
        stderr: (e.stderr ?? msg).slice(0, 20000),
      };
    }
  },
});

// 16. get_preview_url — dynamic: reads live preview session (device-frame 672px or browser)
export const getPreviewUrlTool = defineTool({
  name: "get_preview_url",
  description:
    "Returns the live preview URL for this thread's app (device-frame for RN/Flutter, browser for Website). If no preview is running, returns null with the framework — then call open_preview yourself to start it. Never ask the user to run dev commands manually.",
  schema: z.object({}),
  readOnly: true,
  modifiesState: false,
  execute: async (_, ctx) => {
    try {
      const { getPreviewState } = await import("../preview/manager.ts");
      const state = getPreviewState(ctx.sessionId);
      if (state.running && state.url) {
        return {
          url: state.url,
          running: true,
          kind: state.kind ?? "web",
          logs: state.logs.slice(-20),
        };
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
            const pkg = JSON.parse(
              fs.readFileSync(`${ctx.appPath}/package.json`, "utf-8"),
            ) as Record<string, unknown>;
            const deps = {
              ...((pkg.dependencies ?? {}) as Record<string, unknown>),
              ...((pkg.devDependencies ?? {}) as Record<string, unknown>),
            };
            if (deps.expo || deps["react-native"]) return "react-native";
            return "website";
          }
        } catch {}
        return "blank";
      })();
      const hint =
        framework === "blank"
          ? "Preview not available for Blank projects"
          : "Preview is not running — call open_preview yourself to start it; never ask the user to run dev commands manually.";
      return { url: null, running: false, framework, hint };
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
// Spawns a background subagent thread with a persona (explorer for bounded
// read-only recon, implementer for GOAL/MUST HOLD scoped work, generic for
// anything else) and returns its thread id synchronously. Poll with
// check_subagent_status or wait_agents; continue it with send_message or
// followup_task; stop it with cancel_agent. Donor spawn_agent semantics
// (persona + assignment form + scope) over the Caide thread worker.
export const spawnSubagentTool = defineTool({
  name: "spawn_subagent",
  description:
    "Spawn a background subagent thread and return its thread id immediately (the work runs detached — poll it, don't wait inline). Personas: explorer (read-only recon with cited findings), implementer (does the work; write the assignment as GOAL / MUST HOLD / OUT OF SCOPE / DONE WHEN, where MUST HOLD lists every project rule the change could touch or explains why none apply). Give at most one implementer at a time a task, and keep working while it runs only on unrelated files. Poll with check_subagent_status or wait_agents; continue with send_message/followup_task; cancel with cancel_agent.",
  schema: z.object({
    persona: z.enum(["explorer", "implementer", "generic"]).optional().describe("Subagent persona (default generic)"),
    task_name: z.string().min(1).max(100).describe("A stable short name for this task"),
    assignment: z
      .string()
      .min(1)
      .max(20_000)
      .describe("The assignment. For implementer tasks use GOAL / MUST HOLD / OUT OF SCOPE / DONE WHEN."),
    scope: z
      .array(z.string().min(1).max(500))
      .max(100)
      .optional()
      .describe("Advisory relative paths or prefixes expected to be in scope"),
    context: z.string().optional().describe("Additional background context for the sub-agent"),
  }),
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) => {
    const parsed = (spawnSubagentTool.schema as z.ZodType<any>).parse(args) as {
      persona?: "explorer" | "implementer" | "generic";
      task_name: string;
      assignment: string;
      scope?: string[];
      context?: string;
    };
    if (!ctx.provider) {
      throw new Error("Sub-agent provider not configured.");
    }
    const { streamProvider, endpointForModel } = await import("../provider/apiAdapter.ts");
    const { formatChatMessagesForEndpoint } = await import("../provider/streamProviderAdapter.ts");
    const { getSubagentTools, spawnSubagentTask } = await import("../../dyad/sandbox/subagentLoop.ts");
    const llm = {
      async *stream(messages: any, opts?: any) {
        const chat = formatChatMessagesForEndpoint(
          messages,
          endpointForModel(ctx.provider!.modelId, ctx.provider!.baseUrl),
        );
        const stream = streamProvider({
          modelId: ctx.provider!.modelId,
          baseUrl: ctx.provider!.baseUrl,
          apiKey: ctx.provider!.apiKey,
          system: undefined,
          messages: chat,
          sessionId: ctx.sessionId,
          signal: opts?.signal ?? ctx.signal,
        });
        for await (const chunk of stream) {
          if (chunk.type === "token" && chunk.content) yield { type: "token", content: chunk.content };
          else if (chunk.type === "tool_call" && chunk.toolCall) yield { type: "tool_call", toolCall: chunk.toolCall };
        }
      },
    };
    const task = parsed.context ? `${parsed.context}\n\nASSIGNMENT: ${parsed.assignment}` : parsed.assignment;
    const id = spawnSubagentTask({
      appPath: ctx.appPath,
      sessionId: ctx.sessionId,
      role: parsed.persona ?? "generic",
      persona: parsed.persona ?? "generic",
      taskName: parsed.task_name,
      task,
      scope: parsed.scope ?? [],
      tools: getSubagentTools(),
      llm: llm as never,
      signal: ctx.signal,
      requestConsent: ctx.requestConsent,
      consentStore: ctx.consentStore,
    });
    return {
      thread_id: id,
      status: "running",
      hint: "Poll with check_subagent_status or wait_agents. Continue with send_message/followup_task.",
    };
  },
  presentCall: (args: any) => `Spawn ${args.persona ?? "generic"} sub-agent: ${String(args.task_name ?? args.task ?? "").slice(0, 80)}`,
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
  testProjectTool,
  getPreviewUrlTool,
  checkpointTool,
  logDecisionTool,
  spawnSubagentTool,
];
