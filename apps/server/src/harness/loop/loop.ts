import type { HarnessEvent } from "@caide/contracts";
import type { ChatMessage, HarnessRole } from "../session/buildChain.ts";
import { Inbox } from "../inbox/index.ts";
import { safeEmitLive } from "./events.ts";
import { recoverTextToolCalls } from "./textToolCallRecovery.ts";
import { resolveDonorAliasTarget } from "../../dyad/tools/toolCatalog.ts";
import type { ConsentRequestFn, ConsentStore } from "../../dyad/tools/permissions.ts";

export interface ToolCallContext {
  signal?: AbortSignal;
  sessionId: string;
  toolId: string;
  /** Consent round-trip + store, threaded from turn options (subagent parity). */
  requestConsent?: ConsentRequestFn;
  consentStore?: ConsentStore;
}

export interface ToolDefinition {
  name: string;
  description: string;
  readOnly?: boolean;
  /** Per-tool execution budget; defaults to 30s when omitted. */
  timeoutMs?: number;
  /**
   * The tool parks waiting for user input (questionnaires, approvals) and
   * must never hit the execution budget — cancellation still unblocks it
   * via the abort signal. Without this, every interactive tool is guaranteed
   * to time out, since humans always take longer than 30s.
   */
  waitsForUserInput?: boolean;
  execute: (args: unknown, context: ToolCallContext) => Promise<unknown>;
}

export interface LLMStreamChunk {
  type: "token" | "tool_call";
  content?: string;
  toolCall?: { id: string; name: string; args: unknown };
}

export interface LLMAdapter {
  stream: (
    messages: ChatMessage[],
    options?: { tools?: ToolDefinition[]; signal?: AbortSignal },
  ) => AsyncGenerator<LLMStreamChunk, void, unknown>;
}

export interface StructuredToolError {
  type: string;
  tool: string;
  message: string;
  likelyCause?: string;
  suggestedFix?: string;
}

export interface LoopOptions {
  sessionId: string;
  turnId?: string;
  maxSteps?: number;
  signal?: AbortSignal;
  llm: LLMAdapter;
  buildMessages: () => Promise<ChatMessage[]> | ChatMessage[];
  tools?: ToolDefinition[] | Map<string, ToolDefinition>;
  onEvent?: (event: HarnessEvent) => void;
  role?: HarnessRole;
  inbox?: Inbox;
  onToolError?: (toolName: string, error: unknown) => StructuredToolError;
  /**
   * Consent plumbing threaded into every tool-call context (the turn's own
   * tools usually enforce consent one layer up; delegated subagent tools
   * enforce it here so background work keeps the session posture).
   */
  requestConsent?: ConsentRequestFn;
  consentStore?: ConsentStore;
  /**
   * Per-step message hook (donor prepareStep seam): repair/inject the step's
   * messages after steer injection, before the LLM call — e.g. pending-user
   * message injection or tool_use/tool_result pairing repair. Defaults to
   * identity (messages pass through untouched).
   */
  prepareStep?: (input: {
    step: number;
    role: HarnessRole;
    messages: ChatMessage[];
  }) => ChatMessage[] | Promise<ChatMessage[]>;
  /**
   * Semantic stop tools (donor stopWhen seam): when a step executes any of
   * these tools, the turn ends after the step's remaining calls complete
   * (e.g. add_integration hands off to the UI flow; write_plan/exit_plan
   * hand off to the plan continue-gate). Only successful completions stop
   * the turn — a failed handoff call lets the model fix and retry instead
   * of stranding the turn at the continue-gate. Defaults to no semantic stop.
   */
  stopAfterTool?: string[];
  /**
   * Per-step model selection (Caide per-step routing): pick the LLM adapter
   * for each step. Defaults to the single `llm` adapter. Selections see
   * whether the previous step was read-only and whether the turn has
   * mutated yet, so scout/builder splits stay deterministic.
   */
  selectLlm?: (input: {
    step: number;
    role: HarnessRole;
    lastStepAllReadOnly: boolean;
    hasMutatedThisTurn: boolean;
  }) => LLMAdapter;
  /**
   * Estimated-token budget after which a `compaction` signal event fires once
   * per turn (70% gate like donor shouldCompact). Signalling only — the
   * compaction rewrite milestone consumes it. Defaults to 100_000.
   */
  contextBudgetTokens?: number;
  /** Retries per step when the LLM stream itself errors (not aborts). */
  maxStepRetries?: number;
  /** User notice appended on a terminated-step retry. */
  continuationNotice?: string;
}

