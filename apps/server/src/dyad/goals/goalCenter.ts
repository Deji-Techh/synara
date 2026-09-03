// FILE: goalCenter.ts
// Purpose: Project-level goal operations over .caide/goals file storage:
// create/list/get/steer/pause/resume/cancel/edit/retry. The durable center
// behind the goal tools and (via B3 RPC) the goal center UI.
// Donor: dyad x caide ipc/goal/goal_store.ts center semantics (DB rows →
// state.json files; Electron/tray omitted — the server process owns lifetime).

import * as fs from "node:fs";
import * as path from "node:path";
import {
  GoalStateSchema,
  createGoalState,
  type GoalState,
} from "./goalState.ts";

export class GoalCenterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoalCenterError";
  }
}

function goalsDir(appPath: string): string {
  return path.join(appPath, ".caide", "goals");
}

function stateFile(appPath: string, goalId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(goalId)) {
    throw new GoalCenterError(`Invalid goalId: ${goalId}`);
  }
  return path.join(goalsDir(appPath), goalId, "state.json");
}

async function writeState(appPath: string, state: GoalState): Promise<GoalState> {
  const parsed = GoalStateSchema.parse(state);
  parsed.updatedAt = Date.now();
  const file = stateFile(appPath, parsed.goalId);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp.${Date.now()}`;
  await fs.promises.writeFile(tmp, JSON.stringify(parsed, null, 2), "utf8");
  await fs.promises.rename(tmp, file);
  return parsed;
}

export async function readGoal(appPath: string, goalId: string): Promise<GoalState> {
  let raw: string;
  try {
    raw = await fs.promises.readFile(stateFile(appPath, goalId), "utf8");
  } catch {
    throw new GoalCenterError(`Goal not found: ${goalId}`);
  }
  return GoalStateSchema.parse(JSON.parse(raw));
}

export async function createGoal(
  appPath: string,
  objective: string,
  tasks: Array<{ title: string; description?: string }>,
): Promise<GoalState> {
  if (!objective.trim()) throw new GoalCenterError("Objective must not be empty.");
  if (tasks.length === 0) throw new GoalCenterError("A goal needs at least one task.");
  return writeState(appPath, createGoalState(objective, tasks));
}

export async function listGoals(appPath: string): Promise<GoalState[]> {
  let entries: string[];
  try {
    entries = await fs.promises.readdir(goalsDir(appPath));
  } catch {
    return [];
  }
  const goals: GoalState[] = [];
  for (const entry of entries) {
    try {
      const raw = await fs.promises.readFile(path.join(goalsDir(appPath), entry, "state.json"), "utf8");
      goals.push(GoalStateSchema.parse(JSON.parse(raw)));
    } catch {
      // skip invalid goal dirs
    }
  }
  return goals.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function steerGoal(appPath: string, goalId: string, instruction: string): Promise<GoalState> {
  if (!instruction.trim()) throw new GoalCenterError("Instruction must not be empty.");
  const state = await readGoal(appPath, goalId);
  state.steering.push({ instruction: instruction.trim(), createdAt: Date.now() });
  return writeState(appPath, state);
}

export async function pauseGoal(appPath: string, goalId: string, reason?: string): Promise<GoalState> {
  const state = await readGoal(appPath, goalId);
  if (state.status === "completed") throw new GoalCenterError("Goal is already completed.");
  state.status = "paused";
  if (reason?.trim()) state.steering.push({ instruction: `Paused: ${reason.trim()}`, createdAt: Date.now() });
  return writeState(appPath, state);
}

export async function resumeGoal(appPath: string, goalId: string): Promise<GoalState> {
  const state = await readGoal(appPath, goalId);
  if (state.status !== "paused" && state.status !== "blocked") {
    throw new GoalCenterError(`Cannot resume a goal with status "${state.status}".`);
  }
  state.status = "active";
  state.blocker = null;
  return writeState(appPath, state);
}

export async function cancelGoal(appPath: string, goalId: string, reason?: string): Promise<GoalState> {
  const state = await readGoal(appPath, goalId);
  for (const task of state.tasks) {
    if (task.status !== "verified") task.status = "cancelled";
  }
  state.status = "awaiting-user";
  if (reason?.trim()) {
    state.blocker = { reason: reason.trim(), userAction: null, retryable: false, detectedAt: Date.now() };
  }
  return writeState(appPath, state);
}

export async function editGoal(
  appPath: string,
  goalId: string,
  patch: { objective?: string; tasks?: Array<{ title: string; description?: string }> },
): Promise<GoalState> {
  const state = await readGoal(appPath, goalId);
  if (patch.objective?.trim()) state.objective = patch.objective.trim();
  if (patch.tasks && patch.tasks.length > 0) {
    const existing = new Map(state.tasks.map((t) => [t.title, t]));
    state.tasks = patch.tasks.map((t, i) => {
      const prev = existing.get(t.title);
      return prev
        ? { ...prev, order: i, description: t.description ?? prev.description }
        : {
            id: `task-${Date.now().toString(36)}-${i}`,
            title: t.title,
            description: t.description ?? "",
            status: "pending" as const,
            order: i,
            required: true,
            dependencies: [],
            completionCriteria: [],
            verificationMethod: null,
          };
    });
  }
  if (state.status === "completed") state.status = "active";
  return writeState(appPath, state);
}

export async function retryTask(appPath: string, goalId: string, taskId: string): Promise<GoalState> {
  const state = await readGoal(appPath, goalId);
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) throw new GoalCenterError(`Task not found: ${taskId}`);
  task.status = "pending";
  if (state.status === "blocked" || state.status === "paused") state.status = "active";
  state.blocker = null;
  if (!state.currentTask) state.currentTask = task.title;
  return writeState(appPath, state);
}
