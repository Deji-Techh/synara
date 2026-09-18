import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { defineTool, type ToolDef } from "../../harness/tools/defineTool.ts";
import { GoalStateSchema, isGoalComplete } from "./goalState.ts";

const execFileAsync = async (
  command: string,
  args: string[],
  opts: { cwd: string; timeoutMs: number; signal?: AbortSignal },
): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean }> => {
  // Donor spawnCommand parity (goal_verification.ts): sh -c with TERM=dumb +
  // CI=1, SIGTERM then SIGKILL on timeout. The caller's abort is honored too.
  const { spawn } = await import("node:child_process");
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const child = spawn(command, args, {
      cwd: opts.cwd,
      env: { ...process.env, TERM: "dumb", CI: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
      } catch {
        // already exited
      }
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // already exited
        }
      }, 3000);
    }, opts.timeoutMs);
    if (opts.signal) {
      if (opts.signal.aborted) {
        try {
          child.kill("SIGTERM");
        } catch {
          // already exited
        }
      } else {
        opts.signal.addEventListener(
          "abort",
          () => {
            try {
              child.kill("SIGTERM");
            } catch {
              // already exited
            }
          },
          { once: true },
        );
      }
    }
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? 1, timedOut });
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout: "", stderr: err.message, exitCode: 1, timedOut: false });
    });
  });
};

const MAX_OUTPUT_CHARS = 10_000;

function truncateOutput(s: string): string {
  if (s.length <= MAX_OUTPUT_CHARS) return s;
  return `...[truncated]\n${s.slice(-MAX_OUTPUT_CHARS)}`;
}

async function readPackageJson(
  appPath: string,
): Promise<{ scripts: Record<string, string>; deps: Record<string, string> } | null> {
  try {
    const raw = await fs.promises.readFile(path.join(appPath, "package.json"), "utf8");
    const pkg = JSON.parse(raw) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return {
      scripts: pkg.scripts ?? {},
      deps: { ...pkg.dependencies, ...pkg.devDependencies },
    };
  } catch {
    return null;
  }
}

/**
 * Donor detectTestCommand parity (goal_verification.ts): prefer an explicit
 * `test` script, then common test scripts, then installed runners.
 */
export async function detectTestCommand(appPath: string): Promise<string> {
  const pkg = await readPackageJson(appPath);
  if (pkg) {
    if (pkg.scripts.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
      return "npm run test";
    }
    for (const name of ["test:run", "test:unit", "vitest:run"]) {
      if (pkg.scripts[name]) return `npm run ${name}`;
    }
    if (pkg.deps.vitest) return "npx vitest run";
    if (pkg.deps.jest) return "npx jest --passWithNoTests";
  }
  return "npm run test";
}

/**
 * Donor detectLintCommand parity (goal_verification.ts): explicit lint
 * scripts first, then installed linters.
 */
export async function detectLintCommand(appPath: string): Promise<string> {
  const pkg = await readPackageJson(appPath);
  if (pkg) {
    for (const name of ["lint", "check", "lint:check"]) {
      if (pkg.scripts[name]) return `npm run ${name}`;
    }
    if (pkg.deps["@biomejs/biome"]) return "npx biome check src/";
    if (pkg.deps.eslint) return "npx eslint src/ --max-warnings 0";
  }
  return "npm run lint";
}

export class GoalValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoalValidationError";
  }
}

function stateFile(appPath: string, goalId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(goalId)) {
    throw new GoalValidationError(`Invalid goalId: ${goalId}`);
  }
  return path.join(appPath, ".caide", "goals", goalId, "state.json");
}

export async function readGoalState(appPath: string, goalId: string) {
  const raw = await fs.promises.readFile(stateFile(appPath, goalId), "utf8").catch(() => {
    throw new GoalValidationError(`Goal not found: ${goalId}`);
  });
  return GoalStateSchema.parse(JSON.parse(raw));
}

const updateGoalStateSchema = z.object({
  goalId: z.string().describe("The ID of the active Goal"),
  state: GoalStateSchema.describe("The fully updated goal state object"),
});

