import { useMemo } from "react";
import {
  derivePendingApprovals,
  derivePendingUserInputs,
} from "./pendingInteractionDerivation";
import { getThreadFromState } from "./threadDerivation";
import { useStore } from "./store";
import type { PendingApproval, PendingUserInput } from "./pendingInteractionDerivation";

export interface OpenPendingUserInput {
  threadId: string;
  requestId: string;
  lifecycleGeneration?: string;
  pending: PendingUserInput;
}

export interface OpenPendingBlueprint {
  threadId: string;
  requestId: string;
  lifecycleGeneration?: string;
  approval: PendingApproval;
}

/**
 * Scans the store for the first thread with an open pending user-input
 * (questionnaire / env-vars). The static transcript card has no threadId, so
 * it resolves its submit target here. There is typically only one open
 * interaction at a time.
 */
export function useOpenPendingUserInput(): OpenPendingUserInput | null {
  return useStore((state) => {
    for (const threadId of state.threadIds ?? []) {
      const thread = getThreadFromState(state, threadId);
      if (!thread) continue;
      const pendingInputs = derivePendingUserInputs(thread.activities, undefined, {
        authoritativeHasPending: undefined,
        latestTurnId: thread.latestTurn?.turnId ?? undefined,
      });
      if (pendingInputs.length > 0) {
        const pending = pendingInputs[0]!;
        return {
          threadId,
          requestId: pending.requestId,
          ...(pending.lifecycleGeneration
            ? { lifecycleGeneration: pending.lifecycleGeneration }
            : {}),
          pending,
        };
      }
    }
    return null;
  });
}

/**
 * Scans the store for the first thread with an open pending blueprint approval
 * (request.opened with requestType app_blueprint).
 */
export function useOpenPendingBlueprint(): OpenPendingBlueprint | null {
  return useStore((state) => {
    for (const threadId of state.threadIds ?? []) {
      const thread = getThreadFromState(state, threadId);
      if (!thread) continue;
      const approvals = derivePendingApprovals(thread.activities, undefined, {
        authoritativeHasPending: undefined,
        latestTurnId: thread.latestTurn?.turnId ?? undefined,
      });
      const blueprint = approvals.find((approval) => approval.requestKind === "blueprint");
      if (blueprint) {
        return {
          threadId,
          requestId: blueprint.requestId,
          ...(blueprint.lifecycleGeneration
            ? { lifecycleGeneration: blueprint.lifecycleGeneration }
            : {}),
          approval: blueprint,
        };
      }
    }
    return null;
  });
}