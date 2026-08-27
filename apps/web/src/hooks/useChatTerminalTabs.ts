// FILE: useChatTerminalTabs.ts
// Purpose: Terminal tabs per thread — extracted from ChatView.tsx.
// Owns: terminalStateByThreadId selection, running indicators.

import { useMemo } from "react";
import { selectThreadTerminalState, useTerminalStateStore } from "../terminalStateStore";
import type { ThreadId } from "@caide/contracts";

export function useChatTerminalTabs(threadId: ThreadId) {
  const terminalStateByThreadId = useTerminalStateStore((s) => s.terminalStateByThreadId);
  const terminalState = useMemo(
    () => selectThreadTerminalState(terminalStateByThreadId, threadId),
    [terminalStateByThreadId, threadId],
  );
  return terminalState;
}