export const updateGoalStateTool = defineTool({
  name: "update_goal_state",
  description:
    "Update the durable state for an active CAIDE Goal. Use this instead of modifying state.json directly to ensure the schema is strictly enforced. Pass the entire mutated state object.",
  schema: updateGoalStateSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) => {
    const parsed = updateGoalStateSchema.parse(args);
    const validated = GoalStateSchema.parse(parsed.state);
    const file = stateFile(ctx.appPath, parsed.goalId);
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp.${Date.now()}`;
    await fs.promises.writeFile(tmp, JSON.stringify(validated, null, 2), "utf8");
    await fs.promises.rename(tmp, file);
    const { wakeGoalScheduler } = await import("./goalScheduler.ts");
    wakeGoalScheduler();
    return `Goal state for ${parsed.goalId} successfully updated and validated.`;
  },
  presentCall: (args: any) => `Update goal state for ${args.goalId}`,
});

const goalStatusSchema = z.object({
  goalId: z.string().describe("The ID of the Goal to inspect"),
});
export const goalStatusTool = defineTool({
  name: "goal_status",
  description:
    "Show a goal's status: objective, lifecycle state, per-task states, blockers, steering notes, and whether the completion predicate holds.",
  schema: goalStatusSchema,
  readOnly: true,
  modifiesState: false,
  execute: async (args, ctx) => {
    const parsed = goalStatusSchema.parse(args);
    const state = await readGoalState(ctx.appPath, parsed.goalId);
    const lines = [
      `Goal: ${state.objective}`,
      `Status: ${state.status}${isGoalComplete(state) ? " (completion predicate holds)" : ""}`,
      `Current: ${state.currentPhase ?? "—"} / ${state.currentTask ?? "—"}`,
      "",
      "Tasks:",
      ...state.tasks.map((t) => `- [${t.status}] ${t.title} (${t.id})`),
    ];
    if (state.blocker) {
      lines.push(
        "",
        `Blocked: ${state.blocker.reason}${state.blocker.userAction ? ` — user action: ${state.blocker.userAction}` : ""}`,
      );
    }
    if (state.steering.length > 0) {
      lines.push("", "Steering:", ...state.steering.map((s) => `- ${s.instruction}`));
    }
    return lines.join("\n");
  },
  presentCall: (args: any) => `Goal status: ${args.goalId}`,
});

const verifyGoalSchema = z.object({
  goalId: z.string().describe("The ID of the Goal to verify"),
});

export const verifyGoalTool = defineTool({
  name: "verify_goal",
  description:
    "Run an independent verification pass over a goal: checks required tasks' linked passing evidence at the current revision, marks verified tasks, rebuilds criteria, and completes the goal when the predicate holds. Use after capturing evidence for goal work.",
  schema: verifyGoalSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) => {
    const { verifyGoal } = await import("./goalScheduler.ts");
    return verifyGoal(ctx.appPath, verifyGoalSchema.parse(args).goalId);
  },
  presentCall: (args: any) => `Verify goal: ${args.goalId}`,
});

const captureEvidenceSchema = z.object({
  goalId: z.string().min(1).describe("The ID of the active Goal to record evidence for"),
  taskId: z
    .string()
    .nullable()
    .optional()
    .describe("Optional: the task ID this evidence relates to"),
  kind: z
    .enum([
      "test",
      "build",
      "typecheck",
      "lint",
      "screenshot",
      "audit-report",
      "file-change",
      "command-output",
      "deployment",
      "manual-confirmation",
      "other",
    ])
    .describe(
      "The kind of evidence: test | build | typecheck | lint | screenshot | audit-report | file-change | command-output | deployment | manual-confirmation | other",
    ),
  label: z
    .string()
    .min(1)
    .describe("Human-readable description of the evidence, e.g. 'vitest: 47/47 tests passed'"),
  reference: z
    .string()
    .min(1)
    .describe(
      "The command run or artifact path, e.g. 'npm run test' or '.caide/evidence/shot.png'",
    ),
  passed: z.boolean().describe("Whether this evidence indicates the check passed"),
});

export const captureEvidenceTool = defineTool({
  name: "capture_evidence",
  description: `Record a piece of verification evidence into an active Goal's state.json.
Use this after running a check (tests, type checks, lint, build) to persist the outcome as verifiable evidence.

This is the mechanism by which the Goal system accepts completion — verification
checks that required tasks have passing evidence at the current revision before
marking the goal as complete.

Always capture_evidence after run_tests, run_lint, or run_type_checks when working on a Goal.`,
  schema: captureEvidenceSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) => {
    const parsed = captureEvidenceSchema.parse(args);
    const state = await readGoalState(ctx.appPath, parsed.goalId);
    if (parsed.taskId) {
      const task = state.tasks.find((t) => t.id === parsed.taskId);
      if (!task) throw new GoalValidationError(`Task not found: ${parsed.taskId}`);
    }

    // Donor parity: the revision is server-captured from git (best-effort),
    // never caller-supplied — verification couples evidence to the revision
    // it actually ran against.
    let revision: string | null = null;
    try {
      const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
        cwd: ctx.appPath,
        timeoutMs: 10_000,
        signal: ctx.signal,
      });
      revision = stdout.trim() || null;
    } catch {
      // best-effort
    }

    // Add evidence
    const newEvidence = {
      id: `ev-${Date.now().toString(36)}`,
      taskId: parsed.taskId ?? null,
      kind: parsed.kind,
      label: parsed.label,
      reference: parsed.reference,
      passed: parsed.passed,
      revision,
      createdAt: Date.now(),
    };
    state.evidence.push(newEvidence);

    // Transition task status if appropriate
    if (parsed.taskId) {
      const task = state.tasks.find((t) => t.id === parsed.taskId);
      if (task && (task.status === "running" || task.status === "repairing")) {
        task.status = "verifying";
      }
    }

    const file = stateFile(ctx.appPath, parsed.goalId);
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp.${Date.now()}`;
    await fs.promises.writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
    await fs.promises.rename(tmp, file);
    const { wakeGoalScheduler } = await import("./goalScheduler.ts");
    wakeGoalScheduler();

    return `Evidence recorded for goal ${parsed.goalId}:\n  kind: ${parsed.kind}\n  label: ${parsed.label}\n  passed: ${parsed.passed}\n  revision: ${revision ?? "(unknown)"}\n  id: ${newEvidence.id}`;
  },
  presentCall: (args: any) =>
    `Record ${args.kind} evidence for goal ${args.goalId}: ${args.passed ? "PASSED" : "FAILED"} — ${args.label}`,
});

