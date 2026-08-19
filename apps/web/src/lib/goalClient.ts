// FILE: goalClient.ts
// Purpose: Browser-side goal client for the engine goals bridge (goals:* WS RPC).
// Layer: Web transport adapter
// Exports: goalClient (typed goals RPC methods), goal domain event parsing and
//          subscription helpers used by the goals + subagents UI.
//
// The renderer-executor model is dead: the engine owns goal execution. This
// client only issues CRUD/control RPCs and consumes the live `goals:subscribe`
// stream that `createWsNativeApi` fans out on `WS_CHANNELS.goalDomainEvent`.

import { Option, Schema } from "effect";
import {
  GoalControlRequested,
  GoalRunRequested,
  GoalUpdated,
  type Goal,
  type GoalActivityEvent,
  type GoalDomainEvent,
  type GoalExecutionTarget,
  type GoalId,
  type GoalRun,
  type GoalStatus,
} from "@caide/contracts";

import { ensureNativeApi, readNativeApi } from "../nativeApi";

/** Client-side fallback refresh cadence used when no live event has arrived. */
export const GOAL_POLL_INTERVAL_MS = 4_000;

function goalsApi() {
  return ensureNativeApi().goals;
}

/**
 * Real WS-backed goal CRUD. Every method proxies straight onto the engine's
 * goal store through the server bridge; failures surface as rejected promises
 * for the caller to toast. No engine-side execution is fabricated here.
 */
export const goalClient = {
  listGoals: (input?: { appId?: number; statuses?: GoalStatus[] }): Promise<Goal[]> =>
    goalsApi().listGoals(input),
  getActiveGoal: (appId?: number | null): Promise<Goal | null> =>
    goalsApi().getActiveGoal({ appId: appId ?? null }),
  getGoal: (goalId: GoalId): Promise<Goal> => goalsApi().getGoal({ goalId }),
  listActivity: (
    goalId: GoalId,
    limit?: number,
  ): Promise<GoalActivityEvent[]> => {
    if (limit === undefined) return goalsApi().listActivity({ goalId });
    return goalsApi().listActivity({ goalId, limit });
  },
  createGoal: (input: {
    appId?: number | null;
    title?: string;
    objective: string;
    definitionOfDone?: string[];
    constraints?: string[];
    executionTarget?: GoalExecutionTarget;
  }): Promise<Goal> => goalsApi().createGoal(input),
  editGoal: (input: {
    goalId: GoalId;
    title?: string;
    objective?: string;
    definitionOfDone?: string[];
    constraints?: string[];
    executionTarget?: GoalExecutionTarget;
  }): Promise<Goal> => goalsApi().editGoal(input),
  steerGoal: (goalId: GoalId, instruction: string): Promise<Goal> =>
    goalsApi().steerGoal({ goalId, instruction }),
  pauseGoal: (goalId: GoalId, reason?: string): Promise<Goal> => {
    if (reason === undefined) return goalsApi().pauseGoal({ goalId });
    return goalsApi().pauseGoal({ goalId, reason });
  },
  resumeGoal: (goalId: GoalId): Promise<Goal> => goalsApi().resumeGoal({ goalId }),
  cancelGoal: (goalId: GoalId, reason?: string): Promise<Goal> => {
    if (reason === undefined) return goalsApi().cancelGoal({ goalId });
    return goalsApi().cancelGoal({ goalId, reason });
  },
  retryGoal: (goalId: GoalId): Promise<Goal> => goalsApi().retryGoal({ goalId }),
  verifyGoal: (goalId: GoalId): Promise<Goal> => goalsApi().verifyGoal({ goalId }),
};

export interface GoalUpdatedPayload {
  readonly goal: Goal;
  readonly reason: string;
}

export interface GoalRunRequestedPayload {
  readonly run: GoalRun;
}

export interface GoalControlRequestedPayload {
  readonly goalId: GoalId;
  readonly chatId: number | null;
  readonly action: "pause" | "cancel" | "interrupt";
}

/**
 * Decoded view of a `goals:subscribe` event. The wire schema keeps `payload`
 * opaque (M4 web typing), so each payload is runtime-validated against the
 * engine's contract bodies before consumers touch it. Payloads that fail
 * validation are dropped (`null`) rather than surfaced as malformed rows.
 */
export type ParsedGoalDomainEvent =
  | { readonly domainType: "goal.updated"; readonly payload: GoalUpdatedPayload }
  | { readonly domainType: "goal.run-requested"; readonly payload: GoalRunRequestedPayload }
  | {
      readonly domainType: "goal.control-requested";
      readonly payload: GoalControlRequestedPayload;
    };

export function parseGoalDomainEvent(event: GoalDomainEvent): ParsedGoalDomainEvent | null {
  if (event.type === "goal.updated") {
    const decoded = Schema.decodeUnknownOption(GoalUpdated)(event.payload);
    return Option.isSome(decoded)
      ? { domainType: "goal.updated", payload: decoded.value }
      : null;
  }
  if (event.type === "goal.run-requested") {
    const decoded = Schema.decodeUnknownOption(GoalRunRequested)(event.payload);
    return Option.isSome(decoded)
      ? { domainType: "goal.run-requested", payload: decoded.value }
      : null;
  }
  if (event.type === "goal.control-requested") {
    const decoded = Schema.decodeUnknownOption(GoalControlRequested)(event.payload);
    return Option.isSome(decoded)
      ? { domainType: "goal.control-requested", payload: decoded.value }
      : null;
  }
  return null;
}

/**
 * Subscribes to live goal domain events. Safe to call before the transport is
 * wired: without a native API there is nothing to subscribe to, so it no-ops
 * instead of throwing.
 */
export function subscribeGoalDomainEvents(
  listener: (event: GoalDomainEvent) => void,
): () => void {
  const api = readNativeApi();
  if (!api) {
    return () => undefined;
  }
  const unsubscribe = api.goals.onDomainEvent(listener);
  return () => void unsubscribe();
}