// FILE: useChatThreadActions.ts
// Purpose: Thread actions — rename, archive, delete, handoff, fork. Extracted from ChatView sidebar coupling.

import { useCallback } from "react";
import { dispatchThreadRename } from "../lib/threadRename";
import { useThreadHandoff } from "./useThreadHandoff";
import type { ThreadId } from "@caide/contracts";

export function useChatThreadActions(threadId: ThreadId) {
  const { createThreadHandoff } = useThreadHandoff();
  const rename = useCallback(
    (title: string) => dispatchThreadRename(threadId, title),
    [threadId],
  );
  const handoff = useCallback(
    (targetProvider: string) => createThreadHandoff(threadId, targetProvider as never),
    [createThreadHandoff, threadId],
  );
  return { rename, handoff };
}
