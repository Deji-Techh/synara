/**
 * ContextMemory — invariant: _history has no unresolved tool exchange except tail.
 * Steal kimi-code agent/context + projector media ladder.
 */
export type ContextMessage = { role: "user" | "assistant" | "tool"; content: string; toolCallId?: string };

export class ContextMemory {
  private history: ContextMessage[] = [];
  private pendingToolResultIds = new Set<string>();
  private openSteps = new Map<string, ContextMessage>();

  append(event: ContextMessage): void {
    this.history.push(event);
    if (event.role === "tool" && event.toolCallId) {
      this.pendingToolResultIds.delete(event.toolCallId);
    }
  }

  messages(): ContextMessage[] {
    return [...this.history];
  }

  // Ladder fallbacks: normal → media-degraded → media-stripped → strict
  project(mode: "normal" | "media-degraded" | "media-stripped" | "strict" = "normal"): ContextMessage[] {
    if (mode === "strict") return this.history.filter((m) => m.role !== "tool");
    return this.history;
  }
}
