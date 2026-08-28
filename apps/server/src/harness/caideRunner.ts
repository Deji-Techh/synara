// harness/caideRunner.ts — pure Caide runner, no dyad (M4 single owner)
// Owns created→running→waiting→terminal, streams typed events {token,tool_call,stage,checkpoint,artifact_updated}

import { TurnStateMachine, type TurnStatus } from "./stateMachine";
import { composePrompt, type AgentRole } from "./layers";
import { route, routeVerifier, routeFixer } from "./router";
import { verifySlice, needsHumanGlance } from "./verifier";
import type { StreamEvent } from "./stream";

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

  // Called per slice in vertical loop — Builder writes, then visual verification → Verifier
  async runSlice(threadId: string, turnId: string, sliceSpec: string, screenshotBase64: string | null): Promise<{ pass: boolean; needsGlance: boolean }> {
    this.emit(threadId, turnId, { type: "tool_call", name: "builder.write", args: { sliceSpec }, status: "started" });
    // Builder would write files here via tools, then screenshot
    this.emit(threadId, turnId, { type: "tool_call", name: "builder.write", args: { sliceSpec }, status: "completed" });
    this.emit(threadId, turnId, { type: "artifact_updated", path: `slice:${sliceSpec.slice(0, 40)}` });

    const decision = route("screen", { complexity: "medium" });
    void decision;

    const result = verifySlice({ sliceSpec, renderedScreenshotBase64: screenshotBase64 });
    this.emit(threadId, turnId, { type: "checkpoint", reason: result.reason, requiresResponse: needsHumanGlance(result) });

    if (!result.pass) {
      const fixer = routeFixer();
      void fixer;
      this.emit(threadId, turnId, { type: "tool_call", name: "fixer.correct", args: { reason: result.reason }, status: "started" });
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
}
