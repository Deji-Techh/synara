import { useCallback, useEffect, useRef, useState } from "react";
import { type GoalRun } from "@caide/contracts";
import { ipc } from "./stubs";
import { useStreamChat } from "./stubs";
import { useAtomValue } from "./stubs";
import { pendingToolConsentsAtom } from "./stubs";

const RUNNER_HEARTBEAT_MS = 10_000;
const RUNNER_POLL_MS = 2_000;

function getRunnerId(): string {
  const key = "caide-goal-runner-id";
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const id = `renderer-${crypto.randomUUID()}`;
  sessionStorage.setItem(key, id);
  return id;
}

export function GoalRuntimeBridge() {
  const { streamMessage } = useStreamChat({ hasChatId: false });
  const runnerIdRef = useRef<string>(getRunnerId());
  const pendingToolConsents = useAtomValue(pendingToolConsentsAtom);
  const executingRunIdsRef = useRef(new Set<string>());
  const activeRunsRef = useRef(new Map<string, GoalRun>());
  const waitingByRunIdRef = useRef(new Map<string, boolean>());
  const [activeRunVersion, setActiveRunVersion] = useState(0);
  const executionQueueRef = useRef<Promise<void>>(Promise.resolve());

  const executeRunNow = useCallback(
    async (offeredRun: GoalRun) => {
      if (executingRunIdsRef.current.has(offeredRun.id)) return;
      executingRunIdsRef.current.add(offeredRun.id);
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      try {
        const run = await ipc.goal.claimRun({
          runId: offeredRun.id,
          runnerId: runnerIdRef.current,
        });
        if (!run) return;
        activeRunsRef.current.set(run.id, run);
        waitingByRunIdRef.current.set(run.id, false);
        setActiveRunVersion((version) => version + 1);

        heartbeat = setInterval(() => {
          void ipc.goal.heartbeatRun({
            runId: run.id,
            runnerId: runnerIdRef.current,
          });
        }, RUNNER_HEARTBEAT_MS);

        const settled = await new Promise<{
          success: boolean;
          pausedByStepLimit?: boolean;
          error?: string;
        }>((resolve) => {
          void streamMessage({
            prompt: run.prompt,
            chatId: run.chatId,
            appId: run.appId,
            redo: false,
            requestedChatMode: "local-agent",
            suppressUserMessage: true,
            onSettled: resolve,
          });
        });

        await ipc.goal.completeRun({
          runId: run.id,
          runnerId: runnerIdRef.current,
          success: settled.success,
          pausedByStepLimit: settled.pausedByStepLimit,
          error: settled.success
            ? undefined
            : (settled.error ?? "Agent execution did not settle successfully."),
        });
      } catch (error) {
        try {
          await ipc.goal.completeRun({
            runId: offeredRun.id,
            runnerId: runnerIdRef.current,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        } catch {
          // A stale lease is expected when another renderer recovered the run.
        }
      } finally {
        if (heartbeat) clearInterval(heartbeat);
        activeRunsRef.current.delete(offeredRun.id);
        waitingByRunIdRef.current.delete(offeredRun.id);
        setActiveRunVersion((version) => version + 1);
        executingRunIdsRef.current.delete(offeredRun.id);
      }
    },
    [streamMessage],
  );

  const enqueueRun = useCallback(
    (run: GoalRun) => {
      executionQueueRef.current = executionQueueRef.current
        .catch(() => undefined)
        .then(() => executeRunNow(run));
    },
    [executeRunNow],
  );

  const poll = useCallback(async () => {
    const runs = await ipc.goal.listRunnableRuns({
      runnerId: runnerIdRef.current,
    });
    for (const run of runs) enqueueRun(run);
  }, [enqueueRun]);

  useEffect(() => {
    const waitingChatIds = new Set(
      pendingToolConsents.map((consent) => consent.chatId),
    );
    for (const run of activeRunsRef.current.values()) {
      const waiting = waitingChatIds.has(run.chatId);
      if (waitingByRunIdRef.current.get(run.id) === waiting) continue;
      waitingByRunIdRef.current.set(run.id, waiting);
      void ipc.goal
        .setRunWaiting({
          runId: run.id,
          runnerId: runnerIdRef.current,
          waiting,
        })
        .catch(() => {
          // The run may have settled while the approval state was changing.
        });
    }
  }, [activeRunVersion, pendingToolConsents]);

  useEffect(() => {
    const unsubscribeRun = ipc.events.goal.onRunRequested(({ run }) => {
      enqueueRun(run);
    });
    const unsubscribeControl = ipc.events.goal.onControlRequested(
      ({ chatId }) => {
        if (chatId !== null) void ipc.chat.cancelStream(chatId);
      },
    );
    const interval = setInterval(() => void poll(), RUNNER_POLL_MS);
    void poll();
    return () => {
      clearInterval(interval);
      unsubscribeRun();
      unsubscribeControl();
    };
  }, [enqueueRun, poll]);

  return null;
}
