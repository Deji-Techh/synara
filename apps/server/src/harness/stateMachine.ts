// harness/stateMachine.ts — M4 single lifecycle owner (002 §4)
// created → running → waiting(optional) → terminal{completed,failed,cancelled,aborted}
// Exactly one settlement, no competing EngineAdapter vs orchestration

export type TurnStatus = "created" | "running" | "waiting" | "completed" | "failed" | "cancelled" | "aborted";
export type TerminalStatus = "completed" | "failed" | "cancelled" | "aborted";

export interface TurnState {
  readonly turnId: string;
  readonly threadId: string;
  readonly projectId: string;
  status: TurnStatus;
  createdAt: string;
  updatedAt: string;
  terminalReason?: string;
}

export function isTerminal(status: TurnStatus): status is TerminalStatus {
  return status === "completed" || status === "failed" || status === "cancelled" || status === "aborted";
}

export function canTransition(from: TurnStatus, to: TurnStatus): boolean {
  const allowed: Record<TurnStatus, TurnStatus[]> = {
    created: ["running", "failed", "cancelled", "aborted"],
    running: ["waiting", "completed", "failed", "cancelled", "aborted"],
    waiting: ["running", "failed", "cancelled", "aborted"],
    completed: [],
    failed: [],
    cancelled: [],
    aborted: [],
  };
  return allowed[from]?.includes(to) ?? false;
}

export class TurnStateMachine {
  private states = new Map<string, TurnState>();

  create(turnId: string, threadId: string, projectId: string): TurnState {
    const now = new Date().toISOString();
    const state: TurnState = { turnId, threadId, projectId, status: "created", createdAt: now, updatedAt: now };
    this.states.set(turnId, state);
    return state;
  }

  transition(turnId: string, to: TurnStatus, reason?: string): TurnState {
    const state = this.states.get(turnId);
    if (!state) throw new Error(`Turn ${turnId} not found`);
    if (state.status === to) return state;
    if (isTerminal(state.status)) throw new Error(`Turn ${turnId} already terminal ${state.status} cannot go to ${to}`);
    if (!canTransition(state.status, to)) throw new Error(`Invalid transition ${state.status} → ${to} for ${turnId}`);
    const next: TurnState = { ...state, status: to, updatedAt: new Date().toISOString(), ...(reason ? { terminalReason: reason } : {}) };
    this.states.set(turnId, next);
    return next;
  }

  get(turnId: string): TurnState | undefined {
    return this.states.get(turnId);
  }

  // Idempotent terminal settlement — exactly one terminal wins, others no-op
  settle(turnId: string, status: TerminalStatus, reason?: string): TurnState | null {
    const state = this.states.get(turnId);
    if (!state) return null;
    if (isTerminal(state.status)) return null; // already settled — ignore duplicate
    return this.transition(turnId, status, reason);
  }
}
