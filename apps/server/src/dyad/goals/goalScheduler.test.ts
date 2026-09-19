// FILE: goalScheduler.test.ts
// Purpose: M4 ledger + scheduler driver (failure backoff, no-progress block,
// expired-run recovery, retryable-blocker probing, outbox, registry).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { createGoal, readGoal } from "./goalCenter.ts";
import {
  drainGoalEvents,
  listRegisteredGoalAppPaths,
  nextRetryDelay,
  probeRetryableBlocker,
  recoverExpiredRuns,
  recordRunResult,
  registerGoalAppPath,
  retryGoalNow,
  startGoalScheduler,
  stopGoalScheduler,
  unregisterGoalAppPath,
  wakeGoalScheduler,
} from "./goalScheduler.ts";
import type { GoalState } from "./goalState.ts";

function mustTask(state: GoalState, index: number) {
  const task = state.tasks[index];
  if (!task) throw new Error(`fixture task ${index} missing`);
  return task;
}

function appDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "caide-sched-"));
}

describe("dyad goal scheduler (m4)", () => {
  it("backs off exponentially and blocks at the no-progress threshold", async () => {
    expect(nextRetryDelay(1)).toBe(2_000);
    expect(nextRetryDelay(2)).toBe(4_000);
    expect(nextRetryDelay(20)).toBe(5 * 60_000);
    const dir = appDir();
    const goal = await createGoal(dir, "Ship", [{ title: "A" }]);
    const taskId = mustTask(goal, 0).id;
    await recordRunResult(dir, goal.goalId, taskId, "failed", "boom");
    let state = await readGoal(dir, goal.goalId);
    expect(state.consecutiveFailures).toBe(1);
    expect(state.nextRetryAt).toBeGreaterThan(Date.now());
    for (let i = 0; i < 7; i++) {
      await recordRunResult(dir, goal.goalId, taskId, "failed", `boom ${i}`);
    }
    state = await readGoal(dir, goal.goalId);
    expect(state.consecutiveFailures).toBe(8);
    expect(state.status).toBe("blocked");
    expect(state.blocker?.retryable).toBe(true);
    expect(state.blocker?.reason).toContain("8 consecutive");
    const events = drainGoalEvents();
    expect(events.some((e) => e.type === "goal-blocked" && e.goalId === goal.goalId)).toBe(true);
  });

  it("resets failures on completion", async () => {
    const dir = appDir();
    const goal = await createGoal(dir, "Ship", [{ title: "A" }]);
    const taskId = mustTask(goal, 0).id;
    await recordRunResult(dir, goal.goalId, taskId, "failed", "boom");
    await recordRunResult(dir, goal.goalId, taskId, "completed");
    const state = await readGoal(dir, goal.goalId);
    expect(state.consecutiveFailures).toBe(0);
    expect(state.nextRetryAt).toBeNull();
  });

  it("recovers expired transient tasks back to pending", async () => {
    const dir = appDir();
    const goal = await createGoal(dir, "Ship", [{ title: "A" }]);
    // Force a stale heartbeat: task running, state untouched for a full lease.
    const file = path.join(dir, ".caide", "goals", goal.goalId, "state.json");
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    raw.tasks[0].status = "running";
    raw.updatedAt = Date.now() - 31 * 60_000;
    fs.writeFileSync(file, JSON.stringify(raw));
    const recovered = await recoverExpiredRuns(dir, goal.goalId);
    expect(recovered).toBe(1);
    const state = await readGoal(dir, goal.goalId);
    expect(mustTask(state, 0).status).toBe("pending");
    expect(mustTask(state, 0).runLedger.at(-1)?.error).toContain("Recovered expired run");
  });

  it("leaves fresh transient tasks alone", async () => {
    const dir = appDir();
    const goal = await createGoal(dir, "Ship", [{ title: "A" }]);
    const file = path.join(dir, ".caide", "goals", goal.goalId, "state.json");
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    raw.tasks[0].status = "running";
    raw.updatedAt = Date.now();
    fs.writeFileSync(file, JSON.stringify(raw));
    expect(await recoverExpiredRuns(dir, goal.goalId)).toBe(0);
  });

  it("probes elapsed retryable blockers back to active", async () => {
    const dir = appDir();
    const goal = await createGoal(dir, "Ship", [{ title: "A" }]);
    const file = path.join(dir, ".caide", "goals", goal.goalId, "state.json");
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    raw.status = "blocked";
    raw.blocker = { reason: "flaky svc", userAction: null, retryable: true, detectedAt: 1 };
    raw.nextRetryAt = Date.now() - 1000;
    fs.writeFileSync(file, JSON.stringify(raw));
    expect(await probeRetryableBlocker(dir, goal.goalId)).toBe(true);
    const state = await readGoal(dir, goal.goalId);
    expect(state.status).toBe("active");
    expect(state.nextRetryAt).toBeNull();
    drainGoalEvents();
  });

  it("does not probe future or non-retryable blockers", async () => {
    const dir = appDir();
    const goal = await createGoal(dir, "Ship", [{ title: "A" }]);
    const file = path.join(dir, ".caide", "goals", goal.goalId, "state.json");
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    raw.status = "blocked";
    raw.blocker = { reason: "needs user", userAction: "decide", retryable: false, detectedAt: 1 };
    raw.nextRetryAt = null;
    fs.writeFileSync(file, JSON.stringify(raw));
    expect(await probeRetryableBlocker(dir, goal.goalId)).toBe(false);
  });

  it("retries a goal now and manages driver lifecycle", async () => {
    const dir = appDir();
    const goal = await createGoal(dir, "Ship", [{ title: "A" }]);
    const taskId = mustTask(goal, 0).id;
    await recordRunResult(dir, goal.goalId, taskId, "failed", "boom");
    const msg = await retryGoalNow(dir, goal.goalId);
    expect(msg).toContain("reset to active");
    const state = await readGoal(dir, goal.goalId);
    expect(state.status).toBe("active");
    expect(state.consecutiveFailures).toBe(0);
    registerGoalAppPath(dir);
    expect(listRegisteredGoalAppPaths()).toContain(path.normalize(dir));
    startGoalScheduler();
    startGoalScheduler();
    wakeGoalScheduler();
    unregisterGoalAppPath(dir);
    expect(listRegisteredGoalAppPaths()).not.toContain(path.normalize(dir));
    stopGoalScheduler();
    stopGoalScheduler();
    drainGoalEvents();
  });
});
