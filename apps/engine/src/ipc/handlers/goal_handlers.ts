import { goalContracts } from "@/ipc/types/goal";
import { createTypedHandler } from "./base";
import {
  cancelGoal,
  cancelOpenRuns,
  claimRun,
  createGoal,
  editGoal,
  ensureGoalTables,
  getActiveGoal,
  getGoal,
  heartbeatRun,
  listActivity,
  listGoals,
  listRunnableRuns,
  listRuns,
  pauseGoal,
  resumeGoal,
  setRunWaiting,
  steerGoal,
} from "@/ipc/goal/goal_store";
import {
  emitGoalControlRequested,
  getGoalChatId,
  handleCompletedRun,
  notifyGoalUpdated,
  retryGoalNow,
  startGoalScheduler,
  verifyGoalNow,
  wakeGoalScheduler,
} from "@/ipc/goal/goal_scheduler";

export function registerGoalHandlers(): void {
  ensureGoalTables();
  startGoalScheduler();

  createTypedHandler(goalContracts.createGoal, async (_event, input) => {
    const goal = await createGoal(input);
    await notifyGoalUpdated(goal.id, "created");
    wakeGoalScheduler();
    return goal;
  });

  createTypedHandler(goalContracts.getGoal, async (_event, { goalId }) => getGoal(goalId));

  createTypedHandler(goalContracts.getActiveGoal, async (_event, { appId }) =>
    getActiveGoal(appId),
  );

  createTypedHandler(goalContracts.listGoals, async (_event, input) => listGoals(input));

  createTypedHandler(goalContracts.listActivity, async (_event, input) =>
    listActivity(input.goalId, input.limit),
  );

  createTypedHandler(goalContracts.listRuns, async (_event, input) =>
    listRuns(input.goalId, input.limit),
  );

  createTypedHandler(goalContracts.pauseGoal, async (_event, input) => {
    const goal = await pauseGoal(input.goalId, input.reason);
    cancelOpenRuns(goal.id, input.reason ?? "Goal paused by user");
    emitGoalControlRequested(goal.id, goal.goalChatId, "pause");
    await notifyGoalUpdated(goal.id, "pause-requested");
    wakeGoalScheduler();
    return goal;
  });

  createTypedHandler(goalContracts.resumeGoal, async (_event, { goalId }) => {
    const goal = await resumeGoal(goalId);
    await notifyGoalUpdated(goal.id, "resumed");
    wakeGoalScheduler();
    return goal;
  });

  createTypedHandler(goalContracts.cancelGoal, async (_event, input) => {
    const goal = await cancelGoal(input.goalId, input.reason);
    cancelOpenRuns(goal.id, input.reason ?? "Goal cancelled by user");
    emitGoalControlRequested(goal.id, getGoalChatId(goal.id), "cancel");
    await notifyGoalUpdated(goal.id, "cancelled");
    return goal;
  });

  createTypedHandler(goalContracts.editGoal, async (_event, input) => {
    const { goalId, ...updates } = input;
    const goal = await editGoal(goalId, updates);
    cancelOpenRuns(goal.id, "Goal contract changed; stale execution interrupted");
    emitGoalControlRequested(goal.id, goal.goalChatId, "interrupt");
    await notifyGoalUpdated(goal.id, "edited");
    wakeGoalScheduler();
    return goal;
  });

  createTypedHandler(goalContracts.steerGoal, async (_event, input) => {
    const goal = await steerGoal(input.goalId, input.instruction);
    cancelOpenRuns(goal.id, "Goal steering changed; stale execution interrupted");
    emitGoalControlRequested(goal.id, goal.goalChatId, "interrupt");
    await notifyGoalUpdated(goal.id, "steered");
    wakeGoalScheduler();
    return goal;
  });

  createTypedHandler(goalContracts.retryGoal, async (_event, { goalId }) => retryGoalNow(goalId));

  createTypedHandler(goalContracts.verifyGoal, async (_event, { goalId }) => {
    const goal = await getGoal(goalId);
    cancelOpenRuns(goal.id, "Independent verification requested");
    emitGoalControlRequested(goal.id, goal.goalChatId, "interrupt");
    return verifyGoalNow(goalId);
  });

  createTypedHandler(goalContracts.listRunnableRuns, async () => listRunnableRuns(20));

  createTypedHandler(goalContracts.claimRun, async (_event, input) =>
    claimRun(input.runId, input.runnerId),
  );

  createTypedHandler(goalContracts.heartbeatRun, async (_event, input) =>
    heartbeatRun(input.runId, input.runnerId),
  );

  createTypedHandler(goalContracts.setRunWaiting, async (_event, input) => {
    const goal = await setRunWaiting(input);
    await notifyGoalUpdated(goal.id, input.waiting ? "awaiting-approval" : "approval-resolved");
    return goal;
  });

  createTypedHandler(goalContracts.completeRun, async (_event, input) => handleCompletedRun(input));
}
