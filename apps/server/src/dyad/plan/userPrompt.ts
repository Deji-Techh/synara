// FILE: userPrompt.ts
// Purpose: Shared waiter for tools that pause the turn for human input
// (planning_questionnaire, ask_env_vars). Mirrors donor userInputResolvers:
// the WS layer delivers answers via resolve/dismiss; cancellation clears a
// session's waiters; abort signals settle as dismissal.
// Donor: dyad x caide local_agent/userInputResolvers + questionnaireResolver
// + envVarResolver (behavior port, Electron stripped).

import { randomUUID } from "node:crypto";

export interface PendingPrompt {
  requestId: string;
  sessionId: string;
  kind: "questionnaire" | "env-vars" | "integration";
  resolve: (value: Record<string, string> | null) => void;
  /** Abort listener handle (removed on settle to avoid listener leaks). */
  onAbort?: () => void;
  signal?: AbortSignal;
}

const pending = new Map<string, PendingPrompt>();

/** RequestIds whose waiter expired on a deadline (vs user dismiss/abort). */
const timedOut = new Set<string>();

/** Donor deadlines: questionnaire 5min, env/integration 30min. Zero = none. */
const WAIT_DEADLINES_MS: Record<PendingPrompt["kind"], number> = {
  questionnaire: 5 * 60_000,
  "env-vars": 30 * 60_000,
  integration: 30 * 60_000,
};

export function nextRequestId(kind: PendingPrompt["kind"]): string {
  // UUID suffix (not a process counter): counters restart at zero on every
  // server restart, which reused requestIds and collided with durable
  // withdrawal tombstones — replay then dropped live cards.
  return `${kind}:${Date.now()}:${randomUUID().slice(0, 8)}`;
}

/** Park the turn until the user answers (null = dismissed/aborted/timed-out). */
export function waitForUserInput(
  requestId: string,
  sessionId: string,
  kind: PendingPrompt["kind"],
  signal?: AbortSignal,
  timeoutMs: number = WAIT_DEADLINES_MS[kind],
): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    const entry: PendingPrompt = { requestId, sessionId, kind, resolve };
    let timer: ReturnType<typeof setTimeout> | null = null;
    const done = (value: Record<string, string> | null) => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (entry.signal && entry.onAbort) entry.signal.removeEventListener("abort", entry.onAbort);
      pending.delete(requestId);
      resolve(value);
    };
    entry.resolve = done;
    if (timeoutMs > 0) {
      // Donor parity: an unanswered prompt settles as dismissal after its
      // deadline instead of parking the turn forever. Callers withdraw the
      // card via consumeTimedOut() so no zombie remains.
      timer = setTimeout(() => {
        if (pending.get(requestId) === entry) {
          timedOut.add(requestId);
          done(null);
        }
      }, timeoutMs);
    }
    if (signal) {
      if (signal.aborted) {
        done(null);
        return;
      }
      const onAbort = () => {
        if (pending.get(requestId) === entry) done(null);
      };
      entry.signal = signal;
      entry.onAbort = onAbort;
      signal.addEventListener("abort", onAbort, { once: true });
    }
    pending.set(requestId, entry);
  });
}

/**
 * Whether the waiter's null settlement was a deadline expiry (consumes the
 * flag). Callers use this to withdraw the card + use timeout wording.
 */
export function consumeTimedOut(requestId: string): boolean {
  if (!timedOut.has(requestId)) return false;
  timedOut.delete(requestId);
  return true;
}

/** Deliver the user's answers (WS layer calls this). */
export function resolveUserInput(requestId: string, answers: Record<string, string>): boolean {
  const entry = pending.get(requestId);
  if (!entry) return false;
  pending.delete(requestId);
  entry.resolve(answers);
  return true;
}

/** Dismiss without answers (modal closed, turn cancelled). */
export function dismissUserInput(requestId: string): boolean {
  const entry = pending.get(requestId);
  if (!entry) return false;
  pending.delete(requestId);
  entry.resolve(null);
  return true;
}

/** Session that owns a parked prompt (for withdrawal tombstones on answer). */
export function sessionForRequest(requestId: string): string | null {
  return pending.get(requestId)?.sessionId ?? null;
}

/** RequestIds still parked for a session (optionally filtered by kind). */
export function pendingRequestsForSession(
  sessionId: string,
  kind?: PendingPrompt["kind"],
): string[] {
  const ids: string[] = [];
  for (const [requestId, entry] of pending) {
    if (entry.sessionId === sessionId && (!kind || entry.kind === kind)) ids.push(requestId);
  }
  return ids;
}

/**
 * Dismiss parked prompts for a session (same-kind supersede, or full clear
 * on turn cancel). Returns the dismissed requestIds so callers can
 * broadcast withdrawals for the cards clients still show.
 */
export function dismissPendingForSession(
  sessionId: string,
  kind?: PendingPrompt["kind"],
): string[] {
  const ids = pendingRequestsForSession(sessionId, kind);
  for (const requestId of ids) dismissUserInput(requestId);
  return ids;
}

/** Reject all waiters for a session (turn cancelled) — donor behavior. */
export function clearUserInputForSession(sessionId: string): string[] {
  return dismissPendingForSession(sessionId);
}

export function pendingCount(): number {
  return pending.size;
}

/** Whether this prompt is still awaiting an answer (unanswered on replay). */
export function hasPendingUserInput(requestId: string): boolean {
  return pending.has(requestId);
}
