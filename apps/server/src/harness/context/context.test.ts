import { describe, it, expect } from "vitest";
import { ContextMemory, Projector, type ContextMessage } from "./index.ts";

describe("Milestone M13 — ContextMemory & Projection Ladder", () => {
  it("context at 71% prepares compaction, and at 86% triggers compaction execution flag", () => {
    const memory = new ContextMemory();
    // Context limit 10,000 tokens ≈ 38,000 chars

    // Fill to ~7,100 tokens (approx 27,000 chars)
    const longChunk = "a".repeat(27_000);
    memory.append({ role: "user", content: longChunk });

    const budget71 = memory.getBudgetUsage(10_000);
    expect(budget71.usagePercent).toBeGreaterThanOrEqual(70);
    expect(budget71.usagePercent).toBeLessThan(85);
    expect(budget71.needsCompactionPrep).toBe(true);
    expect(budget71.needsCompactionExec).toBe(false);

    // Add more tokens to hit 86%
    memory.append({ role: "assistant", content: "b".repeat(6_000) });
    const budget86 = memory.getBudgetUsage(10_000);
    expect(budget86.usagePercent).toBeGreaterThanOrEqual(85);
    expect(budget86.needsCompactionExec).toBe(true);
  });

  it("projection ladder correctly degrades attachments and content across all 5 tiers", () => {
    const sampleMessages: ContextMessage[] = [
      { role: "system", content: "You are Caide builder." },
      {
        role: "user",
        content: "Here is screenshot",
        attachments: [
          { type: "image", data: "data:image/png;base64,largeImageData", name: "preview.png" },
          { type: "file", data: "console.log('hi')", name: "test.js" },
        ],
      },
      {
        role: "tool",
        content: "x".repeat(3000), // very long tool output
        toolCallId: "tool-1",
      },
      { role: "assistant", content: "I parsed the output." },
      { role: "user", content: "Now build slice 2." },
      { role: "assistant", content: "Slice 2 built." },
    ];

    // 1. Normal: all attachments preserved
    const normal = Projector.project(sampleMessages, "normal");
    expect(normal[1].attachments?.length).toBe(2);
    expect(normal[2].content.length).toBe(3000);

    // 2. Media-degraded: image removed, placeholder injected in text, file attachment preserved
    const degraded = Projector.project(sampleMessages, "media-degraded");
    expect(degraded[1].attachments?.some((a) => a.type === "image")).toBe(false);
    expect(degraded[1].attachments?.some((a) => a.type === "file")).toBe(true);
    expect(degraded[1].content).toContain("[Image Attachment: preview.png]");

    // 3. Media-stripped: all attachments dropped
    const stripped = Projector.project(sampleMessages, "media-stripped");
    expect(stripped[1].attachments).toBeUndefined();

    // 4. Strict: all attachments dropped and tool outputs > 2000 chars truncated
    const strict = Projector.project(sampleMessages, "strict");
    expect(strict[2].content.length).toBeLessThan(2500);
    expect(strict[2].content).toContain("[... Truncated");

    // 5. Emergency: retains system prompt and only last 2 conversation turns
    const emergency = Projector.project(sampleMessages, "emergency");
    expect(emergency[0].role).toBe("system");
    expect(emergency.length).toBeLessThanOrEqual(5);
  });

  it("selectModeForBudget picks correct degradation level automatically based on percentage", () => {
    expect(Projector.selectModeForBudget(50)).toBe("normal");
    expect(Projector.selectModeForBudget(72)).toBe("media-degraded");
    expect(Projector.selectModeForBudget(88)).toBe("strict");
    expect(Projector.selectModeForBudget(96)).toBe("emergency");
  });

  it("invariant holds: ContextMemory tracks pending tool IDs and resolves when tool response arrives", () => {
    const memory = new ContextMemory();

    memory.append({
      role: "assistant",
      content: "Calling tool",
      toolCallId: "call-tool-99",
    });
    expect(memory.getPendingToolResultIds().has("call-tool-99")).toBe(true);

    memory.append({
      role: "tool",
      content: "Tool result data",
      toolCallId: "call-tool-99",
    });
    expect(memory.getPendingToolResultIds().has("call-tool-99")).toBe(false);
  });
});
