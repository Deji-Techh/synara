// FILE: src/ipc/goal/goal_runtime_executor.ts
// Purpose: Engine-side goal run executor — the re-host of dyad's renderer
// GoalRuntimeBridge. dyad executed goal runs in the renderer (claim →
// chat stream → heartbeat → complete); with the Caide engine headless on
// stdio, the same loop runs here in the main process:
//
//  1. Poll `caide_goal_runs` for runnable runs (+ subscribe to run-requested)
//  2. Claim the run lease, heartbeat every RUNNER_HEARTBEAT_MS
//  3. Execute the run prompt as a local-agent `chat:stream` on the run's chat
//  4. Mark the run waiting while a tool/MCP consent for that chat is pending
//  5. Complete the run via handleCompletedRun (retry/repair scheduling lives
//     there), cancelling the active stream on goal control-requested events
//
// Single runner: the engine is the only goal runner (`RUNNER_ID`), so no
// cross-runner arbitration beyond the store's lease discipline is needed.

import { ipcMain, type WebContents } from "electron";
import log from "electron-log";
import { on } from "../utils/event_bus";
import {
  claimRun,
  heartbeatRun,
  listRunnableRuns,
  setRunWaiting,
} from "./goal_store";
import { handleCompletedRun } from "./goal_scheduler";
import { chatContracts, chatStreamContract } from "@/ipc/types/chat";
import type { GoalRun, GoalRunRequested } from "@/ipc/types/goal";
import type { ChatResponseEnd, ChatStreamParams } from "@/ipc/types";

const logger = log.scope("goal_runtime");
const RUNNER_ID = "caide-engine";
const RUNNER_POLL_MS = 2_000;
const RUNNER_HEARTBEAT_MS = 10_000;
const STREAM_SETTLE_TIMEOUT_MS = 30 * 60_000;

let started = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
const executingRunIds = new Set<string>();
const waitingByRunId = new Map<string, boolean>();
const pendingConsentCounts = new Map<number, number>();
const consentChatByRequestId = new Map<string, number>();
const executionQueueRef: { current: Promise<void> } = { current: Promise.resolve() };

// Sender shim for renderer-directed events: routing is handled by the engine
// entry (dispatchDyadInvoke), so for in-process event delivery this is a
// no-op sender — safeSend still guards it like a real WebContents.
function busSender(): WebContents {
  return {
    id: 0,
    isDestroyed: () => false,
    send(_channel: string, ..._args: unknown[]): void {},
  } as unknown as WebContents;
}

function trackConsentRequest(payload: {
  requestId?: string;
  chatId?: number;
}): void {
  if (payload.chatId === undefined) return;
  pendingConsentCounts.set(
    payload.chatId,
    (pendingConsentCounts.get(payload.chatId) ?? 0) + 1,
  );
  if (payload.requestId) {
    consentChatByRequestId.set(payload.requestId, payload.chatId);
  }
}

function clearConsentRequest(requestId: string): void {
  const chatId = consentChatByRequestId.get(requestId);
  if (chatId === undefined) return;
  consentChatByRequestId.delete(requestId);
  const next = (pendingConsentCounts.get(chatId) ?? 1) - 1;
  if (next <= 0) {
    pendingConsentCounts.delete(chatId);
  } else {
    pendingConsentCounts.set(chatId, next);
  }
}

function hasPendingConsent(chatId: number): boolean {
  return (pendingConsentCounts.get(chatId) ?? 0) > 0;
}

// Drives a `chat:stream` to settlement for the run's chat, resolving from the
// `chat:stream:end` event (emitted in the handler's finally block). The
// `chat:response:end` payload (wasCancelled / pausePromptQueue) and any
// `chat:response:error` payload are captured on the way.
function driveStream(chatId: number): Promise<{
  success: boolean;
  pausedByStepLimit?: boolean;
  error?: string;
}> {
  return new Promise((resolve) => {
    let responseEnd: ChatResponseEnd | undefined;
    let streamError: string | undefined;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      unsubResponseEnd();
      unsubResponseError();
      unsubStreamEnd();
      if (timer) clearTimeout(timer);
    };

    const settle = (result: {
      success: boolean;
      pausedByStepLimit?: boolean;
      error?: string;
    }): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const unsubResponseEnd = on("chat:response:end", (payload) => {
      const p = payload as Partial<ChatResponseEnd> & { chatId?: number };
      if (p.chatId !== chatId) return;
      responseEnd = p as ChatResponseEnd;
    });

    const unsubResponseError = on("chat:response:error", (payload) => {
      const p = payload as { chatId?: number; error?: string };
      if (p.chatId !== chatId) return;
      streamError = p.error;
    });

    const unsubStreamEnd = on("chat:stream:end", (payload) => {
      if ((payload as { chatId?: number }).chatId !== chatId) return;
      const cancelled = responseEnd?.wasCancelled === true;
      settle({
        success: !cancelled && !streamError,
        pausedByStepLimit: responseEnd?.pausePromptQueue === true,
        error:
          streamError ??
          (cancelled ? "Goal run was cancelled." : undefined),
      });
    });

    timer = setTimeout(() => {
      settle({
        success: false,
        error: "Goal run stream timed out without settling.",
      });
    }, STREAM_SETTLE_TIMEOUT_MS);
  });
}

