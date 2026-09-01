// FILE: engineSubagentStore.ts
// Purpose: External store for engine-registered subagents (spawn_subagent
// tasks) fed by the `subagents:subscribe` WS stream + `subagents:getActive`
// snapshot. Drives the live running-subagent indicators (composer strip rows,
// goals panel Subagents tab) that the transcript alone cannot provide.
// Layer: Web UI state store (zustand v5, no persistence — the engine's
// in-memory task map is the source of truth).
import "./polyfills";
import type { EngineActiveSubagent, EngineSubagentEvent } from "@caide/contracts";
import { create } from "zustand";

import { ensureNativeApi } from "./nativeApi";

export interface EngineSubagentRow {
  taskId: string;
  role: string;
  task: string;
  status: "running" | "completed" | "failed";
  startedAt: number;
  appId?: number | undefined;
  chatId?: number | undefined;
}

/** Settled rows linger briefly so the strip can show the outcome, then retire. */
const SETTLED_ROW_TTL_MS = 6_000;

function rowFromEvent(event: EngineSubagentEvent): EngineSubagentRow {
  return {
    taskId: event.taskId,
    role: event.role,
    task: event.task,
    status: event.status,
    startedAt: event.startedAt,
    appId: event.appId,
    chatId: event.chatId,
  };
}

function rowFromSnapshot(entry: EngineActiveSubagent): EngineSubagentRow {
  return {
    taskId: entry.id,
    role: entry.name,
    task: entry.description,
    status: entry.status ?? "running",
    startedAt: entry.startedAt,
    appId: entry.appId,
    chatId: entry.chatId,
  };
}

interface EngineSubagentStoreState {
  /** Engine subagents observed recently, newest first. */
  subagents: EngineSubagentRow[];
  loaded: boolean;
  /** Pull a snapshot of currently-registered engine subagents. */
  refresh: () => Promise<void>;
  /** Apply one live `subagent:updated` event. */
  handleEvent: (event: EngineSubagentEvent) => void;
  /** Drop settled rows past their visibility TTL (called on a timer). */
  pruneSettled: () => void;
}

let unsubscribeEvent: (() => void) | null = null;
let pruneTimer: ReturnType<typeof setInterval> | null = null;

function sortRows(rows: EngineSubagentRow[]): EngineSubagentRow[] {
  return [...rows].sort((a, b) => b.startedAt - a.startedAt);
}

export const useEngineSubagentStore = create<EngineSubagentStoreState>()((set, get) => ({
  subagents: [],
  loaded: false,

  refresh: async () => {
    try {
      const entries = await ensureNativeApi().subagents.getActive({});
      const now = Date.now();
      const snapshotIds = new Set(entries.map((entry) => entry.id));
      set((state) => ({
        // Keep settled rows already observed via events (the snapshot only
        // carries registered/running tasks) but drop stale ones.
        subagents: sortRows([
          ...entries.map(rowFromSnapshot),
          ...state.subagents.filter(
            (row) =>
              !snapshotIds.has(row.taskId) &&
              (row.status === "running" || now - row.startedAt < SETTLED_ROW_TTL_MS),
          ),
        ]),
        loaded: true,
      }));
    } catch (error) {
      console.warn("Engine subagent snapshot failed", error);
    }
  },

  handleEvent: (event) => {
    const row = rowFromEvent(event);
    set((state) => {
      const rest = state.subagents.filter((existing) => existing.taskId !== row.taskId);
      return { subagents: sortRows([row, ...rest]), loaded: true };
    });
  },

  pruneSettled: () => {
    const now = Date.now();
    set((state) => {
      const next = state.subagents.filter(
        (row) => row.status === "running" || now - row.startedAt < SETTLED_ROW_TTL_MS,
      );
      return next.length === state.subagents.length ? state : { subagents: next };
    });
  },
}));

/**
 * Idempotently wire the live stream + prune timer. Call from a component
 * mount effect; the returned disposer unwires when the last consumer goes.
 */
let consumers = 0;
export function ensureEngineSubagentSubscription(): () => void {
  consumers += 1;
  if (!unsubscribeEvent) {
    unsubscribeEvent = ensureNativeApi().subagents.onEvent((event) => {
      useEngineSubagentStore.getState().handleEvent(event);
    });
  }
  if (!pruneTimer) {
    pruneTimer = setInterval(() => {
      useEngineSubagentStore.getState().pruneSettled();
    }, 2_000);
  }
  void useEngineSubagentStore.getState().refresh();
  return () => {
    consumers -= 1;
    if (consumers > 0) return;
    unsubscribeEvent?.();
    unsubscribeEvent = null;
    if (pruneTimer) {
      clearInterval(pruneTimer);
      pruneTimer = null;
    }
  };
}
