// FILE: chatTitleGeneration.ts
// Purpose: Owns the new-chat naming flow: skeleton-pending state, AI title
// generation through the configured chat-title model, and the deterministic
// `Chat N` fallback when no title model is available.
// Layer: Web orchestration helper + pending-title store
// Exports: useChatTitleStore, beginChatTitleForFirstSend, pure title helpers

import type { ProjectId, ThreadId } from "@caide/contracts";
import {
  buildChatNumberFallbackTitle,
  isPendingChatThreadTitle,
  sanitizeGeneratedThreadTitle,
} from "@caide/shared/chatThreads";
import { create } from "zustand";

import { readNativeApi } from "../nativeApi";
import { useStore } from "../store";
import { useTemporaryThreadStore } from "../temporaryThreadStore";
import { dispatchThreadRename } from "./threadRename";

/** How long a freshly generated title plays its reveal animation. */
export const CHAT_TITLE_REVEAL_MS = 1200;

interface ChatTitleStoreState {
  pendingThreadIds: Record<ThreadId, true | undefined>;
  revealedAtByThreadId: Record<ThreadId, number | undefined>;
  markChatTitlePending: (threadId: ThreadId) => void;
  markChatTitleRevealed: (threadId: ThreadId) => void;
  clearChatTitlePending: (threadId: ThreadId) => void;
}

export const useChatTitleStore = create<ChatTitleStoreState>((set) => ({
  pendingThreadIds: {},
  revealedAtByThreadId: {},
  markChatTitlePending: (threadId) => {
    if (threadId.length === 0) return;
    set((state) => {
      if (state.pendingThreadIds[threadId]) {
        return state;
      }
      return {
        pendingThreadIds: { ...state.pendingThreadIds, [threadId]: true },
      };
    });
  },
  markChatTitleRevealed: (threadId) => {
    if (threadId.length === 0) return;
    set((state) => {
      const nextPending = { ...state.pendingThreadIds };
      delete nextPending[threadId];
      return {
        pendingThreadIds: nextPending,
        revealedAtByThreadId: { ...state.revealedAtByThreadId, [threadId]: Date.now() },
      };
    });
  },
  clearChatTitlePending: (threadId) => {
    if (threadId.length === 0) return;
    set((state) => {
      if (!state.pendingThreadIds[threadId]) {
        return state;
      }
      const nextPending = { ...state.pendingThreadIds };
      delete nextPending[threadId];
      return { pendingThreadIds: nextPending };
    });
  },
}));

export interface ChatThreadIdentity {
  readonly id: ThreadId;
  readonly projectId: ProjectId;
  readonly createdAt: string;
  readonly archivedAt?: string | null;
}

// 1-based position of the thread among its project's non-archived chats,
// ordered by creation time. Unknown threads sort last so retries still
// produce a stable `Chat N` label instead of reusing an existing number.
export function resolveChatNumberForThread(
  threads: readonly ChatThreadIdentity[],
  projectId: ProjectId,
  threadId: ThreadId,
): number {
  const siblings = threads
    .filter((thread) => thread.projectId === projectId && !thread.archivedAt)
    .toSorted((left, right) =>
      left.createdAt < right.createdAt ? -1 : left.createdAt > right.createdAt ? 1 : 0,
    );
  const index = siblings.findIndex((thread) => thread.id === threadId);
  return (index === -1 ? siblings.length : index) + 1;
}

// Map a generation result onto the final title: a usable model title wins,
// anything generic/empty degrades to the deterministic `Chat N` fallback.
export function resolveFinalChatTitle(generatedTitle: string | null | undefined, chatNumber: number): string {
  const sanitized =
    generatedTitle && generatedTitle.trim().length > 0
      ? sanitizeGeneratedThreadTitle(generatedTitle)
      : "";
  if (sanitized.length === 0 || isPendingChatThreadTitle(sanitized)) {
    return buildChatNumberFallbackTitle(chatNumber);
  }
  return sanitized;
}

const inFlightChatTitleById = new Map<ThreadId, Promise<void>>();

function readProjectThreadsForChatNumber(projectId: ProjectId): ChatThreadIdentity[] {
  const shells = Object.values(useStore.getState().threadShellById ?? {});
  return shells.map((shell) => ({
    id: shell.id,
    projectId: shell.projectId,
    createdAt: shell.createdAt,
    archivedAt: shell.archivedAt ?? null,
  }));
}

// Fire-and-forget naming for a freshly created chat. Marks the thread pending
// (sidebar/header render skeletons) and resolves it to either the model
// title or `Chat N`. Never throws: the skeleton must always clear.
export function beginChatTitleForFirstSend(input: {
  threadId: ThreadId;
  projectId: ProjectId;
  message: string;
}): void {
  const { threadId, projectId } = input;
  const message = input.message.trim();
  if (threadId.length === 0 || message.length === 0) {
    return;
  }
  // Disposable and subagent threads keep their derived labels; only real
  // project chats go through AI naming.
  if (useTemporaryThreadStore.getState().temporaryThreadIds[threadId]) {
    return;
  }
  const shell = useStore.getState().threadShellById?.[threadId];
  if (shell?.parentThreadId) {
    return;
  }
  // A thread that already has a real title (e.g. a renamed or legacy chat)
  // must never flash a skeleton. Unknown titles (fresh drafts before the
  // promotion snapshot lands) are assumed pending.
  const shellTitle = shell?.title;
  if (shellTitle !== undefined && !isPendingChatThreadTitle(shellTitle)) {
    return;
  }
  useChatTitleStore.getState().markChatTitlePending(threadId);
  if (inFlightChatTitleById.has(threadId)) {
    return;
  }
  const task = ensureChatTitleForNewThread({ threadId, projectId, message }).finally(() => {
    inFlightChatTitleById.delete(threadId);
  });
  inFlightChatTitleById.set(threadId, task);
}

async function ensureChatTitleForNewThread(input: {
  threadId: ThreadId;
  projectId: ProjectId;
  message: string;
}): Promise<void> {
  const { threadId, projectId, message } = input;
  const { markChatTitleRevealed, clearChatTitlePending } = useChatTitleStore.getState();
  try {
    const api = readNativeApi();
    let generated: string | null = null;
    if (api) {
      try {
        const result = await api.server.generateThreadTitle({ message: message.slice(0, 8_000) });
        generated = result.title;
      } catch {
        generated = null;
      }
    }
    // A manual rename while generation ran wins; leave the user's title alone.
    const currentTitle = useStore.getState().threadShellById?.[threadId]?.title;
    if (currentTitle !== undefined && !isPendingChatThreadTitle(currentTitle)) {
      clearChatTitlePending(threadId);
      return;
    }
    const chatNumber = resolveChatNumberForThread(
      readProjectThreadsForChatNumber(projectId),
      projectId,
      threadId,
    );
    const finalTitle = resolveFinalChatTitle(generated, chatNumber);
    const renameOutcome = await dispatchThreadRename({
      threadId,
      newTitle: finalTitle,
      unchangedTitles: [],
    }).catch(() => null);
    if (renameOutcome === "renamed") {
      markChatTitleRevealed(threadId);
    } else {
      clearChatTitlePending(threadId);
    }
  } catch {
    clearChatTitlePending(threadId);
  }
}
