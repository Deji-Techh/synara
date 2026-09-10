// FILE: runner.ts
// Purpose: CaideRunner — real turn lifecycle owner (created→running→
// waiting→terminal). Replaces the token-placeholder stub: per turn it builds
// the turn context (provider/tools/consent), assembles the Dyad system prompt
// for the mode + framework, streams the harness loop over the provider
// adapter, and forwards typed HarnessEvents. One AbortController per session.

import * as path from "node:path";
import type { HarnessEvent } from "@caide/contracts";
import { createStreamProviderAdapter } from "../provider/streamProviderAdapter.ts";
import { ProviderApiError } from "../provider/apiAdapter.ts";
import {
  DEFAULT_MAX_TOOL_CALL_STEPS,
  getCompactionThreshold,
  repairToolPairing,
  runLoop,
  type LLMAdapter,
} from "../loop/loop.ts";
import { resetPreCommitCount } from "../../dyad/vcs/preCommitTools.ts";
import {
  captureTurnEnd,
  captureTurnStart,
  isGitRepo,
} from "../../dyad/vcs/gitProvenance.ts";
import { buildGitReminder } from "../../dyad/prompts/gitContextPrompt.ts";
import { formatMemoryForPrompt, readAppMemory } from "../../dyad/memory/memory.ts";
import { formatIssuesForEvent, runReviewBarrier } from "../../dyad/sandbox/reviewBarrier.ts";
import { createVersion } from "../../dyad/vcs/versions.ts";
import { resolveChatModeForTurn } from "../../dyad/plan/chatMode.ts";
import { detectWeb3App } from "../../dyad/prompts/frameworkDetect.ts";
import { Inbox } from "../inbox/index.ts";
import { appendHarnessEvent, flushTurnTokens, readHarnessEvents } from "./eventLog.ts";
import { clearPendingConsentsForSession } from "../../dyad/tools/permissions.ts";
import { clearPendingMcpConsentsForSession } from "../../dyad/mcp/mcpConsent.ts";
import { buildConversationChain, buildMessages } from "../session/buildChain.ts";
import { SessionStorage } from "../session/storage.ts";
import {
  COMPACTION_SYSTEM_PROMPT,
  constructSystemPrompt,
  readAiRules,
} from "../../dyad/prompts/index.ts";
import { getContextWindow } from "../../dyad/providers/catalog.ts";
import { getContextSummarizer } from "../../dyad/misc/index.ts";
import type { CaideFramework } from "../../dyad/prompts/index.ts";
import { shouldRevealDatabasePanel } from "../../dyad/db/dbPanel.ts";
import {
  classifyStepKind,
  isSlotSet,
  type RoutingStepKind,
} from "../../dyad/providers/agentRouting.ts";
import { resolveConnection } from "../../dyad/providers/routing.ts";
import type { SettingsLike } from "../../dyad/providers/index.ts";
import type { ConsentRequestFn } from "../../dyad/tools/index.ts";
import { createTurnContext } from "./turnContext.ts";
import { getTodos } from "../../dyad/plan/todoStore.ts";
import {
  getOrCreateSessionStores,
  restoreSessionState,
  snapshotSessionState,
} from "./sessionStores.ts";
import { TurnFlow, type TurnStatus } from "./index.ts";
import { ProjectLogStore } from "../selfImprove/projectLog.ts";

export type RunnerStatus = TurnStatus;
export type ChatMode = "build" | "ask" | "agent" | "plan";

export interface StartTurnInput {
  sessionId: string;
  appPath: string;
  prompt: string;
  mode?: ChatMode;
  framework?: CaideFramework;
  settings?: SettingsLike;
  providerId?: string;
  modelId?: string;
  requestConsent?: ConsentRequestFn;
  autoApproveNonSchemaSql?: boolean;
  maxSteps?: number;
  signal?: AbortSignal;
  onEvent?: (event: HarnessEvent) => void;
  /** Test seam: bypass provider streaming. */
  llmOverride?: LLMAdapter;
  /** Per-session inbox for steering a running turn (gateway-owned). */
  inbox?: Inbox;
  /** MCP consent round-trip for sandbox host calls (gateway bridge). */
  requestMcpConsent?: import("../../dyad/mcp/mcpConsent.ts").McpConsentRequestFn;
  /**
   * Internal failover cursor: "providerId:modelId" keys already tried this
   * turn chain. Prevents failover loops; never set by callers.
   */
  failoverConsumed?: string[];
}