/**
 * Default per-turn tool-call step budget. Callers may override per turn
 * (maxSteps) or via settings (maxToolCallSteps) — see runner wiring.
 */
export const DEFAULT_MAX_TOOL_CALL_STEPS = 100;

/**
 * Compaction threshold from a model's context window (donor
 * getCompactionThreshold parity): reserve 25k for output, cap at 250k so
 * huge-window models still compact before transcripts get unwieldy.
 */
export function getCompactionThreshold(contextWindow: number): number {
  if (!Number.isFinite(contextWindow) || contextWindow <= 0) return 100_000;
  return Math.min(250_000, Math.max(0, contextWindow - 25_000));
}

export function formatStructuredToolError(toolName: string, error: unknown): StructuredToolError {
  if (typeof error === "object" && error !== null && "type" in error && "message" in error) {
    return error as StructuredToolError;
  }

  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error);

  let likelyCause = "Unexpected error encountered during tool execution.";
  let suggestedFix = "Check input arguments and retry with valid parameters.";

  if (rawMessage.includes("ENOENT") || rawMessage.includes("not found")) {
    likelyCause = "Target file or resource path does not exist.";
    suggestedFix = "Verify the path using directory listing or search before operating on it.";
  } else if (rawMessage.includes("EACCES") || rawMessage.includes("permission denied")) {
    likelyCause = "Insufficient filesystem or process permissions.";
    suggestedFix = "Ensure target directory permissions allow read/write operations.";
  } else if (rawMessage.includes("SyntaxError") || rawMessage.includes("JSON.parse")) {
    likelyCause = "Malformed input JSON syntax.";
    suggestedFix = "Provide strictly valid JSON formatting.";
  }

  return {
    type: "ToolExecutionError",
    tool: toolName,
    message: rawMessage,
    likelyCause,
    suggestedFix,
  };
}

/** Rough token estimate for step messages (chars/4, text + block text). */
export function estimateMessagesTokens(messages: ChatMessage[]): number {
  let chars = 0;
  for (const m of messages) {
    if (typeof m.content === "string") {
      chars += m.content.length;
    } else if (Array.isArray(m.content)) {
      for (const b of m.content) {
        const text = (b as { text?: unknown }).text;
        if (typeof text === "string") chars += text.length;
        else chars += JSON.stringify(b ?? "").length;
      }
    }
  }
  return Math.ceil(chars / 4);
}

/**
 * Drop unpaired tool_use/tool_result blocks. Aborted turns leave tool_use
 * entries without results, and providers reject orphans (400s). Keeps only
 * complete pairs, preserving order. Donor sanitizeStepMessages parity.
 */
export function repairToolPairing(messages: ChatMessage[]): ChatMessage[] {
  const used = new Set<string>();
  const resulted = new Set<string>();
  for (const m of messages) {
    if (!Array.isArray(m.content)) continue;
    for (const b of m.content as Array<Record<string, unknown>>) {
      if (b.type === "tool_use" && typeof b.id === "string") used.add(b.id);
      if (b.type === "tool_result" && typeof b.tool_use_id === "string")
        resulted.add(b.tool_use_id);
    }
  }
  const keep = (id: string | undefined, isUse: boolean): boolean => {
    if (typeof id !== "string" || !id) return true;
    return isUse ? resulted.has(id) : used.has(id);
  };
  return messages.map((m) => {
    if (!Array.isArray(m.content)) return m;
    const blocks = (m.content as Array<Record<string, unknown>>).filter((b) => {
      if (b.type === "tool_use") return keep(typeof b.id === "string" ? b.id : undefined, true);
      if (b.type === "tool_result")
        return keep(typeof b.tool_use_id === "string" ? b.tool_use_id : undefined, false);
      return true;
    });
    return { ...m, content: blocks };
  });
}

/** Default terminated-step retries (donor terminated-retry continuation). */
export const DEFAULT_TERMINATED_STEP_RETRIES = 1;

