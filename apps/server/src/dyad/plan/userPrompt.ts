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
  kind: "questionnaire" | "env-vars";
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
export function resolveUserInput(
  requestId: string,
  answers: Record<string, string>,
): boolean {
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

/** Reject all waiters for a session (turn cancelled) — donor behavior. */
export function clearUserInputForSession(sessionId: string): void {
  for (const [requestId, entry] of pending) {
    if (entry.sessionId === sessionId) {
      pending.delete(requestId);
      entry.resolve(null);
    }
  }
}

export function pendingCount(): number {
  return pending.size;
}
