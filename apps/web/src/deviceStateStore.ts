/**
 * Thread-scoped device metadata cache.
 *
 * The live simulator surface is a canvas fed by binary frames; this store keeps
 * only the metadata the pane chrome needs (device list, attachment, agent
 * activity, availability) so a thread switch renders instantly and a late push
 * can never roll the pane back to an older generation.
 *
 * Deliberately not persisted: device boot state is only meaningful while the
 * server that reported it is alive, and a stale "Booted" from last week's
 * session would render a picker that lies.
 */

import type { ThreadDeviceState, ThreadId } from "@caide/contracts";
import { create } from "zustand";

/**
 * Which chassis the preview pane draws the live Flutter app in. Frameless is
 * the fluid full-bleed view (no bezel, no rail); the rest map onto the
 * DeviceFrame kinds.
 */
export type PreviewFrameKind = "androidPhone" | "iPhone" | "iPad" | "frameless";

interface DeviceStateStore {
  threadStatesByThreadId: Record<string, ThreadDeviceState | undefined>;
  upsertThreadState: (state: ThreadDeviceState) => void;
  removeThreadState: (threadId: ThreadId) => void;
  clear: () => void;
  /**
   * Per-thread preview frame choice. Persistently stored next to the thread's
   * device metadata so the chosen frame survives the preview pane closing and
   * reopening (the pane state itself is not persisted).
   */
  frameKindByThreadId: Record<string, PreviewFrameKind | undefined>;
  setFrameKind: (threadId: ThreadId, kind: PreviewFrameKind) => void;
}

export const useDeviceStateStore = create<DeviceStateStore>()((set) => ({
  threadStatesByThreadId: {},
  upsertThreadState: (state) =>
    set((current) => {
      const previousState = current.threadStatesByThreadId[state.threadId];
      // The server pushes state independently of the RPCs the pane issues, so a
      // slow `device.getThreadState` response can land after a newer push. The
      // version is monotonic per thread; anything at or behind the current one
      // is a straggler and must not overwrite live attachment or device lists.
      if (previousState && previousState.version >= state.version) {
        return current;
      }
      return {
        threadStatesByThreadId: {
          ...current.threadStatesByThreadId,
          [state.threadId]: state,
        },
      };
    }),
  removeThreadState: (threadId) =>
    set((current) => {
      const hasState = Object.hasOwn(current.threadStatesByThreadId, threadId);
      const hasFrameKind = Object.hasOwn(current.frameKindByThreadId, threadId);
      if (!hasState && !hasFrameKind) {
        return current;
      }
      const nextThreadStatesByThreadId = { ...current.threadStatesByThreadId };
      if (hasState) {
        delete nextThreadStatesByThreadId[threadId];
      }
      const nextFrameKindByThreadId = { ...current.frameKindByThreadId };
      if (hasFrameKind) {
        delete nextFrameKindByThreadId[threadId];
      }
      return {
        threadStatesByThreadId: nextThreadStatesByThreadId,
        frameKindByThreadId: nextFrameKindByThreadId,
      };
    }),
  clear: () => set({ threadStatesByThreadId: {}, frameKindByThreadId: {} }),
  frameKindByThreadId: {},
  setFrameKind: (threadId, kind) =>
    set((current) => {
      if (current.frameKindByThreadId[threadId] === kind) {
        return current;
      }
      return { frameKindByThreadId: { ...current.frameKindByThreadId, [threadId]: kind } };
    }),
}));

// Dev-only handle so the pane's availability and setup states — which otherwise
// require a Mac without Xcode, or a broken helper — can be driven directly when
// verifying the UI. Stripped from production builds by the import.meta.env guard.
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__deviceStateStoreForTests = useDeviceStateStore;
}

export function selectThreadDeviceState(
  threadId: ThreadId,
): (store: DeviceStateStore) => ThreadDeviceState | undefined {
  return (store) => store.threadStatesByThreadId[threadId];
}

export function selectThreadFrameKind(
  threadId: ThreadId,
): (store: DeviceStateStore) => PreviewFrameKind | undefined {
  return (store) => store.frameKindByThreadId[threadId];
}
