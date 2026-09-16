// FILE: performCompaction.ts
// Purpose: Single owner for compaction execution (donor parity): summarize a
// COMPLETED-history slice, persist the summary + seq boundary + backup
// transcript. Callers: pre-turn check (startTurn), manual Compact-now, and
// turn-end persistence of a mid-turn summary. Mid-turn overlay itself stays
// turn-scoped in the runner — this service never sees live tails, so the
// boundary can never swallow the in-flight prompt (donor C6/C10).
// Donor: dyad x caide compaction_handler.ts performCompaction core
// (summary shape, 30k slice, 1000-char floor, 6000-char cap, backup path).

import { COMPACTION_SYSTEM_PROMPT } from "../prompts/index.ts";
import { getContextSummarizer, type ContextSummarizer } from "../misc/index.ts";
import { writeCompactionBackup } from "../../harness/turn/compactionBackup.ts";
import type { SessionStorage } from "../../harness/session/storage.ts";

export interface CompactionHistoryMessage {
  role: "system" | "user" | "assistant";
  content: unknown;
}

export interface PerformCompactionInput {
  sessionId: string;
  appPath?: string;
  storage: SessionStorage;
  /** Completed-history slice to summarize (never the live tail). */
  history: CompactionHistoryMessage[];
  /**
   * Boundary: max seq covered by `history`. Must be < the live turn_start
   * seq for mid-turn summaries so the next turn keeps its triggering prompt.
   */
  coveredThroughSeq: number;
  summarize?: ContextSummarizer;
}

export interface PerformCompactionResult {
  summary: string;
  coveredThroughSeq: number;
  backupPath: string | null;
}

const HISTORY_SLICE_CHARS = 30_000;
const MIN_HISTORY_CHARS = 1_000;
const SUMMARY_MAX_CHARS = 6_000;

export function historyText(history: CompactionHistoryMessage[]): string {
  return history
    .map(
      (m) =>
        `${m.role.toUpperCase()}: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`,
    )
    .join("\n");
}

/**
 * Seq of the live turn's turn_start (max turn_start in the chain), or null
 * when the chain holds no turn start. Everything at/after it is in-flight;
 * everything before it is completed history safe to summarize.
 */
export function lastTurnStartSeq(
  chain: Array<{ seq: number; type: string; data?: unknown }>,
): number | null {
  let found: number | null = null;
  for (const entry of chain) {
    if (entry.type !== "harness/event" || typeof entry.seq !== "number") continue;
    const data = entry.data as { type?: unknown } | null | undefined;
    if (data && data.type === "turn_start") found = entry.seq;
  }
  return found;
}

/**
 * Run one compaction over completed history. Returns null when there is
 * nothing worth summarizing (<1000 chars) — callers clear the pending flag
 * on null too (donor clears on empty, avoiding retry loops).
 */
export async function performCompaction(
  input: PerformCompactionInput,
): Promise<PerformCompactionResult | null> {
  const text = historyText(input.history).slice(0, HISTORY_SLICE_CHARS);
  if (text.trim().length < MIN_HISTORY_CHARS) return null;
  const summarize = input.summarize ?? getContextSummarizer();
  const summary = (
    summarize
      ? await summarize({ system: COMPACTION_SYSTEM_PROMPT, prompt: text })
      : `[COMPRESSED CONTEXT — extractive fallback]\n${text.slice(0, 3000)}\n…\n${text.slice(-3000)}`
  ).slice(0, SUMMARY_MAX_CHARS);
  await input.storage
    .append(input.sessionId, "compaction/summary", {
      summary,
      coveredThroughSeq: input.coveredThroughSeq,
    })
    .catch(() => undefined);
  const backupPath = await writeCompactionBackup(input.sessionId, input.appPath, input.history);
  return { summary, coveredThroughSeq: input.coveredThroughSeq, backupPath };
}

// --- pending flag (donor pendingCompaction): durable, survives restarts ---

export interface CompactionPendingState {
  value: boolean;
  updatedAt: number;
}

async function readPendingEntries(
  sessionId: string,
  storage: SessionStorage,
): Promise<Array<{ value?: unknown }>> {
  try {
    const entries = await storage.readEntries(sessionId);
    return entries
      .filter((e) => e.type === "compaction/pending")
      .map((e) => (e.data ?? {}) as { value?: unknown });
  } catch {
    return [];
  }
}

/** Whether a compaction was requested for next turn start. */
export async function isCompactionPending(
  sessionId: string,
  storage: SessionStorage,
): Promise<boolean> {
  const entries = await readPendingEntries(sessionId, storage);
  if (entries.length === 0) return false;
  return entries[entries.length - 1]?.value === true;
}

/** Arm the flag (turn ended over threshold without compacting). */
export async function setCompactionPending(
  sessionId: string,
  storage: SessionStorage,
): Promise<void> {
  try {
    await storage.append(sessionId, "compaction/pending", {
      value: true,
      updatedAt: Date.now(),
    });
    // Flush through: a rapid write→read (flag check right after arming)
    // must observe it — the debounced queue alone races the read.
    await storage.flush(sessionId);
  } catch {
    // flag write best-effort
  }
}

/** Clear the flag (donor clears on success, empty, and failure alike). */
export async function clearCompactionPending(
  sessionId: string,
  storage: SessionStorage,
): Promise<void> {
  try {
    await storage.append(sessionId, "compaction/pending", {
      value: false,
      updatedAt: Date.now(),
    });
    await storage.flush(sessionId);
  } catch {
    // flag write best-effort
  }
}