function chatModeFor(mode: ChatMode): "build" | "ask" | "local-agent" | "plan" {
  if (mode === "agent") return "local-agent";
  return mode;
}

/**
 * Clamp a step budget to a sane positive integer. Non-finite, zero, and
 * negative inputs fall back to the default instead of producing a turn
 * that never calls the LLM.
 */
function normalizeMaxSteps(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    return DEFAULT_MAX_TOOL_CALL_STEPS;
  }
  return Math.floor(value);
}

/**
 * Pick the next failover target after a retryable provider failure.
 * Returns null when failover does not apply (non-provider error,
 * non-retryable status, no fallbacks configured, or all consumed).
 */
export function nextFailoverTarget(
  input: StartTurnInput,
  err: unknown,
  /** Resolved "providerId:modelId" of the failed attempt (seeded as consumed). */
  currentKey?: string,
): { providerId: string; modelId: string; key: string; label: string; cause: string } | null {
  if (!(err instanceof ProviderApiError) || err.details.retryable !== true) return null;
  let fallbacks: Array<{ providerId?: string; modelId?: string }> = [];
  try {
    fallbacks = getOrCreateSessionStores(input.sessionId).routing.fallbacks;
  } catch {
    return null;
  }
  if (!Array.isArray(fallbacks) || fallbacks.length === 0) return null;
  const consumed = new Set(input.failoverConsumed ?? []);
  // Never retry the just-failed primary, even via an inheriting empty slot.
  if (currentKey) consumed.add(currentKey);
  for (const fb of fallbacks) {
    if (!fb || (!fb.providerId && !fb.modelId)) continue;
    const providerId = fb.providerId ?? input.providerId ?? "auto";
    const modelId = fb.modelId ?? input.modelId ?? "auto";
    const key = `${providerId}:${modelId}`;
    if (consumed.has(key)) continue;
    return {
      providerId,
      modelId,
      key,
      label: `${providerId}/${modelId}`,
      cause: `${err.details.status} ${err.details.code}`,
    };
  }
  return null;
}

/**
 * Assemble post-compaction step messages: [system, summary notice, recent
 * tail, current prompt]. Pure helper so the shape is unit-testable.
 */
export function assembleCompactedMessages(input: {
  system: string;
  summary: string;
  history: Array<{ role: "system" | "user" | "assistant"; content: unknown }>;
  prompt: string;
  tailKeep?: number;
}): Array<{ role: "system" | "user" | "assistant"; content: unknown }> {
  const tail = input.history.slice(-(input.tailKeep ?? 8));
  return [
    { role: "system", content: input.system },
    {
      role: "user",
      content: `${input.summary}\n\n(Above is a compressed summary of earlier work; only the recent messages below are verbatim.)`,
    },
    ...tail,
    { role: "user", content: input.prompt },
  ];
}

export class CaideRunner {
  private flow = new TurnFlow();
  private status: RunnerStatus = "created";
  private listeners: ((ev: RunnerEvent) => void)[] = [];
  private controllers = new Map<string, AbortController>();

