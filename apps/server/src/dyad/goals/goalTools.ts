import * as fs from "node:fs";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { defineTool, type ToolDef } from "../../harness/tools/defineTool.ts";
import { GoalStateSchema, isGoalComplete } from "./goalState.ts";

const execFileAsync = promisify(execFile);

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
  goalId: z.string(),
  taskId: z.string().nullable().default(null),
  kind: z.enum([
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
  ]),
  label: z.string(),
  reference: z.string(),
  passed: z.boolean(),
  revision: z.string().nullable().optional(),
});

export const captureEvidenceTool = defineTool({
  name: "capture_evidence",
  description: "Record evidence for a goal or task to satisfy its completion criteria.",
  schema: captureEvidenceSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) => {
    const state = await readGoalState(ctx.appPath, args.goalId);

    // Add evidence
    const newEvidence = {
      id: `ev-${Date.now().toString(36)}`,
      taskId: args.taskId ?? null,
      kind: args.kind,
      label: args.label,
      reference: args.reference,
      passed: args.passed,
      revision: args.revision ?? null,
      createdAt: Date.now(),
    };
    state.evidence.push(newEvidence);

    // Transition task status if appropriate
    if (args.taskId) {
      const task = state.tasks.find((t) => t.id === args.taskId);
      if (task && (task.status === "running" || task.status === "repairing")) {
        task.status = "verifying";
      }
    }

    const file = stateFile(ctx.appPath, args.goalId);
    const tmp = `${file}.tmp.${Date.now()}`;
    await fs.promises.writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
    await fs.promises.rename(tmp, file);

    return `Evidence captured for goal ${args.goalId}${args.taskId ? ` task ${args.taskId}` : ""}.`;
  },
  presentCall: (args: any) => `Capture evidence: ${args.label}`,
});

const runTestsSchema = z.object({
  command: z
    .string()
    .optional()
    .describe("Optional specific test command (default: bun run test or npm test)"),
  flags: z.string().optional().describe("Optional flags to pass to the test runner"),
});

export const runTestsTool = defineTool({
  name: "run_tests",
  description:
    "Run test suite for the project. Automatically uses Vitest/Jest via the local package manager.",
  schema: runTestsSchema,
  readOnly: true,
  modifiesState: false,
  execute: async (args, ctx) => {
    const cmdStr = args.command ?? "bun run test";
    const fullCmd = args.flags ? `${cmdStr} ${args.flags}` : cmdStr;
    try {
      const { stdout, stderr } = await execFileAsync("bash", ["-c", fullCmd], {
        cwd: ctx.appPath,
        timeout: 60000,
      });
      return `Test execution passed.\nOutput:\n${stdout}\n${stderr}`;
    } catch (e: any) {
      return `Test execution failed.\nError:\n${e.message}\nOutput:\n${e.stdout}\n${e.stderr}`;
    }
  },
  presentCall: (args: any) => `Run tests: ${args.command ?? "default"}`,
});

const runLintSchema = z.object({
  command: z
    .string()
    .optional()
    .describe("Optional specific lint command (default: bun run lint or npm run lint)"),
});

export const runLintTool = defineTool({
  name: "run_lint",
  description: "Run linter for the project.",
  schema: runLintSchema,
  readOnly: true,
  modifiesState: false,
  execute: async (args, ctx) => {
    const cmdStr = args.command ?? "bun run lint";
    try {
      const { stdout, stderr } = await execFileAsync("bash", ["-c", cmdStr], {
        cwd: ctx.appPath,
        timeout: 60000,
      });
      return `Lint execution passed.\nOutput:\n${stdout}\n${stderr}`;
    } catch (e: any) {
      return `Lint execution failed.\nError:\n${e.message}\nOutput:\n${e.stdout}\n${e.stderr}`;
    }
  },
  presentCall: (args: any) => `Run lint: ${args.command ?? "default"}`,
});

export const ALL_GOAL_TOOLS: ToolDef[] = [
  updateGoalStateTool,
  goalStatusTool,
  verifyGoalTool,
  captureEvidenceTool,
  runTestsTool,
  runLintTool,
];