async function syncRunWaiting(run: GoalRun): Promise<void> {
  try {
    const waiting = hasPendingConsent(run.chatId);
    if (waitingByRunId.get(run.id) === waiting) return;
    waitingByRunId.set(run.id, waiting);
    await setRunWaiting({
      runId: run.id,
      runnerId: RUNNER_ID,
      waiting,
      reason: waiting
        ? "Tool approval required for active goal run. Open the goal chat to review it."
        : undefined,
    });
  } catch (error) {
    logger.warn(`syncRunWaiting(${run.id}) failed:`, error);
  }
}

async function cancelActiveStream(chatId: number): Promise<void> {
  const cancelHandler = ipcMain._handlers.get(chatContracts.cancelStream.channel);
  if (!cancelHandler) return;
  try {
    await cancelHandler(
      { sender: busSender(), processId: process.pid, frameId: 0 },
      chatId,
    );
  } catch (error) {
    logger.warn(`cancel stream for chat ${chatId} failed:`, error);
  }
}

async function executeRunNow(offeredRun: GoalRun): Promise<void> {
  if (executingRunIds.has(offeredRun.id)) return;
  executingRunIds.add(offeredRun.id);
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  try {
    const run = claimRun(offeredRun.id, RUNNER_ID);
    if (!run) return;

    void syncRunWaiting(run);
    heartbeat = setInterval(() => {
      try {
        heartbeatRun(run.id, RUNNER_ID);
      } catch (error) {
        logger.warn(`heartbeat run ${run.id} failed:`, error);
      }
      void syncRunWaiting(run);
    }, RUNNER_HEARTBEAT_MS);
    const streamHandler = ipcMain._handlers.get(chatStreamContract.channel);
    if (!streamHandler) {
      throw new Error("chat:stream handler is not registered");
    }

    const settlePromise = driveStream(run.chatId);
    const event = { sender: busSender(), processId: process.pid, frameId: 0 };
    const params: ChatStreamParams = {
      prompt: run.prompt,
      chatId: run.chatId,
      redo: false,
      requestedChatMode: "local-agent",
      suppressUserMessage: true,
    };
    await streamHandler(event, params);
    const settled = await settlePromise;

    logger.info(
      `goal run ${run.id} settled: success=${settled.success}${settled.error ? ` error=${settled.error}` : ""}`,
    );
    await handleCompletedRun({
      runId: run.id,
      runnerId: RUNNER_ID,
      success: settled.success,
      pausedByStepLimit: settled.pausedByStepLimit,
      error: settled.success ? undefined : settled.error,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`goal run ${offeredRun.id} failed to execute: ${message}`);
    try {
      await handleCompletedRun({
        runId: offeredRun.id,
        runnerId: RUNNER_ID,
        success: false,
        error: message,
      });
    } catch {
      // A stale lease is expected when the scheduler already recovered the run.
    }
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    pendingConsentCounts.delete(offeredRun.chatId);
    waitingByRunId.delete(offeredRun.id);
    executingRunIds.delete(offeredRun.id);
  }
}

function enqueueRun(run: GoalRun): void {
  executionQueueRef.current = executionQueueRef.current
    .catch(() => undefined)
    .then(() => executeRunNow(run));
}

async function pollRunnableRuns(): Promise<void> {
  try {
    const runs = listRunnableRuns(10);
    for (const run of runs) {
      enqueueRun(run);
    }
  } catch (error) {
    logger.warn("pollRunnableRuns failed:", error);
  }
}

export function startGoalRuntime(): void {
  if (started) return;
  started = true;

  on("goal:run-requested", (payload) => {
    const requested = payload as GoalRunRequested;
    if (requested?.run) {
      enqueueRun(requested.run);
    }
  });

  on("goal:control-requested", (payload) => {
    const p = payload as {
      goalId?: string;
      chatId?: number | null;
      action?: string;
    };
    if (p.chatId === null || p.chatId === undefined) return;
    void cancelActiveStream(p.chatId);
  });

  on("mcp:tool-consent-request", (payload) => {
    trackConsentRequest(payload as { requestId?: string; chatId?: number });
  });
  on("agent-tool:consent-request", (payload) => {
    trackConsentRequest(payload as { requestId?: string; chatId?: number });
  });
  on("mcp:tool-consent-resolved", (payload) => {
    clearConsentRequest((payload as { requestId?: string }).requestId ?? "");
  });
  on("mcp:tool-consent-classified", (payload) => {
    clearConsentRequest((payload as { requestId?: string }).requestId ?? "");
  });
  on("chat:stream:end", (payload) => {
    const chatId = (payload as { chatId?: number }).chatId;
    if (chatId !== undefined) {
      pendingConsentCounts.delete(chatId);
    }
  });

  pollTimer = setInterval(() => void pollRunnableRuns(), RUNNER_POLL_MS);
  void pollRunnableRuns();
  logger.info(`goal runtime started (runner=${RUNNER_ID})`);
}