import { describe, expect, it } from "vitest";
import type { AgentMessage } from "./agentLoop.ts";
import {
  COMPACTION_THRESHOLD,
  compactHistory,
  estimateHistoryTokens,
  estimateTokens,
} from "./compaction.ts";

describe("compaction", () => {
  it("estimateTokens returns reasonable values", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcdefgh")).toBe(2);
    expect(estimateTokens("a")).toBe(1);
    expect(estimateTokens("")).toBe(0);
  });

  it("estimateHistoryTokens sums tokens correctly", () => {
    const msgs: AgentMessage[] = [
      { role: "user", content: "abcd" }, // 1 token
      { role: "assistant", content: "abcdefgh" }, // 2 tokens
    ];
    expect(estimateHistoryTokens(msgs)).toBe(3);
  });

  it("compactHistory keeps first and last 4 messages when length <= 5", () => {
    const msgs: AgentMessage[] = [
      { role: "user", content: "1" },
      { role: "assistant", content: "2" },
      { role: "user", content: "3" },
      { role: "assistant", content: "4" },
      { role: "user", content: "5" },
    ];
    const compacted = compactHistory(msgs, 1000);
    expect(compacted).toEqual(msgs);
  });

  it("compactHistory truncates large intermediate tool outputs", () => {
    const longContent = "A".repeat(1000);
    const msgs: AgentMessage[] = [
      { role: "user", content: "first" }, // 1
      { role: "assistant", content: longContent }, // intermediate, should be truncated
      { role: "user", content: "last4_1" },
      { role: "assistant", content: "last4_2" },
      { role: "user", content: "last4_3" },
      { role: "assistant", content: "last4_4" },
    ];
    
    // maxTokens large enough so it doesn't trigger secondary merge phase,
    // but truncation phase always truncates intermediate ones > 500 chars.
    const compacted = compactHistory(msgs, 100000);
    expect(compacted.length).toBe(6);
    expect(compacted[0]?.content).toBe("first");
    expect(compacted[1]?.content).toBe("A".repeat(500) + "\n[truncated]");
    expect(compacted[2]?.content).toBe("last4_1");
  });

  it("compactHistory does not merge when under budget", () => {
    const msgs: AgentMessage[] = [
      { role: "user", content: "first" },
      { role: "assistant", content: "A" },
      { role: "assistant", content: "B" },
      { role: "user", content: "last4_1" },
      { role: "assistant", content: "last4_2" },
      { role: "user", content: "last4_3" },
      { role: "assistant", content: "last4_4" },
    ];
    
    const compacted = compactHistory(msgs, 100000);
    expect(compacted).toEqual(msgs);
  });

  it("compactHistory merges adjacent assistant messages when over budget", () => {
    const msgs: AgentMessage[] = [
      { role: "user", content: "first" },
      { role: "assistant", content: "A" },
      { role: "assistant", content: "B" },
      { role: "user", content: "last4_1" },
      { role: "assistant", content: "last4_2" },
      { role: "user", content: "last4_3" },
      { role: "assistant", content: "last4_4" },
    ];
    
    // Low budget: threshold is very small.
    // Lengths: first(1), A(1), B(1), last4(4 tokens approx). total ~7 tokens.
    // MaxTokens = 4 -> threshold = 3. 7 > 3, so merge happens.
    const compacted = compactHistory(msgs, 4);
    expect(compacted.length).toBe(6);
    expect(compacted[1]?.content).toBe("A\nB");
  });
});
