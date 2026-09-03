// FILE: goalScheduler.ts
// Purpose: Goal advancement + verification passes over file-backed state.
// No daemon/tray (donor had both): the agent invokes advance/verify through
// tools, and the M3 send path can trigger them after runs. Pure transitions,
// best-effort git revision, structured reports.
// Donor: ipc/goal/goal_scheduler.ts handleCompletedRun/verifyGoalNow
// semantics (failure counting omitted — no run ledger yet; M4).

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isGoalComplete, type GoalState } from "./goalState.ts";
import { readGoal, retryTask } from "./goalCenter.ts";
import * as fs from "node:fs";
import * as path from "node:path";

const execFileAsync = promisify(execFile);

async function currentRevision(appPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: appPath });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function persist(appPath: string, state: GoalState): Promise<void> {
  const { GoalStateSchema } = await import("./goalState.ts");
  const parsed = GoalStateSchema.parse({ ...state, updatedAt: Date.now() });
  const file = path.join(appPath, ".caide", "goals", parsed.goalId, "state.json");
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp.${Date.now()}`;
  await fs.promises.writeFile(tmp, JSON.stringify(parsed, null, 2), "utf8");
  await fs.promises.rename(tmp, file);
}

/** Pending tasks whose dependencies are all verified, in order. */
export function nextActionableTasks(state: GoalState) {
  const verified = new Set(
    state.tasks.filter((t) => t.status === "verified").map((t) => t.id),
  );
  return state.tasks
    .filter((t) => t.status === "pending" && t.dependencies.every((d) => verified.has(d)))
    .sort((a, b) => a.order - b.order);
}

/**
 * Advance pass: point currentTask at the next actionable task, or move the
 * goal to completion-candidate/completed when all required tasks verify.
 */
export async function advanceGoal(appPath: string, goalId: string): Promise<string> {
  const state = await readGoal(appPath, goalId);
  if (state.status === "completed") return `Goal "${state.objective}" is already completed.`;
  if (state.status === "paused") return `Goal is paused — resume it before advancing.`;
  if (isGoalComplete(state)) {
    state.status = "completed";
    await persist(appPath, state);
    return `Goal "${state.objective}" is complete (all required tasks verified).`;
  }
  const requiredDone = state.tasks.filter((t) => t.required).every((t) => t.status === "verified");
  if (requiredDone) {
    state.status = "completion-candidate";
    await persist(appPath, state);
    return `All required tasks verified — goal is a completion candidate. Run verify_goal to complete it.`;
  }
  const next = nextActionableTasks(state);
  if (next.length === 0) {
    const blocked = state.tasks.filter((t) => t.status === "blocked");
    state.status = blocked.length > 0 ? "blocked" : "active";
    await persist(appPath, state);
    return blocked.length > 0
      ? `No actionable tasks — ${blocked.length} blocked. Unblock or retry them.`
      : `No actionable tasks — dependencies are not verified yet. Verify completed work first.`;
  }
  state.status = "active";
  state.currentTask = next[0].title;
  await persist(appPath, state);
  return `Next task: "${next[0].title}"${next.length > 1 ? ` (+${next.length - 1} more actionable)` : ""}.`;
}

/**
 * Verification pass: for required tasks awaiting verification, check linked
 * passing evidence at the current revision; mark verified, rebuild criteria,
 * and complete the goal when the predicate holds.
 */
export async function verifyGoal(appPath: string, goalId: string): Promise<string> {
  const state = await readGoal(appPath, goalId);
  const revision = await currentRevision(appPath);
  let verifiedCount = 0;
  for (const task of state.tasks) {
    if (!task.required || task.status === "verified") continue;
    if (task.status !== "verifying" && task.status !== "repairing" && task.status !== "running") continue;
    const linked = state.evidence.filter((e) => e.taskId === task.id && e.passed);
    const atRevision = revision ? linked.filter((e) => e.revision === revision) : linked;
    if (atRevision.length > 0) {
      task.status = "verified";
      verifiedCount++;
    }
  }
  const criteria = state.tasks
    .filter((t) => t.required && t.status === "verified")
    .map((t) => {
      const ids = state.evidence.filter((e) => e.taskId === t.id && e.passed).map((e) => e.id);
      return { criterion: t.title, passed: ids.length > 0, evidence: ids };
    });
  state.verification = { passed: criteria.length > 0 && criteria.every((c) => c.passed), checkedAt: Date.now(), revision, criteria };
  if (isGoalComplete({ ...state, status: "completed" })) {
    state.status = "completed";
    await persist(appPath, state);
    return `Verification passed at revision ${revision ?? "(unknown)"} — goal "${state.objective}" is complete.`;
  }
  await persist(appPath, state);
  return `Verified ${verifiedCount} task(s) at revision ${revision ?? "(unknown)"}. ${state.tasks.filter((t) => t.required && t.status !== "verified").length} required task(s) still open.`;
}

export { retryTask };
