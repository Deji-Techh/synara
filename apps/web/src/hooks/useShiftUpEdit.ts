// FILE: useShiftUpEdit.ts
// Purpose: Shift+Up edits last user message — premium keyboard flow.
// Scoped to composer focus only (not global), checks prompt empty.

import { useCallback, useEffect } from "react";
import type { ThreadId } from "@caide/contracts";
import { useStore } from "../store";
import { createThreadSelector } from "../storeSelectors";
import { useComposerThreadDraft } from "../composerDraftStore";

function isComposerFocused(): boolean {
  const el = document.activeElement;
  return el instanceof HTMLElement && el.closest("[data-composer-editor]") !== null;
}

export function useShiftUpEdit(threadId: ThreadId, onEdit: (messageId: string, text: string) => void) {
  const thread = useStore(createThreadSelector(threadId));
  const draft = useComposerThreadDraft(threadId);
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== "ArrowUp" || !e.shiftKey) return;
      if (!isComposerFocused()) return;
      if (draft.prompt.trim().length > 0) return;
      const lastUser = [...(thread?.messages ?? [])].reverse().find((m) => m.role === "user");
      if (lastUser) {
        e.preventDefault();
        onEdit(lastUser.id, lastUser.text);
      }
    },
    [thread?.messages, draft.prompt, onEdit],
  );
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
