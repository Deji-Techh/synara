// FILE: userPrompt.ts
// Purpose: Shared waiter for tools that pause the turn for human input
// (planning_questionnaire, ask_env_vars). Mirrors donor userInputResolvers:
// the WS layer delivers answers via resolve/dismiss; cancellation clears a
// session's waiters; abort signals settle as dismissal.
// Donor: dyad x caide local_agent/userInputResolvers + questionnaireResolver
// + envVarResolver (behavior port, Electron stripped).

export interface PendingPrompt {
  requestId: string;
  sessionId: string;
  kind: "questionnaire" | "env-vars" | "integration";
  resolve: (value: Record<string, string> | null) => void;
}

const pending = new Map<string, PendingPrompt>();

let counter = 0;
export function nextRequestId(kind: PendingPrompt["kind"]): string {
  return `${kind}:${Date.now()}:${++counter}`;
}

/** Park the turn until the user answers (null = dismissed/aborted). */
export function waitForUserInput(
  requestId: string,
  sessionId: string,
  kind: PendingPrompt["kind"],
  signal?: AbortSignal,
): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    const entry: PendingPrompt = { requestId, sessionId, kind, resolve };
    pending.set(requestId, entry);
    if (signal) {
      if (signal.aborted) {
        pending.delete(requestId);
        resolve(null);
        return;
      }
      signal.addEventListener(
        "abort",
        () => {
          if (pending.get(requestId) === entry) {
            pending.delete(requestId);
            resolve(null);
          }
        },
        { once: true },
      );
    }
  });
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
