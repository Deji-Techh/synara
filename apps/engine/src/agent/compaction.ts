import type { AgentMessage } from "./agentLoop.ts";

export const DEFAULT_CONTEXT_WINDOW_TOKENS = 128_000;
export const COMPACTION_THRESHOLD = 0.75;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateHistoryTokens(messages: readonly AgentMessage[]): number {
  return messages.reduce((sum, msg) => sum + estimateTokens(msg.content), 0);
}

export function compactHistory(
  messages: readonly AgentMessage[],
  maxTokens: number,
): AgentMessage[] {
  if (messages.length <= 5) {
    return [...messages];
  }

  const compacted = [...messages];
  const first = compacted.shift()!;
  const last4 = compacted.splice(-4, 4);

  // 1. Truncate large messages in between
  for (let i = 0; i < compacted.length; i++) {
    const msg = compacted[i]!;
    if (msg.content.length > 500) {
      compacted[i] = {
        role: msg.role,
        content: msg.content.substring(0, 500) + "\n[truncated]",
      };
    }
  }

  // 2. If still over budget, merge adjacent assistant messages
  let currentTokens = estimateHistoryTokens([first, ...compacted, ...last4]);
  const budgetTokens = Math.floor(maxTokens * COMPACTION_THRESHOLD);

  if (currentTokens > budgetTokens) {
    const merged: AgentMessage[] = [];
    for (let i = 0; i < compacted.length; i++) {
      const msg = compacted[i]!;
      const prev = merged[merged.length - 1];
      if (prev && prev.role === "assistant" && msg.role === "assistant") {
        merged[merged.length - 1] = {
          role: "assistant",
          content: prev.content + "\n" + msg.content,
        };
      } else {
        merged.push(msg);
      }
    }
    compacted.splice(0, compacted.length, ...merged);
  }

  return [first, ...compacted, ...last4];
}
