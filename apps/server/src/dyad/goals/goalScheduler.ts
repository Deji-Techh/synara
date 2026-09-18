// FILE: goalScheduler.ts
// Purpose: Goal advancement + verification passes over file-backed state,
// plus the autonomous scheduler subsystem (donor
// src/ipc/goal/goal_scheduler.ts, adapted from Electron/SQLite to
// server/file-backed):
// - M4 run ledger: per-task runLedger (failure counting) + goal-level
//   consecutiveFailures/nextRetryAt with exponential backoff and the
//   no-progress block threshold.
// - Interval driver (lifetime = server process) + wake-on-mutation +
//   retryable-blocker probing + stall detection + expired-run recovery.
// - Notifications via an injectable sink + lossless in-memory outbox. The
//   harness WS event type + toast rendering land in Phase 6 (015/017); until
//   then drainGoalEvents() lets the gateway poll without losing anything.
// - No daemon/tray: the agent invokes advance/verify through tools, and
//   mutations wake the scheduler. Pure transitions, best-effort git revision,
//   structured reports.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isGoalComplete, type GoalState } from "./goalState.ts";
import { listGoals, readGoal, retryTask } from "./goalCenter.ts";
import * as fs from "node:fs";
import * as path from "node:path";

const execFileAsync = promisify(execFile);

// Donor constants verbatim (goal_scheduler.ts).
const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 5 * 60_000;
const NO_PROGRESS_BLOCK_THRESHOLD = 8;
// File-backed adaptation: V1 ticked SQLite every 1500ms. Scanning state.json
// files is heavier, so the interval is 10s; wake-on-mutation covers immediacy.
const SCHEDULER_INTERVAL_MS = 10_000;
// Run-lease adaptation: V1 recovered DB run rows with expired heartbeats. The
// file backend has no run table, so updatedAt is the heartbeat proxy — a task
// left running/repairing/verifying with no state write for a full lease is
// treated as interrupted (restart, never resume).
const RUN_LEASE_MS = 30 * 60_000;
// Stall adaptation: V1 detected no-progress after completed runs via
// handleCompletedRun. Here an active goal with actionable work and no state
// write for a full window emits a stall notification (state untouched —
// only the agent or user moves tasks).
const STALL_NOTIFY_MS = 15 * 60_000;

/** Donor nextRetryDelay parity: exponential backoff capped at 5 minutes. */
export function nextRetryDelay(failures: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** Math.max(0, failures - 1), RETRY_MAX_MS);
}

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
  const verified = new Set(state.tasks.filter((t) => t.status === "verified").map((t) => t.id));
  return state.tasks
    .filter((t) => t.status === "pending" && t.dependencies.every((d) => verified.has(d)))
    .sort((a, b) => a.order - b.order);
}

/**
 * Record a run result (M4 run ledger). Per-task ledger entries drive the
 * task-level block (3 consecutive failures); goal-level consecutiveFailures
 * + nextRetryAt drive exponential-backoff retries and the donor
 * no-progress block threshold (8). A completed run resets goal-level
 * failures (donor resetFailures parity).
 */
export async function recordRunResult(
  appPath: string,
  goalId: string,
  taskId: string,
  status: "completed" | "failed" | "cancelled",
  error?: string,
): Promise<void> {
  const state = await readGoal(appPath, goalId);
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;

  task.runLedger.push({
    status,
    error,
    timestamp: Date.now(),
  });

  if (status === "completed") {
    state.consecutiveFailures = 0;
    state.nextRetryAt = null;
    if (state.status === "blocked" && state.blocker?.retryable) {
      // A successful run clears a retryable block (progress observed).
      state.blocker = null;
      state.status = "active";
    }
  } else if (status === "failed") {
    state.consecutiveFailures += 1;
    state.nextRetryAt = Date.now() + nextRetryDelay(state.consecutiveFailures);
    if (state.consecutiveFailures >= NO_PROGRESS_BLOCK_THRESHOLD) {
      task.status = "blocked";
      state.blocker = {
        reason: `The goal has failed ${state.consecutiveFailures} consecutive execution runs. CAIDE will continue retrying with diagnostic repair runs.`,
        userAction:
          "Review the goal logs or steer the goal when a credential, external service, or architectural decision is missing.",
        retryable: true,
        detectedAt: Date.now(),
      };
      state.status = "blocked";
      emitGoalEvent({
        type: "goal-blocked",
        appPath,
        goalId,
        reason: state.blocker.reason,
        at: Date.now(),
      });
    }
  }

  const recentFailures = task.runLedger.filter((r) => r.status === "failed").length;
  if (status === "failed" && recentFailures >= 3 && task.status !== "blocked") {
    task.status = "blocked";
    state.blocker = {
      reason: `Task "${task.title}" failed ${recentFailures} times consecutively. Error: ${error || "Unknown"}`,
      userAction: "Review task requirements or provide manual steering.",
      retryable: true,
      detectedAt: Date.now(),
    };
    state.status = "blocked";
    // A task-level block is retryable: schedule the probe via nextRetryAt.
    state.nextRetryAt = Date.now() + nextRetryDelay(state.consecutiveFailures);
    emitGoalEvent({
      type: "goal-blocked",
      appPath,
      goalId,
      reason: state.blocker.reason,
      at: Date.now(),
    });
  }

  await persist(appPath, state);
  wakeGoalScheduler();
}

