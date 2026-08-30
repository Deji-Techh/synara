import { describe, it, expect } from "vitest";
import { RollingCompactor, shouldCompact } from "./index.ts";
import { ContextMemory } from "../context/memory.ts";
import type { SpecDoc } from "../planner/specValidator.ts";

describe("Milestone M14 — Rolling Compaction @70% & Per-Slice Isolation", () => {
  const dummySpec: SpecDoc = {
    appName: "TestApp",
    targetUser: "User",
    userContext: "Testing",
    framework: "react-native",
    flows: [{ name: "Flow 1", steps: ["step 1", "step 2"] }],
    v1Scope: ["Scope 1"],
    v1OutOfScope: ["Out 1"],
    screens: [
      {
        name: "Home",
        path: "src/Home.tsx",
        components: ["HomeView"],
        hasEmptyState: true,
        hasLoadingState: true,
        hasErrorState: true,
      },
    ],
    slices: [
      {
        name: "Slice 1 — Foundation",
        description: "Scaffold",
        files: ["src/App.tsx"],
        acceptanceCriteria: ["works"],
      },
      {
        name: "Slice 2 — Dashboard",
        description: "Dashboard view",
        files: ["src/Dashboard.tsx"],
        acceptanceCriteria: ["works"],
      },
    ],
  };

  it("shouldCompact triggers proactively at 70% threshold, not at 100%", () => {
    const budget = 10_000;
    expect(shouldCompact(5_000, budget)).toBe(false);
    expect(shouldCompact(6_900, budget)).toBe(false);
    expect(shouldCompact(7_000, budget)).toBe(true);
    expect(shouldCompact(8_500, budget)).toBe(true);
  });

  it("RollingCompactor replaces bloated history with structured summary and last 3 turns", async () => {
    const memory = new ContextMemory();
    const compactor = new RollingCompactor();
    const budget = 5_000; // 5000 tokens ≈ 19,000 chars

    // Add system prompt
    memory.append({ role: "system", content: "You are Caide builder." });

    // Add 10 conversation turns with large contents to exceed 70% (3,500 tokens)
    for (let i = 1; i <= 10; i++) {
      memory.append({ role: "user", content: `User question ${i}: ` + "x".repeat(1000) });
      memory.append({
        role: "tool",
        content: JSON.stringify({ path: `src/file${i}.tsx` }),
        toolName: "write_file",
      });
      memory.append({ role: "assistant", content: `Assistant answer ${i}: ` + "y".repeat(1000) });
    }

    const preUsage = memory.getBudgetUsage(budget);
    expect(preUsage.usedTokens).toBeGreaterThan(3500);
    expect(preUsage.usagePercent).toBeGreaterThanOrEqual(70);

    // Execute compaction
    const result = await compactor.compact(memory, budget, dummySpec);
    expect(result.compacted).toBe(true);
    expect(result.summary).toBeDefined();

    // Check post-compaction context
    const postMessages = memory.rawMessages();
    expect(postMessages.length).toBeLessThan(10);

    // System prompt preserved
    expect(postMessages[0].role).toBe("system");

    // Summary message injected
    const summaryMsg = postMessages.find((m) => m.isSummary);
    expect(summaryMsg).toBeDefined();
    expect(summaryMsg?.content).toContain("Rolling Compaction Summary");
    expect(summaryMsg?.content).toContain("What has been built:");
    expect(summaryMsg?.content).toContain("Slice 1 — Foundation");

    // Most recent turn is preserved
    const lastMsg = postMessages[postMessages.length - 1];
    expect(lastMsg.content).toContain("Assistant answer 10");
  });

  it("isCompacting latch prevents overlapping duplicate compaction cycles", async () => {
    const memory = new ContextMemory();
    const compactor = new RollingCompactor();

    memory.append({ role: "user", content: "z".repeat(30_000) });

    const promise1 = compactor.compact(memory, 5000, dummySpec);
    const promise2 = compactor.compact(memory, 5000, dummySpec);

    const [res1, res2] = await Promise.all([promise1, promise2]);
    expect(res1.compacted).toBe(true);
    expect(res2.compacted).toBe(false); // Second rejected by latch
  });
});
