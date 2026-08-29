// harness/caideRunner.ts — pure Caide runner, no dyad (M4 single owner)
// Owns created→running→waiting→terminal, streams typed events {token,tool_call,stage,checkpoint,artifact_updated}

import { TurnStateMachine, type TurnStatus } from "./stateMachine";
import { composePrompt, type AgentRole } from "./layers";
import { route, routeVerifier, routeFixer } from "./router";
import { verifySlice, needsHumanGlance } from "./verifier";
import type { StreamEvent } from "./stream";
import { CAIDE_TOOLS, canRunToolInMode, isReadOnlyTool } from "./tools";
import { shouldCompact } from "./compaction";

// M26 real provider streaming — per-model endpointForModel (opencode docs) lives here now that provider/Layers/ApiAdapter was shell-reset
function endpointForModel(baseUrl: string, model: string): string {
  const normalized = model.toLowerCase();
  const base = baseUrl.replace(/\/+$/, "");
  const responsesHints = ["grok", "gpt-5", "gpt-5.6", "muse-spark", "grok-4", "hy4", "hy3-free"];
  const messagesHints = ["minimax", "qwen", "qwen3", "claude", "sonnet", "opus", "haiku", "anthropic"];
  if (responsesHints.some((h) => normalized.includes(h))) return `${base}/responses`;
  if (messagesHints.some((h) => normalized.includes(h)) && (base.includes("opencode.ai") || base.includes("anthropic"))) return `${base}/messages`;
  if (normalized.includes("gemini")) return `${base}/models/${encodeURIComponent(model)}`;
  return `${base}/chat/completions`;
}

export interface CaideRunnerEvent {
  readonly threadId: string;
  readonly turnId: string;
  readonly event: StreamEvent;
}

export class CaideRunner {
  private machine = new TurnStateMachine();
  private listeners = new Set<(e: CaideRunnerEvent) => void>();

