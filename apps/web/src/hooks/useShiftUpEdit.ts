// FILE: useShiftUpEdit.ts
// Purpose: Shift+Up edits last user message — premium keyboard flow.
// Wires composer to last user bubble without mouse.

import { useCallback, useEffect } from "react";
import type { ThreadId } from "@caide/contracts";
import { useStore } from "../store";
import { createThreadSelector } from "../storeSelectors";

export function useShiftUpEdit(threadId: ThreadId, onEdit: (messageId: string, text: string) => void) {
  const thread = useStore(createThreadSelector(threadId));
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" && e.shiftKey && thread?.messages) {
        const lastUser = [...thread.messages].reverse().find((m) => m.role === "user");
        if (lastUser) {
          e.preventDefault();
          onEdit(lastUser.id, lastUser.text);
        }
      }
    },
    [thread?.messages, onEdit],
  );
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
