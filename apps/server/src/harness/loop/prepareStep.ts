// FILE: prepareStep.ts
// Purpose: Donor prepareStep parity (008-m8, V1 prepare_step_utils.ts).
// Pure per-step message fixups applied after steer injection, before the
// LLM call: orphan repair lives in loop.ts (repairToolPairing); this module
// owns tool-result ORDERING plus the questionnaire format-error reflection.
//
// Transport notes (why this is not a verbatim copy):
// - V1 shapes are AI-SDK parts (assistant tool-call parts, `tool`-role
//   result messages). Ours are harness blocks (assistant `tool_use`, user
//   `tool_result`). The algorithm is identical; only the detectors changed.
// - V1's pending-user injection-index machinery (processPendingMessages /
//   injectMessagesAtPositions / compactionIndexDelta) is intentionally NOT
//   ported: our loop rebuilds messages from storage every step and mid-turn
//   steers arrive via the session inbox (appended after complete pairs), so
//   no persistent injection indices exist to go stale. The ordering fixup
//   below is the safety net for the same failure mode.
// - V1's cleanMessage (OpenAI itemId strip) is N/A: our ChatMessages carry
//   no provider itemIds; adapters own provider-specific scrubbing.

import type { ChatMessage } from "../session/buildChain.ts";

/** V1 tool name (donor PLANNING_QUESTIONNAIRE_TOOL_NAME). */
export const PLANNING_QUESTIONNAIRE_TOOL_NAME = "planning_questionnaire";

interface ToolUseBlock {
  type: "tool_use";
  id: string;
}

interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
}

function isToolUseBlock(block: unknown): block is ToolUseBlock {
  if (typeof block !== "object" || block === null) return false;
  const record = block as Record<string, unknown>;
  return record.type === "tool_use" && typeof record.id === "string";
}

function isToolResultBlock(block: unknown): block is ToolResultBlock {
  if (typeof block !== "object" || block === null) return false;
  const record = block as Record<string, unknown>;
  return record.type === "tool_result" && typeof record.tool_use_id === "string";
}

/**
 * Ensure user messages don't appear between a tool_use and its tool_result.
 *
 * Adapted from V1's ensureToolResultOrdering: a user message carrying no
 * tool_result blocks that lands while tool_use ids are still pending (e.g. a
 * steer or reflection inserted at a stale position) is moved forward past
 * the step where all pending ids resolve. Stops at the next assistant
 * message to avoid crossing turn boundaries. Returns the input array
 * untouched when no fix is needed.
 */
export function ensureToolResultOrdering(messages: ChatMessage[]): ChatMessage[] {
  const result = [...messages];
  let changed = false;
  const pendingToolCallIds = new Set<string>();

  // Collect the consecutive run of non-resolving user messages starting at
  // `start`, then relocate it past the step where every pending tool_use id
  // resolves. Returns the next scan index: -1 restarts from the beginning
  // after a mutation; otherwise skips past the unmovable batch (no safe
  // position found — same as V1).
  const moveMisplacedRun = (start: number): number => {
    let misplacedEnd = start;
    for (;;) {
      const next = result[misplacedEnd + 1];
      if (!next || next.role !== "user") break;
      if (Array.isArray(next.content) && next.content.some(isToolResultBlock)) break;
      misplacedEnd++;
    }
    const misplacedCount = misplacedEnd - start + 1;

    // Find the next position where all pending tool results are resolved.
    // Use a snapshot so the lookahead doesn't corrupt the outer tracking set.
    const lookaheadPending = new Set(pendingToolCallIds);
    let insertAfter = misplacedEnd;
    for (let j = misplacedEnd + 1; j < result.length; j++) {
      const next = result[j];
      if (!next) break;
      if (next.role === "user" && Array.isArray(next.content)) {
        for (const block of next.content) {
          if (isToolResultBlock(block)) lookaheadPending.delete(block.tool_use_id);
        }
        insertAfter = j;
        if (lookaheadPending.size === 0) break;
      } else if (next.role === "assistant") {
        // New assistant turn — stop scanning to avoid crossing turn boundaries.
        break;
      }
    }

    if (insertAfter <= misplacedEnd) return misplacedEnd;
    const moved = result.splice(start, misplacedCount);
    // After splice, insertAfter shifted by -misplacedCount.
    result.splice(insertAfter - misplacedCount + 1, 0, ...moved);
    changed = true;
    // Restart the scan from the beginning with a fresh pending set: the
    // array was mutated, so skipping ahead would miss tool-result messages
    // that need to update pendingToolCallIds.
    pendingToolCallIds.clear();
    return -1;
  };

  for (let i = 0; i < result.length; i++) {
    const msg = result[i];
    if (!msg) continue;
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (isToolUseBlock(block)) pendingToolCallIds.add(block.id);
      }
    } else if (msg.role === "user") {
      if (Array.isArray(msg.content)) {
        let resolves = false;
        for (const block of msg.content) {
          if (isToolResultBlock(block)) {
            if (pendingToolCallIds.delete(block.tool_use_id)) resolves = true;
          }
        }
        if (resolves || pendingToolCallIds.size === 0) continue;
      } else if (pendingToolCallIds.size === 0) {
        continue;
      }
      // Misplaced user content between a tool_use and its tool_result.
      i = moveMisplacedRun(i);
    }
  }

  return changed ? result : messages;
}

/**
 * Build the synthetic reflection message for a malformed
 * planning_questionnaire call (donor buildPlanningQuestionnaireReflectionMessage,
 * text verbatim). Plan mode re-calls the tool; other modes skip ahead to
 * planning, exactly like V1's onStepFinish injection.
 */
export function buildQuestionnaireReflectionMessage(
  errorDetail: string,
  planModeOnly: boolean,
): string {
  const base = "Your planning_questionnaire tool call had a format error.";
  const detail = errorDetail ? ` The error was: ${errorDetail}` : "";
  if (planModeOnly) {
    return `[System]${base}${detail} Review the tool's input schema, fix the issue, and re-call planning_questionnaire with correct arguments.`;
  }
  return `[System]${base}${detail} Skip the questionnaire step and proceed directly to the planning phase.`;
}

/**
 * Decide whether a failed planning_questionnaire call deserves the
 * reflection treatment (donor getPlanningQuestionnaireErrorFromStep, adapted:
 * V1 inspects step content parts for tool-error / "Error:" results; our loop
 * sees the raw thrown error, so the predicate runs on it instead).
 *
 * Returns the error detail to reflect, or null when this failure is not a
 * format error. Consent declines and non-questionnaire tools never reflect:
 * a decline is a human decision, not a schema mistake.
 */
export function isQuestionnaireFormatError(toolName: string, error: unknown): string | null {
  if (toolName !== PLANNING_QUESTIONNAIRE_TOOL_NAME) return null;
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : null;
  if (typeof message !== "string" || message.length === 0) return null;
  if (message.startsWith("Tool call declined:")) return null;
  return message;
}
