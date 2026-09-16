// FILE: eventLog.ts
// Purpose: Durable harness event log + replay. Every turn event is appended
// to the session JSONL log (type "harness/event"); on WS subscribe the
// server replays the tail so reconnecting clients rebuild UI state without
// the orchestration projections. Token deltas are buffered per turn and
// stored as one transcript chunk to keep the log compact.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
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
    if (flushed)
      await activeStorage().append(sessionId, "harness/event", { type: "token", ...flushed });
  } catch {
    // ignore
  }
}

/**
 * Drop a session's log entirely: buffered tokens, queued/in-flight writes,
 * and the JSONL file. Thread delete calls this after cancelling the turn so
 * no remnant resurrects the conversation (roster + search read these
 * files). Best-effort; a straggler terminal append may recreate a stub file
 * — the roster stays clean regardless.
 */
export async function dropSessionLog(sessionId: string): Promise<void> {
  try {
    tokenBuffers.delete(sessionId);
    await activeStorage().deleteSession(sessionId);
  } catch {
    // ignore
  }
}

/** Read back the tail of a session's event log for replay. */
export async function readHarnessEvents(
  sessionId: string,
  limit = EVENT_REPLAY_LIMIT,
): Promise<HarnessEvent[]> {
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

const BOOT_SWEEP_MAX_FILES = 200;
const BOOT_SWEEP_MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * Boot sweep: every in-memory waiter registry is empty after a restart, so
 * any persisted prompt WITHOUT a withdrawal tombstone would replay as a
 * live card whose answers go nowhere (undead cards). No turn can be live
 * across a restart, so all such prompts are dead by definition — tombstone
 * them. Best-effort, bounded, runs once at startup.
 */
export async function tombstoneOrphanedPrompts(): Promise<number> {
  let tombstoned = 0;
  try {
    const override = process.env.CAIDE_SESSIONS_DIR?.trim();
    const dir =
      override && override.length > 0 ? override : path.join(os.homedir(), ".caide", "sessions");
    let files: string[];
    try {
      files = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".jsonl"))
        .slice(0, BOOT_SWEEP_MAX_FILES);
    } catch {
      return 0;
    }
    for (const file of files) {
      const full = path.join(dir, file);
      try {
        const stat = fs.statSync(full);
        if (stat.size > BOOT_SWEEP_MAX_FILE_BYTES) continue;
        const sessionId = file.slice(0, -".jsonl".length);
        const live = new Set<string>();
        const withdrawn = new Set<string>();
        for (const line of fs.readFileSync(full, "utf8").split("\n")) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let entry: { data?: { type?: string; requestId?: string } };
          try {
            entry = JSON.parse(trimmed);
          } catch {
            continue;
          }
          const data = entry.data;
          if (!data || typeof data.type !== "string") continue;
          if (data.type === "ui_prompt" && typeof data.requestId === "string") {
            live.add(data.requestId);
          } else if (data.type === "ui_prompt_withdraw" && typeof data.requestId === "string") {
            withdrawn.add(data.requestId);
          }
        }
        for (const requestId of live) {
          if (withdrawn.has(requestId)) continue;
          await appendHarnessEvent({ type: "ui_prompt_withdraw", sessionId, requestId });
          tombstoned += 1;
        }
      } catch {
        // one bad file must not block the sweep
      }
    }
  } catch {
    // logging must never break boot
  }
  return tombstoned;
}
