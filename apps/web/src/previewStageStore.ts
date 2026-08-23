// FILE: previewStageStore.ts
// Purpose: Per-thread floating preview stage (replaces right-dock preview).
// Layer: UI state store
// Notes: Fixed-size Android stage triggered via /preview only. No dock coupling.

import type { ThreadId } from "@caide/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { isPlainObject, sanitizeStringKeyedRecord } from "./persistedRecord";

const PREVIEW_STAGE_STORAGE_KEY = "caide:preview-stage:v1";

export interface PreviewStageThreadState {
  open: boolean;
}

function createDefaultPreviewStageState(): PreviewStageThreadState {
  return { open: false };
}

function sanitizePreviewStageThreadState(value: unknown): PreviewStageThreadState {
  if (!isPlainObject(value)) return createDefaultPreviewStageState();
  return { open: value.open === true };
}

function sanitizePreviewStageStateByThreadId(
  value: unknown,
): Record<string, PreviewStageThreadState> {
  return sanitizeStringKeyedRecord(value, (raw) =>
    raw === undefined ? null : sanitizePreviewStageThreadState(raw),
  );
}

interface PreviewStageStore {
  stageStateByThreadId: Record<string, PreviewStageThreadState | undefined>;
  open: (threadId: ThreadId) => void;
  close: (threadId: ThreadId) => void;
  toggle: (threadId: ThreadId) => void;
  setOpen: (threadId: ThreadId, open: boolean) => void;
  clearThreadState: (threadId: ThreadId) => void;
}

const DEFAULT_STAGE_STATE = createDefaultPreviewStageState();
Object.freeze(DEFAULT_STAGE_STATE);

function commit(
  set: (fn: (store: PreviewStageStore) => Partial<PreviewStageStore>) => void,
  threadId: ThreadId,
  transform: (state: PreviewStageThreadState) => PreviewStageThreadState,
): void {
  set((store) => {
    const previous = store.stageStateByThreadId[threadId] ?? DEFAULT_STAGE_STATE;
    const next = transform(previous);
    if (next === previous) return {};
    return {
      stageStateByThreadId: {
        ...store.stageStateByThreadId,
        [threadId]: next,
      },
    };
  });
}

export const usePreviewStageStore = create<PreviewStageStore>()(
  persist(
    (set) => ({
      stageStateByThreadId: {},
      open: (threadId) => commit(set, threadId, () => ({ open: true })),
      close: (threadId) => commit(set, threadId, () => ({ open: false })),
      toggle: (threadId) => commit(set, threadId, (state) => ({ open: !state.open })),
      setOpen: (threadId, open) => commit(set, threadId, () => ({ open })),
      clearThreadState: (threadId) =>
        set((store) => {
          if (!Object.hasOwn(store.stageStateByThreadId, threadId)) return {};
          const next = { ...store.stageStateByThreadId };
          delete next[threadId];
          return { stageStateByThreadId: next };
        }),
    }),
    {
      name: PREVIEW_STAGE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => ({
        ...current,
        stageStateByThreadId: sanitizePreviewStageStateByThreadId(
          (persisted as { stageStateByThreadId?: unknown } | undefined)?.stageStateByThreadId,
        ),
      }),
    },
  ),
);

export function selectPreviewStageState(threadId: ThreadId | null) {
  return (store: PreviewStageStore) =>
    (threadId ? store.stageStateByThreadId[threadId] : undefined) ?? DEFAULT_STAGE_STATE;
}
