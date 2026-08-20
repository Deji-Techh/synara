import { app, BrowserWindow, Notification } from "electron";
import log from "electron-log";
import { goalEvents, type Goal, type GoalRun, type GoalRunKind } from "@/ipc/types/goal";
import { isPersistedGoalComplete, type PersistedGoalState } from "@/shared/goal_state";
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

const logger = log.scope("goal_scheduler");
const SCHEDULER_INTERVAL_MS = 1_500;
const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 5 * 60_000;
const NO_PROGRESS_BLOCK_THRESHOLD = 8;

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let scheduling = false;

function notifyUser(title: string, body: string): void {
  try {
    if (!Notification.isSupported()) return;
    new Notification({ title, body }).show();
  } catch (error) {
    logger.warn("Could not show goal notification", error);
  }
}

function sendGoalEvent(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    try {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
        window.webContents.send(channel, payload);
      }
    } catch (error) {
      logger.warn(`Could not send ${channel}`, error);
    }
  }
}

function emitUpdated(goal: Goal, reason: string): void {
  sendGoalEvent(goalEvents.updated.channel, { goal, reason });
}

export function emitGoalControlRequested(
  goalId: string,
  chatId: number | null,
  action: "pause" | "cancel" | "interrupt",
): void {
  sendGoalEvent(goalEvents.controlRequested.channel, {
    goalId,
    chatId,
    action,
  });
}

function buildRunPrompt(goal: Goal, kind: GoalRunKind): string {
  const statePath = `.caide/goals/${goal.id}/state.json`;
  const common = `
You are executing an active CAIDE Goal. This is a durable autonomous run, not a one-turn chat request.

GOAL ID: ${goal.id}
OBJECTIVE: ${goal.objective}
DEFINITION OF DONE:
${goal.definitionOfDone.map((item, index) => `${index + 1}. ${item}`).join("\n")}
CONSTRAINTS:
${goal.constraints.length ? goal.constraints.map((item, index) => `${index + 1}. ${item}`).join("\n") : "- Preserve existing architecture and user work.\n- Do not use placeholders or fake success states.\n- Do not bypass approvals, security rules, or required credentials."}

DURABLE STATE CONTRACT:
- Read ${statePath} before doing work.
- Treat it as the authoritative task graph, progress record, blocker record and evidence index.
- Expand the task graph whenever the objective requires more work than the starter tasks describe.
- Call the update_goal_state tool with the fully mutated state object after every meaningful task, test, build, audit, blocker or repair.
- Review every entry in the state file's steering array before selecting the next task.
- Do not mark a task verified without concrete current evidence.
- Every verification criterion must reference IDs from the evidence array; referenced evidence must pass and use the exact verification revision.
- Do not set status to completed unless every required task is verified and every definition-of-done criterion has current evidence against the latest source revision.
- A failed build, failed test or partial implementation means repair and continue; it never means completion.
- When credentials, destructive approval or an unavoidable user decision is required, set status to blocked or awaiting-user with a precise blocker and continue all independent tasks first.
- Work directly in the existing project. Preserve unrelated user changes.
- DISPATCH SUBAGENT SWARMS: When executing broad exploration, multi-module refactoring, or independent verification (API, UI, DB, Build), use spawn_subagent to run background subagents concurrently. Synthesize their evidence into ${statePath}.
- DELEGATE HEAVY DISCOVERY: When you need to understand the codebase, dispatch explore_code or spawn_subagent instead of running list_files and read_file manually in your own context.
- Continue through planning, implementation, testing and repair until this run naturally reaches its tool-step boundary. CAIDE will schedule another run automatically when work remains.
`;

  if (kind === "verify") {
    return `${common}
INDEPENDENT VERIFICATION RUN:
Act as the final production-readiness verifier. Inspect the latest repository state rather than trusting previous claims. Run the required type checks, builds, tests, core flows, accessibility/security/quality audits and deployment or packaging checks named by the goal. Record exact evidence in ${statePath}. Set status to completed only when every criterion passes. When anything fails, set status back to active, create explicit repair tasks and record the failures. Do not implement unrelated features during this verification run.`;
  }

  if (kind === "repair") {
    return `${common}
REPAIR RUN:
Inspect the most recent failed run and persisted evidence. Diagnose root causes, choose a materially different repair approach where repeated attempts failed, implement the repair, rerun the relevant checks, and update ${statePath}. Continue with the next unblocked required task after the repair succeeds.`;
  }

  return `${common}
EXECUTION RUN:
Select the highest-priority ready task whose dependencies are satisfied. Plan only as much as needed, implement it completely, verify it, persist evidence, then continue to the next executable task. When all implementation tasks appear complete, set the persisted state to completion-candidate so CAIDE can launch a separate verification run.`;
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
    const blocker = {
      reason: "This goal is configured for a remote runner, but no remote runner is connected.",
      userAction:
        "Connect a CAIDE remote runner or change the goal execution target to local/hybrid.",
      retryable: true,
      detectedAt: Date.now(),
    };
    const blocked = await updateGoalStatus(goal.id, "blocked", {
      blocker,
      reason: blocker.reason,
      nextRetryAt: Date.now() + 60_000,
    });
    emitUpdated(blocked, "remote-runner-unavailable");
    return null;
  }
  const run = createRun(goal.id, kind, buildRunPrompt(goal, kind));
  if (run) {
    sendGoalEvent(goalEvents.runRequested.channel, { run });
  }
  return run;
}