/**
 * Advance pass: point currentTask at the next actionable task, or move the
 * goal to completion-candidate/completed when all required tasks verify.
 */
export async function advanceGoal(appPath: string, goalId: string): Promise<string> {
  // Probe first: an elapsed retryable backoff unblocks before we compute.
  await probeRetryableBlocker(appPath, goalId).catch(() => false);
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
  const [head, ...rest] = next;
  state.currentTask = head?.title ?? null;
  await persist(appPath, state);
  return head
    ? `Next task: "${head.title}"${rest.length > 0 ? ` (+${rest.length} more actionable)` : ""}.`
    : `No actionable tasks — dependencies are not verified yet. Verify completed work first.`;
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
    if (task.status !== "verifying" && task.status !== "repairing" && task.status !== "running")
      continue;
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
  state.verification = {
    passed: criteria.length > 0 && criteria.every((c) => c.passed),
    checkedAt: Date.now(),
    revision,
    criteria,
  };
  if (isGoalComplete({ ...state, status: "completed" })) {
    state.status = "completed";
    await persist(appPath, state);
    return `Verification passed at revision ${revision ?? "(unknown)"} — goal "${state.objective}" is complete.`;
  }
  await persist(appPath, state);
  return `Verified ${verifiedCount} task(s) at revision ${revision ?? "(unknown)"}. ${state.tasks.filter((t) => t.required && t.status !== "verified").length} required task(s) still open.`;
}

// ── Scheduler driver (donor start/stop/wake + tick, file-backed) ──

export interface GoalEvent {
  type: "goal-completed" | "goal-failed" | "goal-blocked" | "goal-stalled" | "goal-retrying";
  appPath: string;
  goalId: string;
  reason: string;
  at: number;
}

type GoalEventSink = (event: GoalEvent) => void;

let eventSink: GoalEventSink | null = null;
const eventOutbox: GoalEvent[] = [];

/**
 * Register the notification sink (Phase 6/015 wires this to WS toasts +
 * badge). Events are ALWAYS appended to the outbox first, so nothing is
 * lost before the transport lands — drainGoalEvents() polls losslessly.
 */
export function setGoalEventSink(sink: GoalEventSink | null): void {
  eventSink = sink;
}

export function emitGoalEvent(event: GoalEvent): void {
  eventOutbox.push(event);
  try {
    eventSink?.(event);
  } catch {
    // sink failures must never break goal transitions; outbox retains it
  }
}

/** Lossless poll for transports that are not push-wired yet. */
export function drainGoalEvents(): GoalEvent[] {
  return eventOutbox.splice(0, eventOutbox.length);
}

// Registry of app paths with goals (lifetime = server). Turns register
// their appPath; the tick scans only registered paths.
const registeredAppPaths = new Set<string>();

export function registerGoalAppPath(appPath: string): void {
  if (appPath) registeredAppPaths.add(path.normalize(appPath));
}

export function unregisterGoalAppPath(appPath: string): void {
  registeredAppPaths.delete(path.normalize(appPath));
}

export function listRegisteredGoalAppPaths(): string[] {
  return [...registeredAppPaths];
}

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let scheduling = false;
let wakeQueued = false;

/**
 * Recover expired runs (donor recoverExpiredRuns, file-backed adaptation):
 * tasks left in a transient state (running/repairing/verifying) with no
 * state write for a full run lease are treated as interrupted by a restart
 * or crash — moved back to pending with a ledger entry, never resumed
 * mid-flight.
 */
export async function recoverExpiredRuns(appPath: string, goalId?: string): Promise<number> {
  const goals = goalId ? [await readGoal(appPath, goalId)] : await listGoals(appPath);
  let recovered = 0;
  const now = Date.now();
  for (const state of goals) {
    if (state.status === "completed" || state.status === "paused") continue;
    // updatedAt is the heartbeat proxy: any transition rewrites it.
    if (now - state.updatedAt < RUN_LEASE_MS) continue;
    let touched = false;
    for (const task of state.tasks) {
      if (task.status === "running" || task.status === "repairing" || task.status === "verifying") {
        task.status = "pending";
        task.runLedger.push({
          status: "cancelled",
          error: "Recovered expired run: no state write within the run lease (restart or crash).",
          timestamp: now,
        });
        touched = true;
        recovered++;
      }
    }
    if (touched) {
      if (state.status === "blocked" && state.blocker?.retryable) {
        // Keep the block, but the lease expiry proves the world changed —
        // probe soon rather than waiting out the full backoff.
        state.nextRetryAt = Math.min(state.nextRetryAt ?? now, now + RETRY_BASE_MS);
      }
      await persist(appPath, state);
    }
  }
  return recovered;
}