/** Notice appended on a terminated-step retry so the model continues. */
export const TERMINATED_RETRY_NOTICE =
  "[system-reminder]: Your previous response was cut off before completing. Continue exactly where you left off — do not restart the turn.";

export async function* runLoop(options: LoopOptions): AsyncGenerator<HarnessEvent, void, unknown> {
  const sessionId = options.sessionId;
  const turnId = options.turnId ?? `turn-${Date.now()}`;
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_TOOL_CALL_STEPS;
  const signal = options.signal;
  const inbox = options.inbox ?? new Inbox();
  const role = options.role ?? "builder";

  // Index tools by name
  const toolMap = new Map<string, ToolDefinition>();
  if (options.tools) {
    if (Array.isArray(options.tools)) {
      for (const t of options.tools) toolMap.set(t.name, t);
    } else {
      for (const [name, def] of options.tools.entries()) toolMap.set(name, def);
    }
  }

  const emit = (event: HarnessEvent) => {
    safeEmitLive(options.onEvent, event);
    return event;
  };

  inbox.markProcessing(true);

  let step = 0;
  const executedReadOnlyToolSignatures = new Map<string, number>();
  // Silent-turn + retry-loop guards (a completed turn with zero assistant
  // output is always a bug — the user stares at a dead chat):
  // - producedOutput: any token or terminal tool event this turn.
  // - awaitingUserFollowUp: a human wait just resolved; the next step MUST
  //   say something (the classic silent case: answers arrive, model replies
  //   with nothing, turn completes).
  // - emptyStepRetriesLeft: one retry with an explicit nudge, then fail loud.
  // - consecutiveFailureCounts: identical failures (name+message) in a row;
  //   3 strikes ends the turn as failed instead of looping to maxSteps.
  let producedOutput = false;
  let awaitingUserFollowUp = false;
  let emptyStepRetriesLeft = 1;
  const consecutiveFailureCounts = new Map<string, number>();
  let lastFailureSignature: string | null = null;
  // Per-step routing state: what the previous step did.
  let lastStepAllReadOnly = true;
  let hasMutatedThisTurn = false;
  // Context accounting + terminated-step retry budget.
  const contextBudget = options.contextBudgetTokens ?? 100_000;
  let estimatedTurnTokens = 0;
  let compactionSignalled = false;
  const maxStepRetries = options.maxStepRetries ?? DEFAULT_TERMINATED_STEP_RETRIES;
  // In-turn transcript: every executed call (success or failure) is fed back
  // as tool_use/tool_result so LATER STEPS see what happened. Without this,
  // each step rebuilds context from storage alone and the model retries
  // blind — it never learns results, errors, or even that it already called
  // a tool. (Matches the buildChain assistant/tool_use + user/tool_result
  // shapes so prepareStep pairing repair accepts them.)
  const stepTranscript: ChatMessage[] = [];
  const MAX_TOOL_RESULT_CHARS = 20000;

  try {
    while (step < maxSteps) {
      if (signal?.aborted) {
        break;
      }

      // Check pre-step waterfall hooks
      const preStepResult = await inbox.evaluatePreStep({ step, role });
      if (preStepResult.action === "reject") {
        yield emit({
          type: "error",
          sessionId,
          code: "PRE_STEP_REJECTED",
          message: preStepResult.reason ?? "Pre-step validation rejected step.",
          recoverable: false,
        });
        break;
      }

      // Check for steering messages in inbox
      const nextStepMessages = inbox.claimNextStep();
      const steerPrompts = nextStepMessages
        .filter((m): m is { type: "steer"; prompt: string; time: number } => m.type === "steer")
        .map((m) => m.prompt);

      // Build context messages for current step
      const baseMessages = await options.buildMessages();
      const messages = [...baseMessages, ...stepTranscript];

      for (const steerPrompt of steerPrompts) {
        messages.push({
          role: "user",
          content: `[User Steering Instruction]: ${steerPrompt}`,
        });
      }

      // Per-step hook: repair/inject messages before the LLM call.
      const stepMessages = options.prepareStep
        ? await options.prepareStep({ step, role, messages })
        : messages;

      // Current-window estimate (max, not cumulative: every step rebuilds
      // the full history, so summing would over-count ~N-fold).
      estimatedTurnTokens = Math.max(estimatedTurnTokens, estimateMessagesTokens(stepMessages));
      if (!compactionSignalled && contextBudget > 0 && estimatedTurnTokens / contextBudget >= 0.7) {
        compactionSignalled = true;
        yield emit({
          type: "compaction",
          sessionId,
          reason: "estimated-context",
          summaryLength: estimatedTurnTokens,
        });
      }

      yield emit({
        type: "stage",
        sessionId,
        from: step === 0 ? "idle" : `step-${step - 1}`,
        to: `step-${step}`,
        meta: { step, role, steerInjected: steerPrompts.length > 0 },
      });

      const toolList = Array.from(toolMap.values());
      const pendingToolCalls: Array<{ id: string; name: string; args: unknown }> = [];
      let stepText = "";

      // Stream LLM response (per-step routing may swap the adapter).
      const streamOpts: { tools: ToolDefinition[]; signal?: AbortSignal } = { tools: toolList };
      if (signal) streamOpts.signal = signal;
      const activeLlm = options.selectLlm
        ? options.selectLlm({ step, role, lastStepAllReadOnly, hasMutatedThisTurn })
        : options.llm;
      let retriesLeft = maxStepRetries;
      let stepped = false;
      let activeMessages = stepMessages;
      const notice = options.continuationNotice ?? TERMINATED_RETRY_NOTICE;
      while (!stepped) {
        try {
          const stream = activeLlm.stream(activeMessages, streamOpts);
          for await (const chunk of stream) {
            if (signal?.aborted) break;

            if (chunk.type === "token" && chunk.content) {
              stepText += chunk.content;
              producedOutput = true;
              awaitingUserFollowUp = false;
              yield emit({
                type: "token",
                sessionId,
                content: chunk.content,
              });
            } else if (chunk.type === "tool_call" && chunk.toolCall) {
              pendingToolCalls.push(chunk.toolCall);
            }
          }
          stepped = true;
        } catch (err) {
          if (signal?.aborted || retriesLeft <= 0) throw err;
          retriesLeft -= 1;
          // Drop partial tool calls from the failed attempt: re-executing
          // them after the retry would run side effects twice.
          pendingToolCalls.length = 0;
          activeMessages = [...stepMessages, { role: "user" as const, content: notice }];
          yield emit({
            type: "error",
            sessionId,
            code: "STEP_RETRY",
            message: err instanceof Error ? err.message : String(err),
            recoverable: true,
          });
        }
      }

      if (signal?.aborted) {
        break;
      }

      // If no tool calls occurred, the model may have serialized them as
      // text (<function=> blocks or dyad-write tags — common on weak models
      // without reliable native function calling). Recover those onto
      // registry tools so the work executes instead of leaking into chat.
      // Native calls always win: recovery runs only on zero native calls.
      if (pendingToolCalls.length === 0 && stepText) {
        for (const recovered of recoverTextToolCalls(stepText, (name) => toolMap.has(name))) {
          pendingToolCalls.push(recovered);
        }
      }

      // If no tool calls occurred, LLM completed its generation for the turn —
      // unless it produced NOTHING (no text, no calls). An all-silent turn is
      // never a valid completion: either the provider glitched (retry once
      // with an explicit nudge) or the model is stuck (fail loud so the user
      // sees an error instead of a dead chat).
      if (pendingToolCalls.length === 0) {
        if (stepText.trim().length === 0 && (!producedOutput || awaitingUserFollowUp)) {
          if (emptyStepRetriesLeft > 0) {
            emptyStepRetriesLeft -= 1;
            const nudge = awaitingUserFollowUp
              ? "The user just answered your questions, but your last response was empty. Reply to their answers now — do not end silently and do not re-ask the same questions."
              : "Your last response was empty (no text, no tool calls). Please respond to the user now instead of ending silently.";
            stepTranscript.push({ role: "user", content: nudge } as ChatMessage);
            awaitingUserFollowUp = false;
            yield emit({
              type: "error",
              sessionId,
              code: "STEP_EMPTY_RETRY",
              message: "Model returned an empty step; retrying once with an explicit nudge.",
              recoverable: true,
            });
            continue;
          }
          throw new Error(
            "STEP_EMPTY: the model returned no text and no tool calls twice in a row with no prior output this turn. The provider may be overloaded — try again.",
          );
        }
        break;
      }

      // Execute tool calls
      const stopTools = new Set(options.stopAfterTool ?? []);
      let stopAfterStep = false;
      // Same-signature failure dedup (all tools, not just read-only):
      // repeated identical failures end the turn instead of looping.
      const recordFailureSignature = (name: string, message: string): number => {
        const sig = `${name}:${message}`;
        const count =
          sig === lastFailureSignature ? (consecutiveFailureCounts.get(sig) ?? 1) + 1 : 1;
        lastFailureSignature = sig;
        consecutiveFailureCounts.set(sig, count);
        return count;
      };
      const clearFailureSignatures = (): void => {
        consecutiveFailureCounts.clear();
        lastFailureSignature = null;
      };
      for (const call of pendingToolCalls) {
        if (signal?.aborted) break;

        const startTime = Date.now();
        // Donor-alias fallback: models taught legacy names (list_files, grep,
        // ...) resolve to the real registry tool via the catalog mapping.
        // Emitted under the resolved name so UI + transcript stay truthful.
        const aliasedName = toolMap.has(call.name)
          ? call.name
          : (resolveDonorAliasTarget(call.name) ?? null);
        const resolvedName =
          aliasedName !== null && toolMap.has(aliasedName) ? aliasedName : call.name;
        const toolDef = toolMap.get(resolvedName);
        // Transcript capture for step feedback (assigned on every path below,
        // consumed by the finally that feeds later steps).
        let transcriptResult: unknown = null;
        let transcriptFailed = false;
        const pushTranscriptFeedback = (): void => {
          // Feed this call back into the in-turn transcript so every executed
          // call (including failures) is visible to later steps.
          const resultText =
            typeof transcriptResult === "string"
              ? transcriptResult
              : JSON.stringify(transcriptResult ?? "");
          const truncated =
            resultText.length > MAX_TOOL_RESULT_CHARS
              ? `${resultText.slice(0, MAX_TOOL_RESULT_CHARS)}\n…[truncated, ${resultText.length - MAX_TOOL_RESULT_CHARS} chars omitted]`
              : resultText;
          stepTranscript.push(
            {
              role: "assistant",
              content: [
                {
                  type: "tool_use",
                  id: call.id,
                  name: resolvedName,
                  input: call.args ?? {},
                },
              ],
            } as ChatMessage,
            {
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: call.id,
                  content: truncated,
                  ...(transcriptFailed ? { is_error: true } : {}),
                },
              ],
            } as ChatMessage,
          );
        };

        yield emit({
          type: "tool_call",
          sessionId,
          id: call.id,
          name: resolvedName,
          args: call.args,
          status: "started",
        });

        if (!toolDef) {
          const formattedErr = formatStructuredToolError(
            call.name,
            `Unknown tool: '${call.name}'. Available tools: ${Array.from(toolMap.keys()).join(", ")}`,
          );
          yield emit({
            type: "tool_call",
            sessionId,
            id: call.id,
            name: call.name,
            args: call.args,
            status: "failed",
            result: formattedErr,
            durationMs: Date.now() - startTime,
          });
          // Unknown tools loop the same way known ones do — count them.
          if (recordFailureSignature(call.name, `Unknown tool: '${call.name}'`) >= 3) {
            throw new Error(
              `VALIDATION_LOOP: unknown tool '${call.name}' requested 3 times in a row.`,
            );
          }
          // Feed the failure back too — otherwise the model retries blind.
          transcriptResult = formattedErr;
          transcriptFailed = true;
          pushTranscriptFeedback();
          continue;
        }

        try {
          // Prevent infinite tool call loops: detect if the same read-only tool was called with identical arguments
          const callSignature = `${resolvedName}:${JSON.stringify(call.args ?? {})}`;
          const isReadOnly = toolDef.readOnly ?? false;
          if (isReadOnly) {
            const count = (executedReadOnlyToolSignatures.get(callSignature) ?? 0) + 1;
            executedReadOnlyToolSignatures.set(callSignature, count);
            if (count > 2) {
              const noticeResult = {
                notice: `Tool '${resolvedName}' has already executed with these arguments in this turn. No workspace changes occurred. Present your findings to the user now.`,
              };
              transcriptResult = noticeResult;
              yield emit({
                type: "tool_call",
                sessionId,
                id: call.id,
                name: resolvedName,
                args: call.args,
                status: "completed",
                result: noticeResult,
                durationMs: Date.now() - startTime,
              });
              continue;
            }
          }

          // Bound tool execution so a hung tool (network, missing dir) can't
          // block the turn forever. Default 30s; long tools (preview start,
          // APK builds) declare their own timeoutMs on the ToolDef.
          const executeCtx: ToolCallContext = {
            sessionId,
            toolId: call.id,
          };
          if (signal) executeCtx.signal = signal;
          if (options.requestConsent) executeCtx.requestConsent = options.requestConsent;
          if (options.consentStore) executeCtx.consentStore = options.consentStore;
          const budgetMs =
            toolDef.timeoutMs && Number.isFinite(toolDef.timeoutMs) && toolDef.timeoutMs > 0
              ? Math.floor(toolDef.timeoutMs)
              : 30_000;
          const result = toolDef.waitsForUserInput
            ? await toolDef.execute(call.args, executeCtx)
            : await (async () => {
                let timeoutId: ReturnType<typeof setTimeout> | undefined;
                try {
                  return await Promise.race([
                    toolDef.execute(call.args, executeCtx),
                    new Promise<never>((_, reject) => {
                      timeoutId = setTimeout(() => {
                        reject(new Error(`Tool '${resolvedName}' timed out after ${budgetMs}ms`));
                      }, budgetMs);
                    }),
                  ]);
                } finally {
                  // Every settled race must release its timer (leaked timers
                  // hold the loop open and reject into settled races).
                  if (timeoutId !== undefined) clearTimeout(timeoutId);
                }
              })();

          yield emit({
            type: "tool_call",
            sessionId,
            id: call.id,
            name: resolvedName,
            args: call.args,
            status: "completed",
            result,
            durationMs: Date.now() - startTime,
          });
          producedOutput = true;
          if (toolDef.waitsForUserInput) awaitingUserFollowUp = true;
          clearFailureSignatures();
          transcriptResult = result;
          if (stopTools.has(resolvedName)) stopAfterStep = true;
        } catch (err) {
          const errorFormatter = options.onToolError ?? formatStructuredToolError;
          const formattedErr = errorFormatter(resolvedName, err);
          transcriptResult = formattedErr;
          transcriptFailed = true;
          producedOutput = true;

          // Same-signature failure dedup (all tools, not just read-only):
          // three identical consecutive failures end the turn as failed
          // instead of burning maxSteps on a validation/timeout loop.
          const failureMessage = err instanceof Error ? err.message : String(err);
          const failureCount = recordFailureSignature(resolvedName, failureMessage);

          yield emit({
            type: "tool_call",
            sessionId,
            id: call.id,
            name: resolvedName,
            args: call.args,
            status: "failed",
            result: formattedErr,
            durationMs: Date.now() - startTime,
          });
          if (failureCount >= 3) {
            yield emit({
              type: "error",
              sessionId,
              code: "VALIDATION_LOOP",
              message: `Tool '${resolvedName}' failed identically ${failureCount} times in a row (${failureMessage}). Ending the turn instead of retrying to max steps.`,
              recoverable: false,
            });
            throw new Error(
              `VALIDATION_LOOP: tool '${resolvedName}' failed identically ${failureCount} times in a row: ${failureMessage}`,
            );
          }
        } finally {
          pushTranscriptFeedback();
        }
      }

      // Record what this step did for next-step routing: a step counts as
      // read-only when every executed call resolved to a read-only tool
      // (unknown tools count as mutating — fail closed).
      if (pendingToolCalls.length > 0) {
        let allReadOnly = true;
        let mutated = false;
        for (const call of pendingToolCalls) {
          const def = toolMap.get(call.name);
          if (!def || def.readOnly !== true) {
            allReadOnly = false;
            mutated = true;
          }
        }
        lastStepAllReadOnly = allReadOnly;
        if (mutated) hasMutatedThisTurn = true;
      }

      step += 1;

      // Semantic stop: a handoff tool ran this step (integration UI flow,
      // plan continue-gate) — end the turn instead of generating further.
      if (stopAfterStep && !signal?.aborted) {
        break;
      }
    }
  } finally {
    inbox.markProcessing(false);
  }
}
