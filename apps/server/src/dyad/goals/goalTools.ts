// FILE: goalTools.ts
// Purpose: Goal agent tools: update_goal_state (atomic, schema-enforced) +
// goal_status reader. Donor update_goal_state.ts kept (state dir moved to
// .caide/goals). Goals are durable project objectives with verified tasks —
// the scheduler/UI center lands in M3b; state + tools + predicate land here.

import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { defineTool, type ToolDef } from "../../harness/tools/defineTool.ts";
import { GoalStateSchema, isGoalComplete } from "./goalState.ts";

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
      lines.push("", `Blocked: ${state.blocker.reason}${state.blocker.userAction ? ` — user action: ${state.blocker.userAction}` : ""}`);
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

export const ALL_GOAL_TOOLS: ToolDef[] = [updateGoalStateTool, goalStatusTool, verifyGoalTool];