  onEvent(listener: (ev: RunnerEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(ev: RunnerEvent): void {
    for (const l of this.listeners) l(ev);
  }

  cancel(sessionId: string, cause = "cancelled"): void {
    this.controllers.get(sessionId)?.abort(cause);
    // Parked consent waits (tool + MCP) never observe the abort otherwise —
    // settle them as declined so the turn fails fast instead of hanging.
    clearPendingConsentsForSession(sessionId);
    clearPendingMcpConsentsForSession(sessionId);
  }

  getStatus(): RunnerStatus {
    return this.status;
  }

  async startTurn(input: StartTurnInput): Promise<string> {
    const turnId = this.flow.launch(input.prompt);
    // Per-turn token accounting (provider-reported usage only). Declared
    // up front so every failure path (even before provider setup) can
    // attach partial usage instead of hitting a TDZ error.
    const turnUsage = { inputTokens: 0, outputTokens: 0 };
    const recordUsage = (usage: { inputTokens: number; outputTokens: number }) => {
      turnUsage.inputTokens += usage.inputTokens;
      turnUsage.outputTokens += usage.outputTokens;
    };
    const usageField = () =>
      turnUsage.inputTokens > 0 || turnUsage.outputTokens > 0 ? { usage: { ...turnUsage } } : {};
    this.status = "running";
    const forward = (event: HarnessEvent): void => {
      input.onEvent?.(event);
      void appendHarnessEvent(event);
      if (event.type === "token") this.emit({ type: "token", content: event.content });
      else if (event.type === "tool_call") {
        this.emit({
          type: "tool_call",
          name: event.name,
          status: event.status === "started" ? "started" : event.status === "failed" ? "failed" : "completed",
        });
        // Autonomous pane control: DB work reveals the database pane, preview
        // tools reveal the preview pane — the agent never asks the user to open them.
        if (event.status === "started") {
          if (shouldRevealDatabasePanel(event.name)) {
            const reveal: HarnessEvent = {
              type: "ui_reveal",
              sessionId: input.sessionId,
              pane: "database",
              reason: event.name,
            };
            input.onEvent?.(reveal);
          } else if (event.name === "open_preview" || event.name === "restart_preview") {
            const reveal: HarnessEvent = {
              type: "ui_reveal",
              sessionId: input.sessionId,
              pane: "preview",
              reason: event.name,
            };
            input.onEvent?.(reveal);
          }
        }
      } else if (event.type === "stage") this.emit({ type: "stage", from: event.from, to: event.to });
      else if (event.type === "compaction") void maybeCompactTurn().catch(() => {});
      else if (event.type === "checkpoint") this.emit({ type: "checkpoint", requiresResponse: event.requiresResponse });
      if (event.type === "tool_call" && event.status !== "started") sawToolComplete = true;
      else if (event.type === "artifact_updated") this.emit({ type: "artifact_updated", path: event.path });
      if (event.type === "tool_call") {
        if (event.status === "failed") failedToolCalls++;
        if (event.name === "execute_fork_skill") {
          const skillId = (event.args as { skill_id?: unknown } | null | undefined)?.skill_id;
          if (typeof skillId === "string" && skillId) forkSkills.add(skillId);
        }
      }
    };
    // Crash resume: a previous turn_start with no turn_end means the turn
    // died mid-flight (kill/restart). Prefix a continuation notice so the
    // model picks up seamlessly instead of restarting done work. Explicit
    // cancelled/failed/completed turns already closed, so they never match.
    let resumeNotice: string | null = null;
    try {
      const tail = await readHarnessEvents(input.sessionId, 50);
      let sawEnd = false;
      let sawStart = false;
      for (let i = tail.length - 1; i >= 0; i--) {
        const t = tail[i].type;
        if (t === "turn_end") {
          sawEnd = true;
          break;
        }
        if (t === "turn_start") {
          sawStart = true;
          break;
        }
      }
      if (sawStart && !sawEnd) {
        resumeNotice =
          "[system-reminder]: The previous turn in this chat ended without completing (interrupted). Continue seamlessly from the last known state — do not restart work already done.";
      }
    } catch {
      // history unavailable — start clean
    }
    const effectivePrompt = resumeNotice ? `${input.prompt}\n\n${resumeNotice}` : input.prompt;
    // Failover is pre-mutation only: once a tool completed, restarting
    // the turn would re-run side effects (edits, commits, deploys).
    let sawToolComplete = false;
    let failedAttemptKey = "";
    // Self-improve telemetry (item 33): per-turn failure + skill signals for
    // the project run log. Best-effort — never fails the turn.
    let failedToolCalls = 0;
    const forkSkills = new Set<string>();
    let turnVerdict: { passed: boolean; tasteScore: number; issues: string[] } | null = null;
    const logProjectRun = (status: "completed" | "failed" | "cancelled", failure?: string): void => {
      try {
        const store = new ProjectLogStore(path.join(input.appPath, ".caide", "telemetry"));
        const verdict = turnVerdict;
        void store
          .appendLog({
            projectId: path.basename(input.appPath) || input.sessionId,
            framework: input.framework ?? "unknown",
            skills: [...forkSkills],
            verifierPassRate: verdict ? (verdict.passed ? 1 : 0) : 0,
            fixerRetryCount: failedToolCalls,
            tasteScore: verdict?.tasteScore ?? 0,
            benchmarkScore: 0,
            edgeCasesFound: [
              ...(verdict?.issues ?? []),
              ...(failure ? [failure] : []),
            ].slice(0, 20),
            timestamp: Date.now(),
          })
          .catch(() => {});
      } catch {
        // telemetry never fails the turn
      }
    };
    forward({ type: "turn_start", sessionId: input.sessionId, turnId, prompt: input.prompt });

    const controller = new AbortController();
    this.controllers.set(input.sessionId, controller);
    const onAbort = () => controller.abort(input.signal?.reason ?? "cancelled");
    input.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const storage = new SessionStorage();
      await restoreSessionState(input.sessionId, storage).catch(() => {});
      resetPreCommitCount(input.sessionId);
      // Re-push the persisted todo list so the TodoList header survives
      // reconnects and new turns (Dyad parity: turn-start todos broadcast).
      const restoredTodos = getTodos(input.sessionId);
      if (restoredTodos.length > 0) {
        forward({ type: "todos_update", sessionId: input.sessionId, todos: restoredTodos });
      }
      // Git provenance: previous turn's outcome becomes this turn's
      // reminder; repo presence enables the git_context prompt block.
      const prevProvenance = await captureTurnStart(input.sessionId, input.appPath);
      const inGitRepo = await isGitRepo(input.appPath);
      const provenanceReminder =
        prevProvenance && (prevProvenance.commitHash || prevProvenance.sourceCommitHash)
          ? buildGitReminder(prevProvenance)
          : null;
      const sessionStores = getOrCreateSessionStores(input.sessionId);
      const ctx = createTurnContext({
        sessionId: input.sessionId,
        appPath: input.appPath,
        framework: input.framework,
        settings: input.settings,
        providerId: input.providerId,
        modelId: input.modelId,
        requestConsent: input.requestConsent,
        autoApproveNonSchemaSql: input.autoApproveNonSchemaSql ?? sessionStores.safeSql,
        store: sessionStores.consent,
        requestMcpConsent: input.requestMcpConsent,
      });
      failedAttemptKey = `${ctx.provider.providerId}:${ctx.provider.modelId}`;
      // Compaction budget from the turn model's real window (donor
      // getCompactionThreshold parity: 25k output reserve, 250k cap).
      const compactionThreshold = getCompactionThreshold(
        getContextWindow(ctx.provider.providerId, ctx.provider.modelId),
      );
      // Mid-turn compaction consumer: summarize history once via the cheap
      // model, then serve [summary + recent tail]. Single-flight, gated by
      // the session kill-switch, silent on failure. Mirrors donor
      // performCompaction (summary row + post-boundary messages) without a
      // DB: the summary lives in turn scope, originals stay in the log.
      let compactedSummary: string | null = null;
      let compactionRunning = false;
      async function maybeCompactTurn(): Promise<void> {
        if (compactedSummary || compactionRunning) return;
        if (!getOrCreateSessionStores(input.sessionId).compactionEnabled) return;
        compactionRunning = true;
        try {
          const chain = await buildConversationChain(input.sessionId, undefined, storage).catch(
            () => null,
          );
          if (!chain) return;
          const history = buildMessages(chain, { role: "builder", includeSystem: false });
          const text = history
            .map(
              (m) =>
                `${m.role.toUpperCase()}: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`,
            )
            .join("\n")
            .slice(0, 30000);
          if (text.trim().length < 1000) return;
          const summarize = getContextSummarizer();
          if (summarize) {
            compactedSummary = (
              await summarize({ system: COMPACTION_SYSTEM_PROMPT, prompt: text })
            ).slice(0, 6000);
          } else {
            compactedSummary = `[COMPRESSED CONTEXT — extractive fallback]\n${text.slice(0, 3000)}\n…\n${text.slice(-3000)}`;
          }
        } catch {
          // keep full history for this turn
        } finally {
          compactionRunning = false;
        }
      }
      const chatMode = chatModeFor(
        resolveChatModeForTurn({ requestedChatMode: input.mode ?? null }).mode,
      );
      // Project AI rules: the scaffolded AI_RULES.md (or user edits)
      // seed every turn; missing file falls back to defaults inside.
      const aiRules = await readAiRules(input.appPath).catch(() => undefined);
      // Web3 vertical (item 32): multi-chain dApps get the web3 skill pack.
      // Disk-detected per turn so a newly added wallet dependency lights it up.
      const isWeb3App = await detectWeb3App(input.appPath).catch(() => false);
      let system = constructSystemPrompt({
        aiRules,
        chatMode,
        enableTurboEditsV2: false,
        caideFramework: input.framework,
        gitProvenance: inGitRepo,
        isWeb3App,
      });
      // Compounding project memory (APP_MEMORY.md + recent decisions).
      // Appended only when the project actually remembers something.
      const memoryBlock = formatMemoryForPrompt(readAppMemory(input.appPath));
      if (memoryBlock) {
        system += `\n\n${memoryBlock}`;
      }
      const llm =
        input.llmOverride ??
        createStreamProviderAdapter(
          {
            providerId: ctx.provider.providerId,
            modelId: ctx.provider.modelId,
            baseUrl: ctx.provider.baseUrl,
            apiKey: ctx.provider.apiKey ?? "",
            system,
            appPath: input.appPath,
            sessionId: input.sessionId,
            onUsage: recordUsage,
          },
          ctx.tools,
        );

      // Per-step routing: scout/builder/planner adapters resolve lazily per
      // kind and fall back to the turn adapter when a slot is unset or its
      // connection cannot be resolved (keys may be env-only).
      const routing = sessionStores.routing;
      const adapterCache = new Map<string, LLMAdapter>();
      const adapterForKind = (kind: RoutingStepKind): LLMAdapter => {
        if (routing.mode !== "per-step") return llm;
        const ref = routing.steps[kind];
        if (!isSlotSet(ref)) return llm;
        const cacheKey = `${kind}:${ref.providerId ?? ""}:${ref.modelId ?? ""}`;
        const cached = adapterCache.get(cacheKey);
        if (cached) return cached;
        try {
          const connection = resolveConnection(
            ref.providerId ?? ctx.provider.providerId,
            ref.modelId ?? ctx.provider.modelId,
            input.settings ?? {},
          );
          const adapter = createStreamProviderAdapter(
            {
              providerId: ref.providerId ?? ctx.provider.providerId,
              modelId: ref.modelId ?? ctx.provider.modelId,
              baseUrl: connection.baseUrl,
              apiKey: connection.apiKey ?? "",
              system,
              appPath: input.appPath,
              sessionId: input.sessionId,
              onUsage: recordUsage,
            },
            ctx.tools,
          );
          adapterCache.set(cacheKey, adapter);
          return adapter;
        } catch {
          return llm;
        }
      };

      const stream = runLoop({
        sessionId: input.sessionId,
        turnId,
        maxSteps: normalizeMaxSteps(input.maxSteps ?? input.settings?.maxToolCallSteps),
        signal: controller.signal,
        inbox: input.inbox,
        llm,
        buildMessages: async () => {
          const chain = await buildConversationChain(input.sessionId, undefined, storage);
          const history = buildMessages(chain, { role: "builder", includeSystem: false });
          if (compactedSummary === null) {
            return [
              { role: "system", content: system },
              ...history,
              {
                role: "user",
                content: [effectivePrompt, provenanceReminder].filter(Boolean).join("\n\n"),
              },
            ];
          }
          return assembleCompactedMessages({
            system,
            summary: compactedSummary,
            history: history as Array<{
              role: "system" | "user" | "assistant";
              content: unknown;
            }>,
            prompt: [effectivePrompt, provenanceReminder].filter(Boolean).join("\n\n"),
          });
        },
        tools: ctx.tools.map((t) => ({
          name: t.name,
          description: t.description,
          readOnly: t.readOnly,
          timeoutMs: t.timeoutMs,
          execute: (args, c) =>
            ctx.executeWithConsent(t.name, args, c.toolId, c.signal) as Promise<unknown>,
        })),
        onEvent: forward,
        role: "builder",
        // Donor prepareStep parity: drop orphaned tool_use/tool_result
        // blocks (aborted turns leave tool_use without results; providers
        // reject orphans). Identity for clean histories.
        prepareStep: ({ messages }) => repairToolPairing(messages),
        requestConsent: input.requestConsent ?? undefined,
        consentStore: sessionStores.consent,
        // Semantic stop (donor stopWhen): plan handoff tools end the turn
        // so the continue-gate takes over. add_integration follows with the
        // DB milestone once the integration flow is validated end to end.
        stopAfterTool: chatMode === "plan" ? ["write_plan", "exit_plan"] : [],
        // Per-step routing: scout for read-only phases, builder otherwise,
        // planner for plan turns (single mode always returns the turn adapter
        // via adapterForKind).
        selectLlm: ({ step, lastStepAllReadOnly, hasMutatedThisTurn }) => {
          // Actual-usage trigger: provider-reported tokens beat estimates.
          if (turnUsage.inputTokens + turnUsage.outputTokens >= compactionThreshold) {
            void maybeCompactTurn().catch(() => {});
          }
          return adapterForKind(
            classifyStepKind({ chatMode, step, lastStepAllReadOnly, hasMutatedThisTurn }),
          );
        },
        contextBudgetTokens: compactionThreshold / 0.7,
      });
      for await (const event of stream) {
        void event;
      }

      if (controller.signal.aborted) {
        this.status = "cancelled";
        await flushTurnTokens(input.sessionId);
        forward({ type: "turn_end", sessionId: input.sessionId, turnId, status: "cancelled", ...usageField() });
        logProjectRun("cancelled", "turn cancelled");
      } else {
        this.status = "completed";
        // Review barrier (donor runAutoReviewBarrier): audit the working
        // diff after mutating turns. Skips silently when clean/non-repo;
        // never fails the turn.
        if (chatMode !== "ask" && chatMode !== "plan") {
          const verdict = await runReviewBarrier({
            appPath: input.appPath,
            sessionId: input.sessionId,
            taskSummary: input.prompt.slice(0, 500),
            llm,
            tools: [],
            signal: controller.signal,
          }).catch(() => null);
          if (verdict) {
            turnVerdict = {
              passed: verdict.passed,
              tasteScore: verdict.tasteScore,
              issues: formatIssuesForEvent(verdict.issues),
            };
            forward({
              type: "verifier_result",
              sessionId: input.sessionId,
              passed: verdict.passed,
              confidence: verdict.confidence,
              tasteScore: verdict.tasteScore,
              issues: formatIssuesForEvent(verdict.issues),
            });
          }
        }
        // Auto-checkpoint: snapshot the tree when the turn changed it, so
        // every completed turn is undoable from the Versions timeline.
        // Skips clean trees and non-repos; never fails the turn.
        if (chatMode !== "ask" && chatMode !== "plan") {
          await createVersion(input.appPath, `Checkpoint: ${input.prompt.slice(0, 80)}`).catch(() => null);
        }
        await flushTurnTokens(input.sessionId);
        forward({ type: "turn_end", sessionId: input.sessionId, turnId, status: "completed", ...usageField() });
        logProjectRun("completed");
      }
      await captureTurnEnd(input.sessionId, input.appPath).catch(() => {});
      await snapshotSessionState(input.sessionId, storage).catch(() => {});
      ctx.cleanup();
    } catch (err) {
      const next = !sawToolComplete ? nextFailoverTarget(input, err, failedAttemptKey || undefined) : null;
      if (next && !controller.signal.aborted) {
        // Transparent failover: a new turn attempt starts on the fallback
        // provider/model. The error event below explains the switch; the
        // recursive attempt emits its own turn_start/turn_end.
        this.status = "failed";
        await flushTurnTokens(input.sessionId);
        forward({
          type: "error",
          sessionId: input.sessionId,
          code: "PROVIDER_FAILOVER",
          message: `Primary provider failed (${next.cause}); failing over to ${next.label}.`,
          recoverable: true,
        });
        // Release this attempt's controller BEFORE recursing: the inner
        // startTurn registers its own, and the outer finally would otherwise
        // delete it out from under the live attempt.
        this.controllers.delete(input.sessionId);
        return this.startTurn({
          ...input,
          providerId: next.providerId,
          modelId: next.modelId,
          failoverConsumed: [...(input.failoverConsumed ?? []), next.key],
        });
      }
      this.status = "failed";
      await flushTurnTokens(input.sessionId);
      forward({
        type: "error",
        sessionId: input.sessionId,
        code: "TURN_FAILED",
        message: err instanceof Error ? err.message : String(err),
        recoverable: true,
      });
      forward({ type: "turn_end", sessionId: input.sessionId, turnId, status: "failed", ...usageField() });
      logProjectRun("failed", err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500));
    } finally {
      input.signal?.removeEventListener("abort", onAbort);
      this.controllers.delete(input.sessionId);
    }
    return turnId;
  }
}

export type RunnerEvent =
  | { type: "token"; content: string }
  | { type: "tool_call"; name: string; status: "started" | "completed" | "failed" }
  | { type: "stage"; from: string; to: string }
  | { type: "checkpoint"; requiresResponse: boolean }
  | { type: "artifact_updated"; path: string };
