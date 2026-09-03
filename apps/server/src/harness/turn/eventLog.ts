// FILE: eventLog.ts
// Purpose: Durable harness event log + replay. Every turn event is appended
// to the session JSONL log (type "harness/event"); on WS subscribe the
// server replays the tail so reconnecting clients rebuild UI state without
// the orchestration projections. Token deltas are buffered per turn and
// stored as one transcript chunk to keep the log compact.

import { SessionStorage } from "../session/storage.ts";
import type { HarnessEvent } from "@caide/contracts";

export const EVENT_REPLAY_LIMIT = 200;

let storage: SessionStorage | null = null;
/** Test seam: isolate from ~/.caide. */
export function setEventLogStorage(s: SessionStorage | null): void {
  storage = s;
}

function activeStorage(): SessionStorage {
  if (!storage) storage = new SessionStorage();
  return storage;
}

const tokenBuffers = new Map<string, string>();

function flushTokens(sessionId: string): { content: string } | null {
  const buffered = tokenBuffers.get(sessionId) ?? "";
  tokenBuffers.delete(sessionId);
  return buffered ? { content: buffered } : null;
}

/** Persist one turn event (fire-and-forget safe: never throws). */
export async function appendHarnessEvent(event: HarnessEvent): Promise<void> {
  try {
    const store = activeStorage();
    if (event.type === "token") {
      tokenBuffers.set(event.sessionId, (tokenBuffers.get(event.sessionId) ?? "") + event.content);
      return;
    }
    const flushed = flushTokens(event.sessionId);
    if (flushed) {
      await store.append(event.sessionId, "harness/event", { type: "token", ...flushed });
    }
    await store.append(event.sessionId, "harness/event", event);
  } catch {
    // logging must never break a turn
  }
}

/** Flush any buffered tokens (turn end) so the transcript is complete. */
export async function flushTurnTokens(sessionId: string): Promise<void> {
  try {
    const flushed = flushTokens(sessionId);
    if (flushed) await activeStorage().append(sessionId, "harness/event", { type: "token", ...flushed });
  } catch {
    // ignore
  }
}

/** Read back the tail of a session's event log for replay. */
export async function readHarnessEvents(sessionId: string, limit = EVENT_REPLAY_LIMIT): Promise<HarnessEvent[]> {
  try {
    const entries = await activeStorage().readEntries(sessionId);
    return entries
      .filter((e) => e.type === "harness/event")
      .slice(-limit)
      .map((e) => e.data as HarnessEvent)
      .filter((e) => e && typeof e.type === "string");
  } catch {
    return [];
  }
}