const runTestsSchema = z.object({
  test_pattern: z
    .string()
    .optional()
    .describe(
      "Optional glob/regex pattern to filter which test files to run. Omit to run all tests.",
    ),
  timeout_seconds: z
    .number()
    .min(30)
    .max(300)
    .optional()
    .default(120)
    .describe("Max seconds to wait (default 120, max 300)"),
  command_override: z
    .string()
    .optional()
    .describe(
      "Override the auto-detected test command. Use this when the project uses an unusual test setup.",
    ),
});

export const runTestsTool = defineTool({
  name: "run_tests",
  description: `Run the project's test suite and return pass/fail results.
Auto-detects the test runner (test script, test:run/test:unit/vitest:run, vitest, jest) from package.json.
Returns a summary: exit code, and any error output.

Use this to:
- Verify your changes don't break existing tests
- Generate test evidence for an active Goal
- Confirm a bug fix works

After running, use capture_evidence to record the result in the active Goal.`,
  schema: runTestsSchema,
  readOnly: true,
  modifiesState: false,
  execute: async (args, ctx) => {
    const parsed = runTestsSchema.parse(args);
    let command = parsed.command_override ?? (await detectTestCommand(ctx.appPath));
    if (parsed.test_pattern && !parsed.command_override) {
      command = `${command} ${parsed.test_pattern}`;
    }
    const timeoutMs = (parsed.timeout_seconds ?? 120) * 1000;
    const { stdout, stderr, exitCode, timedOut } = await execFileAsync("sh", ["-c", command], {
      cwd: ctx.appPath,
      timeoutMs,
      signal: ctx.signal,
    });
    const parts: string[] = [];
    if (timedOut) {
      parts.push(`[TIMED OUT after ${parsed.timeout_seconds ?? 120}s]`);
    } else {
      parts.push(`Exit code: ${exitCode} — Tests ${exitCode === 0 ? "PASSED ✓" : "FAILED ✗"}`);
    }
    if (stdout) parts.push(`OUTPUT:\n${truncateOutput(stdout)}`);
    if (stderr) parts.push(`STDERR:\n${truncateOutput(stderr)}`);
    return parts.join("\n\n");
  },
  presentCall: (args: any) =>
    args.command_override
      ? `$ ${args.command_override}`
      : `Run test suite${args.test_pattern ? ` (pattern: ${args.test_pattern})` : ""}`,
});

const runLintSchema = z.object({
  timeout_seconds: z
    .number()
    .min(10)
    .max(180)
    .optional()
    .default(60)
    .describe("Max seconds to wait (default 60)"),
  command_override: z.string().optional().describe("Override the auto-detected lint command"),
});

export const runLintTool = defineTool({
  name: "run_lint",
  description: `Run the project's linter (lint/check scripts, biome, eslint) and return any issues found.
Auto-detects the linter from package.json.
Returns exit code and lint output.
Use after making code changes to ensure code quality.`,
  schema: runLintSchema,
  readOnly: true,
  modifiesState: false,
  execute: async (args, ctx) => {
    const parsed = runLintSchema.parse(args);
    const command = parsed.command_override ?? (await detectLintCommand(ctx.appPath));
    const timeoutMs = (parsed.timeout_seconds ?? 60) * 1000;
    const { stdout, stderr, exitCode, timedOut } = await execFileAsync("sh", ["-c", command], {
      cwd: ctx.appPath,
      timeoutMs,
      signal: ctx.signal,
    });
    const parts: string[] = [];
    if (timedOut) {
      parts.push(`[TIMED OUT after ${parsed.timeout_seconds ?? 60}s]`);
    } else {
      parts.push(`Exit code: ${exitCode} — Lint ${exitCode === 0 ? "PASSED ✓" : "FAILED ✗"}`);
    }
    if (stdout) parts.push(`OUTPUT:\n${truncateOutput(stdout)}`);
    if (stderr) parts.push(`STDERR:\n${truncateOutput(stderr)}`);
    return parts.join("\n\n");
  },
  presentCall: (args: any) => (args.command_override ? `$ ${args.command_override}` : "Run linter"),
});

export const ALL_GOAL_TOOLS: ToolDef[] = [
  updateGoalStateTool,
  goalStatusTool,
  verifyGoalTool,
  captureEvidenceTool,
  runTestsTool,
  runLintTool,
];
