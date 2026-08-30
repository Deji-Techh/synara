export interface MessageAttachment {
  type: "image" | "file" | "diff";
  mimeType?: string;
  data: string; // base64 or raw string
  name?: string;
}

export interface ContextMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolName?: string;
  attachments?: MessageAttachment[];
  timestamp?: number;
  isSummary?: boolean;
}

export class ContextMemory {
  private history: ContextMessage[] = [];
  private pendingToolResultIds = new Set<string>();
  private openSteps = new Map<string, ContextMessage>();
  private deferredMessages: ContextMessage[] = [];

  append(message: ContextMessage): void {
    const msgWithTime = { ...message, timestamp: message.timestamp ?? Date.now() };
    this.history.push(msgWithTime);

    if (message.role === "assistant" && message.toolCallId) {
      this.pendingToolResultIds.add(message.toolCallId);
    } else if (message.role === "tool" && message.toolCallId) {
      this.pendingToolResultIds.delete(message.toolCallId);
    }
  }

  defer(message: ContextMessage): void {
    this.deferredMessages.push(message);
  }

  drainDeferred(): ContextMessage[] {
    const msgs = [...this.deferredMessages];
    this.deferredMessages = [];
    for (const m of msgs) {
      this.append(m);
    }
    return msgs;
  }

  startStep(stepId: string, stepMessage: ContextMessage): void {
    this.openSteps.set(stepId, stepMessage);
  }

  completeStep(stepId: string): void {
    this.openSteps.delete(stepId);
  }

  getPendingToolResultIds(): ReadonlySet<string> {
    return this.pendingToolResultIds;
  }

  getOpenSteps(): ReadonlyMap<string, ContextMessage> {
    return this.openSteps;
  }

  rawMessages(): readonly ContextMessage[] {
    return this.history;
  }

  replaceHistory(newHistory: ContextMessage[]): void {
    this.history = [...newHistory];
    this.pendingToolResultIds.clear();
    this.openSteps.clear();
  }

  estimateTotalTokens(): number {
    let totalChars = 0;
    for (const msg of this.history) {
      totalChars += msg.content.length;
      if (msg.attachments) {
        for (const att of msg.attachments) {
          totalChars += att.data.length;
        }
      }
    }
    return Math.ceil(totalChars / 3.8);
  }

  getBudgetUsage(contextLimit: number): {
    usedTokens: number;
    contextLimit: number;
    usagePercent: number;
    needsCompactionPrep: boolean;
    needsCompactionExec: boolean;
    isEmergency: boolean;
  } {
    const usedTokens = this.estimateTotalTokens();
    const usagePercent = Math.round((usedTokens / contextLimit) * 100);

    return {
      usedTokens,
      contextLimit,
      usagePercent,
      needsCompactionPrep: usagePercent >= 70 && usagePercent < 85,
      needsCompactionExec: usagePercent >= 85,
      isEmergency: usagePercent >= 95,
    };
  }
}