/**
 * Probe a retryable blocker whose backoff has elapsed (donor
 * shouldProbeRetryableBlocker parity): blocked → active so the next
 * advance/turn retries the external condition instead of parking forever.
 * Returns true when a probe fired.
 */
export async function probeRetryableBlocker(appPath: string, goalId: string): Promise<boolean> {
  const state = await readGoal(appPath, goalId);
  if (state.status !== "blocked" || state.blocker?.retryable !== true) return false;
  if (state.nextRetryAt !== null && state.nextRetryAt > Date.now()) return false;
  state.status = "active";
  state.nextRetryAt = null;
  await persist(appPath, state);
  emitGoalEvent({
    type: "goal-retrying",
    appPath,
    goalId,
    reason: "Retrying a previously blocked external condition",
    at: Date.now(),
  });
  return true;
}

async function reconcileGoalRow(appPath: string, state: GoalState): Promise<void> {
  if (state.status === "completed" || state.status === "paused") return;
  if (state.status === "awaiting-user") return;
  // Completion is tool-driven (verify_goal); the tick only notices it.
  if (isGoalComplete(state)) {
    const fresh = await readGoal(appPath, state.goalId);
    if (fresh.status !== "completed") {
      fresh.status = "completed";
      fresh.consecutiveFailures = 0;
      fresh.nextRetryAt = null;
      await persist(appPath, fresh);
      emitGoalEvent({
        type: "goal-completed",
        appPath,
        goalId: state.goalId,
        reason: "Every required task and verification criterion passed",
        at: Date.now(),
      });
    }
    return;
  }
  // Retryable-blocker probing (donor tick parity).
  await probeRetryableBlocker(appPath, state.goalId);
  // Stall detection: active goal, actionable work, no writes for a window.
  const current = await readGoal(appPath, state.goalId);
  if (current.status === "active" && Date.now() - current.updatedAt >= STALL_NOTIFY_MS) {
    const actionable = nextActionableTasks(current);
    const [firstActionable] = actionable;
    if (firstActionable) {
      emitGoalEvent({
        type: "goal-stalled",
        appPath,
        goalId: state.goalId,
        reason: `No goal-state progress for ${Math.round(STALL_NOTIFY_MS / 60000)}m with ${actionable.length} actionable task(s). Next: "${firstActionable.title}".`,
        at: Date.now(),
      });
      // Touch nothing: re-arm by bumping updatedAt so we notify at most
      // once per window while still stalled.
      await persist(appPath, current);
    }
  }
}

async function tick(): Promise<void> {
  if (scheduling) {
    wakeQueued = true;
    return;
  }
  scheduling = true;
  try {
    for (const appPath of registeredAppPaths) {
      let goals: GoalState[];
      try {
        goals = await listGoals(appPath);
      } catch {
        continue;
      }
      await recoverExpiredRuns(appPath).catch(() => 0);
      for (const goal of goals) {
        try {
          await reconcileGoalRow(appPath, goal);
        } catch {
          // one bad goal file must never wedge the scheduler
        }
      }
    }
  } finally {
    scheduling = false;
    if (wakeQueued) {
      wakeQueued = false;
      void tick();
    }
  }
}

/** Donor startGoalScheduler parity (lifetime = server process, no tray). */
export function startGoalScheduler(): void {
  if (schedulerTimer) return;
  const timer = setInterval(() => void tick(), SCHEDULER_INTERVAL_MS);
  (timer as unknown as { unref?: () => void }).unref?.();
  schedulerTimer = timer;
  void tick();
}

/** Donor stopGoalScheduler parity. */
export function stopGoalScheduler(): void {
  if (!schedulerTimer) return;
  clearInterval(schedulerTimer);
  schedulerTimer = null;
}

/** Donor wakeGoalScheduler parity: schedule an immediate tick (coalesced). */
export function wakeGoalScheduler(): void {
  if (!schedulerTimer) return;
  void tick();
}

/**
 * Immediate retry (donor retryGoalNow, file-backed): clear failures, force
 * active, wake the scheduler. No run queue exists file-side — the next
 * agent turn picks the work up via advance_goal.
 */
export async function retryGoalNow(appPath: string, goalId: string): Promise<string> {
  const state = await readGoal(appPath, goalId);
  state.status = "active";
  state.blocker = null;
  state.consecutiveFailures = 0;
  state.nextRetryAt = null;
  await persist(appPath, state);
  wakeGoalScheduler();
  return `Goal "${state.objective}" reset to active — immediate retry scheduled.`;
}

/**
 * Independent verification on demand (donor verifyGoalNow, file-backed):
 * run the verification pass now and wake the scheduler.
 */
export async function verifyGoalNow(appPath: string, goalId: string): Promise<string> {
  const result = await verifyGoal(appPath, goalId);
  wakeGoalScheduler();
  return result;
}

export { retryTask };
