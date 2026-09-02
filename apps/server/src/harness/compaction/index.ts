import type { ContextMemory, ContextMessage } from "../context/memory.ts";
import type { SpecDoc } from "../planner/specValidator.ts";
import {
  summarizeHistory,
  formatSummaryMessage,
  type SummarizerAdapter,
  type CompactionSummary,
} from "./summarizer.ts";

export * from "./summarizer.ts";

export function shouldCompact(usedTokens: number, budget: number): boolean {
  if (budget <= 0) return false;
  return usedTokens / budget >= 0.7;
}

export class RollingCompactor {
  private isCompacting = false;

  async compact(
    memory: ContextMemory,
    budget: number,
    spec?: SpecDoc,
    summarizerAdapter?: SummarizerAdapter,
  ): Promise<{ compacted: boolean; summary?: CompactionSummary }> {
    const usage = memory.getBudgetUsage(budget);
    if (!shouldCompact(usage.usedTokens, budget)) {
      return { compacted: false };
    }

    if (this.isCompacting) {
      return { compacted: false };
    }

    this.isCompacting = true;

    try {
      const raw = memory.rawMessages();
      const summary = await summarizeHistory(raw, spec, summarizerAdapter);
      const summaryText = formatSummaryMessage(summary);

      // Retain system messages, the new summary message, and last 3 recent non-system messages
      const systemMessages = raw.filter((m) => m.role === "system");
      const nonSystemMessages = raw.filter((m) => m.role !== "system");
      const recentMessages = nonSystemMessages.slice(-6); // last 3 user-assistant interaction turns

      const summaryMessage: ContextMessage = {
        role: "user",
        content: summaryText,
        isSummary: true,
        timestamp: Date.now(),
      };

      const newHistory: ContextMessage[] = [...systemMessages, summaryMessage, ...recentMessages];

      memory.replaceHistory(newHistory);

      return {
        compacted: true,
        summary,
      };
    } finally {
      this.isCompacting = false;
    }
  }

  isCurrentlyCompacting(): boolean {
    return this.isCompacting;
  }
}
