// FILE: integrationFollowUp.ts
// Purpose: Deferred follow-up for completed database integrations (donor
// armed→due→dispatch parity, adapted): when the user finishes DB setup, the
// turn usually already ended — the follow-up relaunches it with a grounded
// "continue" prompt so the agent actually uses the new database instead of
// going quiet. Dismissed setups never dispatch.

export interface ArmedFollowUp {
  sessionId: string;
  requestId: string;
  prompt: string;
}

const armed = new Map<string, ArmedFollowUp>();

/** Arm a follow-up after a completed integration answer (turn keeps going). */
export function armIntegrationFollowUp(sessionId: string, requestId: string, prompt: string): void {
  armed.set(sessionId, { sessionId, requestId, prompt });
}

/** Drop an armed follow-up (dismissed setups, failed/cancelled turns). */
export function dropIntegrationFollowUp(sessionId: string): void {
  armed.delete(sessionId);
}

/**
 * Dispatch due follow-ups. Returns the prompt when one is due (caller
 * launches/steers the turn); single-shot — always clears.
 */
export function takeDueIntegrationFollowUp(sessionId: string): string | null {
  const entry = armed.get(sessionId);
  if (!entry) return null;
  armed.delete(sessionId);
  return entry.prompt;
}