  onEvent(fn: (e: CaideRunnerEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(threadId: string, turnId: string, event: StreamEvent): void {
    const e: CaideRunnerEvent = { threadId, turnId, event };
    for (const fn of this.listeners) fn(e);
  }

  startTurn(threadId: string, turnId: string, projectId: string, role: AgentRole, stageContext: string, skills: readonly string[]): void {
    this.machine.create(turnId, threadId, projectId);
    this.machine.transition(turnId, "running");
    const prompt = composePrompt(role, stageContext, skills);
    this.emit(threadId, turnId, { type: "stage", from: "created", to: "running" });
    // L0+L1 cachedKey would be sent as cacheable block to provider here
    void prompt;
  }

  // Called per slice — vertical loop: Builder writes via tools → screenshot → Verifier fresh ctx (M11)
  async runSlice(threadId: string, turnId: string, sliceSpec: string, screenshotBase64: string | null, mode: "plan" | "default" = "default"): Promise<{ pass: boolean; needsGlance: boolean }> {
    const tool = "write";
    if (!canRunToolInMode(tool, mode)) {
      this.emit(threadId, turnId, { type: "tool_call", name: tool, args: { sliceSpec, error: `tool ${tool} not allowed in ${mode} mode` }, status: "failed" });
      return { pass: false, needsGlance: true };
    }
    this.emit(threadId, turnId, { type: "tool_call", name: tool, args: { sliceSpec }, status: "started" });
    // Real Builder: validates schema + stage/permission, then executes; pre-digested errors on fail
    // For now, tool execution is stubbed as success — file ops will be wired to trusted workspace via frameworkStore
    const isReadOnly = isReadOnlyTool(tool);
    void isReadOnly;
    this.emit(threadId, turnId, { type: "tool_call", name: tool, args: { sliceSpec }, status: "completed" });
    // M9 compaction @70% clean boundary — after tool_call completed, before next reasoning
    const compactionState = { tokenBudget: 128000, usedTokens: 95000, summary: null, recentTurns: [sliceSpec], persistentArtifacts: ["spec.md", "architecture.md"] };
    if (shouldCompact(compactionState)) {
      this.emit(threadId, turnId, { type: "stage", from: "running", to: "running" }); // compaction is stage internal, not terminal
    }
    this.emit(threadId, turnId, { type: "artifact_updated", path: `slice:${sliceSpec.slice(0, 40)}` });

    const decision = route("screen", { complexity: "medium" });
    void decision;

    const result = verifySlice({ sliceSpec, renderedScreenshotBase64: screenshotBase64 });
    // M19 Taste separate cheap aesthetic vs spec — not conflated with Verifier
    const tasteDecision = result.tasteScore !== undefined ? `taste ${result.tasteScore.toFixed(2)}` : "taste pending";
    void tasteDecision;
    this.emit(threadId, turnId, { type: "checkpoint", reason: `${result.reason} · ${tasteDecision}`, requiresResponse: needsHumanGlance(result) });

    if (!result.pass) {
      const fixer = routeFixer();
      void fixer;
      this.emit(threadId, turnId, { type: "tool_call", name: "fixer.correct", args: { reason: result.reason }, status: "started" });
      // Fixer does targeted correction with failure reason + tokens, smaller diff than regeneration
      this.emit(threadId, turnId, { type: "tool_call", name: "fixer.correct", args: { reason: result.reason }, status: "completed" });
    }

    return { pass: result.pass, needsGlance: needsHumanGlance(result) };
  }

  checkpoint(threadId: string, turnId: string, reason: string, requiresResponse: boolean): void {
    this.machine.transition(turnId, "waiting");
    this.emit(threadId, turnId, { type: "checkpoint", reason, requiresResponse });
  }

  resume(threadId: string, turnId: string): void {
    this.machine.transition(turnId, "running");
    this.emit(threadId, turnId, { type: "stage", from: "waiting", to: "running" });
  }

  complete(threadId: string, turnId: string): void {
    this.machine.settle(turnId, "completed");
    this.emit(threadId, turnId, { type: "stage", from: "running", to: "completed" });
  }

  fail(threadId: string, turnId: string, reason: string): void {
    this.machine.settle(turnId, "failed", reason);
    this.emit(threadId, turnId, { type: "stage", from: "running", to: "failed" });
  }

  status(turnId: string): TurnStatus | undefined {
    return this.machine.get(turnId)?.status;
  }

  // M26 real provider streaming — replaces ChatView local echo setInterval
  async streamProvider(input: { threadId: string; turnId: string; model: string; prompt: string; baseUrl: string; apiKey: string; systemPrompt?: string }): Promise<void> {
    const endpoint = endpointForModel(input.baseUrl, input.model);
    const isResponses = endpoint.endsWith("/responses");
    const isMessages = endpoint.endsWith("/messages");
    const body = isResponses
      ? { model: input.model, input: [{ role: "user", content: [{ type: "input_text", text: input.prompt }] }], stream: true }
      : isMessages
        ? { model: input.model, ...(input.systemPrompt ? { system: input.systemPrompt } : {}), messages: [{ role: "user", content: input.prompt }], stream: true }
        : { model: input.model, messages: [...(input.systemPrompt ? [{ role: "system", content: input.systemPrompt }] : []), { role: "user", content: input.prompt }], stream: true };

    const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.apiKey}` }, body: JSON.stringify(body) });
    if (!res.ok || !res.body) throw new Error(`Provider ${res.status} from ${endpoint}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (!t || !t.startsWith("data:")) continue;
        const d = t.slice(5).trim();
        if (d === "[DONE]") return;
        try {
          const p = JSON.parse(d);
          const delta = p.choices?.[0]?.delta?.content ?? p.delta?.text ?? p.output_text?.delta ?? (typeof p.text === "string" ? p.text : undefined);
          if (typeof delta === "string" && delta.length > 0) this.emit(input.threadId, input.turnId, { type: "token", content: delta });
        } catch {}
      }
    }
  }
}
