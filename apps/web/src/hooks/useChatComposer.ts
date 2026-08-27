// FILE: useChatComposer.ts
// Purpose: Isolated composer state — extracted from ChatView.tsx (12k LOC) for premium stability.
// Owns: prompt, attachments, queued turns, draft, send state. No transcript logic.

import { useCallback, useMemo } from "react";
import { useComposerThreadDraft } from "../composerDraftStore";
import type { ThreadId } from "@caide/contracts";
import { deriveComposerSendState } from "../components/ChatView.logic";

export function useChatComposer(threadId: ThreadId) {
  const draft = useComposerThreadDraft(threadId);
  const sendState = useMemo(
    () =>
      deriveComposerSendState({
        prompt: draft.prompt,
        imageCount: draft.images.length,
        fileCount: draft.files.length,
        assistantSelectionCount: draft.assistantSelections.length,
        browserAnnotationCount: draft.browserAnnotations.length,
        fileCommentCount: draft.fileComments.length,
        terminalContexts: draft.terminalContexts,
        pastedTexts: draft.pastedTexts,
      }),
    [draft],
  );
  return { draft, sendState };
}

export function useChatComposerSendState(threadId: ThreadId) {
  const { sendState } = useChatComposer(threadId);
  return sendState;
}