async function reconcileGoal(goalId: string): Promise<Goal> {
  const synced = await syncGoalFromState(goalId);
  const goal = synced.goal;
  const state = synced.state;

  if (goal.status === "pausing") {
    const paused = await finishPause(goal.id);
    emitUpdated(paused, "paused");
    return paused;
  }

  if (goal.status === "cancelled" || goal.status === "paused" || goal.status === "completed") {
    return goal;
  }

  if (state && isPersistedGoalComplete(state) && hasCurrentVerificationApproval(goal.id)) {
    const completed = await updateGoalStatus(goal.id, "completed", {
      reason: "Every required task and verification criterion passed",
      resetFailures: true,
    });
    emitUpdated(completed, "completed");
    notifyUser("CAIDE goal completed", completed.title);
    return completed;
  }

  if (state?.status === "blocked" || state?.status === "awaiting-user") {
    const shouldProbeRetryableBlocker =
      state.status === "blocked" &&
      state.blocker?.retryable === true &&
      goal.nextRetryAt !== null &&
      goal.nextRetryAt <= Date.now();
    if (shouldProbeRetryableBlocker) {
      const repairing = await updateGoalStatus(goal.id, "repairing", {
        reason: "Retrying a previously blocked external condition",
        nextRetryAt: null,
      });
      await queueNextRun(repairing, "repair");
      emitUpdated(repairing, "retrying-blocker");
      return repairing;
    }
    const status = state.status === "blocked" ? "blocked" : "awaiting-user";
    const blocked = await updateGoalStatus(goal.id, status, {
      blocker: state.blocker,
      reason: state.blocker?.reason ?? "Goal requires user action",
      nextRetryAt: state.blocker?.retryable ? Date.now() + 30_000 : null,
    });
    emitUpdated(blocked, status);
    return blocked;
  }

  const nextKind: GoalRunKind = candidateForVerification(state)
    ? "verify"
    : goal.consecutiveFailures > 0
      ? "repair"
      : "execute";
  const active = await updateGoalStatus(
    goal.id,
    nextKind === "verify" ? "verifying" : nextKind === "repair" ? "repairing" : "active",
    { reason: `Scheduling ${nextKind} continuation` },
  );
  await queueNextRun(active, nextKind);
  emitUpdated(active, "continuing");
  return active;
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
    if (runnable.length && BrowserWindow.getAllWindows().length) {
      for (const run of runnable) {
        sendGoalEvent(goalEvents.runRequested.channel, { run });
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
  // A new main process cannot have a live renderer lease from the previous
  // process, so recover all interrupted runs immediately instead of waiting for
  // their old heartbeat deadline.
  recoverExpiredRuns(Number.MAX_SAFE_INTEGER);
  schedulerTimer = setInterval(() => void tick(), SCHEDULER_INTERVAL_MS);
  (schedulerTimer as NodeJS.Timeout).unref?.();
  app?.on?.("before-quit", stopGoalScheduler);
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
  if (before.status === "pausing") {
    return finishPause(before.id);
  }
  if (before.status === "cancelled" || before.status === "paused") return before;

  if (!input.success) {
    const failures = before.consecutiveFailures + 1;
    const nextRetryAt = Date.now() + nextRetryDelay(failures);
    const blocker =
      failures >= NO_PROGRESS_BLOCK_THRESHOLD
        ? {
            reason: `The goal has failed ${failures} consecutive execution runs. CAIDE will continue retrying with diagnostic repair runs.`,
            userAction:
              "Review the goal logs or steer the goal when a credential, external service, or architectural decision is missing.",
            retryable: true,
            detectedAt: Date.now(),
          }
        : undefined;
    const failed = await updateGoalStatus(before.id, blocker ? "blocked" : "repairing", {
      reason: input.error ?? "Goal run failed; repair scheduled",
      blocker,
      nextRetryAt,
      incrementFailure: true,
    });
    emitUpdated(failed, "run-failed");
    notifyUser(
      "CAIDE goal run failed",
      `${failed.title}: ${input.error ?? "Agent execution did not settle successfully."}`,
    );
    wakeGoalScheduler();
    return failed;
  }

  const synced = await syncGoalFromState(before.id);
  if (
    run.kind === "verify" &&
    synced.changed &&
    synced.state &&
    isPersistedGoalComplete(synced.state)
  ) {
    recordVerificationApproval(before.id);
    const completed = await updateGoalStatus(before.id, "completed", {
      reason: "Independent verification approved the latest durable goal state",
      resetFailures: true,
    });
    emitUpdated(completed, "completed");
    notifyUser("CAIDE goal completed", completed.title);
    return completed;
  }
  if (!synced.changed && !input.pausedByStepLimit) {
    const failures = before.consecutiveFailures + 1;
    const stalled = await updateGoalStatus(before.id, "repairing", {
      reason:
        "The agent run produced no durable goal-state progress; diagnostic continuation scheduled",
      nextRetryAt: Date.now() + nextRetryDelay(failures),
      incrementFailure: true,
    });
    emitUpdated(stalled, "no-progress");
    wakeGoalScheduler();
    return stalled;
  }

  const continued = await updateGoalStatus(before.id, "active", {
    reason: input.pausedByStepLimit
      ? "Agent step boundary reached; continuing automatically"
      : "Run completed; evaluating next task",
    resetFailures: true,
  });
  emitUpdated(continued, "run-completed");
  wakeGoalScheduler();
  return continued;
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
