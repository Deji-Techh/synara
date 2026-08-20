import { type Goal, type GoalRun, type GoalRunKind } from "./goal_types";
import { isPersistedGoalComplete, type PersistedGoalState } from "../shared/goal_state";
import {
  createRun,
  ensureGoalTables,
  finishPause,
  forceGoalStateActive,
  getGoal,
  getGoalRowForScheduler,
  hasCurrentVerificationApproval,
  hasOpenRun,
  listRunnableRuns,
  listSchedulableGoalRows,
  recoverExpiredRuns,
  recordVerificationApproval,
  syncGoalFromState,
  updateGoalStatus,
} from "./goal_store";

const logger = { warn: console.warn, error: console.error };
const SCHEDULER_INTERVAL_MS = 1_500;
const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 5 * 60_000;
const NO_PROGRESS_BLOCK_THRESHOLD = 8;

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let scheduling = false;

function notifyUser(title: string, body: string): void {
  // stub
}

function sendGoalEvent(channel: string, payload: unknown): void {
  // stub
}

function emitUpdated(goal: Goal, reason: string): void {
  sendGoalEvent("goal:updated", { goal, reason });
}

export function emitGoalControlRequested(
  goalId: string,
  chatId: number | null,
  action: "pause" | "cancel" | "interrupt",
): void {
  sendGoalEvent("goal:control-requested", {
    goalId,
    chatId,
    action,
  });
}

function buildRunPrompt(goal: Goal, kind: GoalRunKind): string {
  const statePath = `.caide/goals/${goal.id}/state.json`;
  const common = `
You are executing an active CAIDE Goal.
`;
  return common;
}

function candidateForVerification(state: PersistedGoalState | null): boolean {
  if (!state) return false;
  if (state.status === "completion-candidate" || state.status === "completed") {
    return true;
  }
  return (
    state.tasks.filter((task) => task.required).length > 0 &&
    state.tasks.filter((task) => task.required).every((task) => task.status === "verified") &&
    !state.verification.passed
  );
}

function nextRetryDelay(failures: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** Math.max(0, failures - 1), RETRY_MAX_MS);
}

async function queueNextRun(goal: Goal, kind: GoalRunKind): Promise<GoalRun | null> {
  if (goal.executionTarget === "remote") {
    return null;
  }
  const run = createRun(goal.id, kind, buildRunPrompt(goal, kind));
  if (run) {
    sendGoalEvent("goal:run-requested", { run });
  }
  return run;
}

async function reconcileGoal(goalId: string): Promise<Goal> {
  const synced = await syncGoalFromState(goalId);
  const goal = synced.goal;
  const state = synced.state;
  return goal;
}

async function tick(): Promise<void> {
  if (scheduling) return;
  scheduling = true;
  try {
    recoverExpiredRuns();
    const goals = listSchedulableGoalRows();
    for (const row of goals) {
      if (hasOpenRun(row.id)) continue;
      await reconcileGoal(row.id);
    }

    const runnable = listRunnableRuns(20);
    if (runnable.length) {
      for (const run of runnable) {
        sendGoalEvent("goal:run-requested", { run });
      }
    }
  } catch (error) {
    logger.error("Goal scheduler tick failed", error);
  } finally {
    scheduling = false;
  }
}

export function startGoalScheduler(): void {
  if (schedulerTimer) return;
  ensureGoalTables();
  recoverExpiredRuns(Number.MAX_SAFE_INTEGER);
  schedulerTimer = setInterval(() => void tick(), SCHEDULER_INTERVAL_MS);
  (schedulerTimer as NodeJS.Timeout).unref?.();
  void tick();
}

export function stopGoalScheduler(): void {
  if (!schedulerTimer) return;
  clearInterval(schedulerTimer);
  schedulerTimer = null;
}

export function wakeGoalScheduler(): void {
  void tick();
}

export async function handleCompletedRun(input: {
  runId: string;
  runnerId: string;
  success: boolean;
  pausedByStepLimit?: boolean;
  error?: string;
}): Promise<Goal> {
  const { finishRun } = await import("./goal_store");
  const run = finishRun(input);
  const before = await getGoal(run.goalId);
  return before;
}

export async function retryGoalNow(goalId: string): Promise<Goal> {
  await forceGoalStateActive(goalId);
  const active = await updateGoalStatus(goalId, "active", {
    reason: "Immediate retry requested",
    resetFailures: true,
    nextRetryAt: null,
  });
  wakeGoalScheduler();
  return active;
}

export async function verifyGoalNow(goalId: string): Promise<Goal> {
  const goal = await updateGoalStatus(goalId, "verifying", {
    reason: "Independent verification requested",
    resetFailures: true,
  });
  await queueNextRun(goal, "verify");
  wakeGoalScheduler();
  return goal;
}

export async function notifyGoalUpdated(goalId: string, reason: string) {
  const goal = await getGoal(goalId);
  emitUpdated(goal, reason);
}

export function getGoalChatId(goalId: string): number | null {
  return getGoalRowForScheduler(goalId).goal_chat_id;
}
