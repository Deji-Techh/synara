// FILE: useChatTurnLifecycle.ts
// Purpose: Isolated turn lifecycle — extracted from ChatView.tsx for single isAtEnd ownership.
// Owns: latestTurn, session, working state, interrupt/steer. No composer logic.

import { useMemo } from "react";
import { useStore } from "../store";
import { createThreadSelector } from "../storeSelectors";
import { derivePhase, isLatestTurnSettled, hasLiveTurnTailWork } from "../session-logic";
import type { ThreadId } from "@caide/contracts";

export function useChatTurnLifecycle(threadId: ThreadId) {
  const thread = useStore(useMemo(() => createThreadSelector(threadId), [threadId]));
  const phase = useMemo(() => (thread ? derivePhase(thread) : null), [thread]);
  const isWorking = phase === "running" || phase === "waiting";
  const activeTurnInProgress = thread?.latestTurn?.state === "running";
  const isSettled = thread ? isLatestTurnSettled(thread) : true;
  const hasTailWork = thread ? hasLiveTurnTailWork(thread) : false;
  return { thread, phase, isWorking, activeTurnInProgress, isSettled, hasTailWork };
}
