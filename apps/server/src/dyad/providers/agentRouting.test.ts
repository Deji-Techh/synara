// FILE: agentRouting.test.ts
// Purpose: Routing config normalization + step classification.

import { describe, expect, it } from "vitest";
import {
  classifyStepKind,
  DEFAULT_AGENT_ROUTING,
  isSlotSet,
  MAX_FALLBACKS,
  normalizeAgentRouting,
} from "./agentRouting.ts";

describe("agent routing", () => {
  it("defaults to single mode with empty slots", () => {
    expect(DEFAULT_AGENT_ROUTING.mode).toBe("single");
    expect(normalizeAgentRouting(undefined)).toEqual(DEFAULT_AGENT_ROUTING);
    expect(normalizeAgentRouting(null)).toEqual(DEFAULT_AGENT_ROUTING);
    expect(isSlotSet({})).toBe(false);
    expect(isSlotSet({ modelId: "x" })).toBe(true);
  });

  it("keeps known providers, drops unknown ones, trims models", () => {
    const out = normalizeAgentRouting({
      mode: "per-step",
      steps: {
        scout: { providerId: "openai", modelId: "  gpt-x  " },
        builder: { providerId: "nope", modelId: "m" },
        planner: "junk",
      },
    });
    expect(out.mode).toBe("per-step");
    expect(out.steps.scout).toEqual({ providerId: "openai", modelId: "gpt-x" });
    expect(out.steps.builder).toEqual({ modelId: "m" });
    expect(out.steps.planner).toEqual({});
    expect(normalizeAgentRouting({ mode: "wild" }).mode).toBe("single");
  });

  it("normalizes the fallback chain (known providers, max 3, empties dropped)", () => {
    expect(normalizeAgentRouting({}).fallbacks).toEqual([]);
    const out = normalizeAgentRouting({
      fallbacks: [
        { providerId: "openai", modelId: "gpt-x" },
        { providerId: "nope", modelId: "m" },
        {},
        { providerId: "anthropic" },
        { providerId: "google" },
      ],
    });
    expect(out.fallbacks).toHaveLength(MAX_FALLBACKS);
    expect(out.fallbacks[0]).toEqual({ providerId: "openai", modelId: "gpt-x" });
    expect(out.fallbacks[1]).toEqual({ modelId: "m" });
  });

  it("classifies planner for plan turns, scout for reads, builder after mutation", () => {
    const base = { step: 0, lastStepAllReadOnly: true, hasMutatedThisTurn: false } as const;
    expect(classifyStepKind({ ...base, chatMode: "plan" })).toBe("planner");
    expect(classifyStepKind({ ...base, chatMode: "agent" })).toBe("scout");
    expect(
      classifyStepKind({
        chatMode: "agent",
        step: 3,
        lastStepAllReadOnly: false,
        hasMutatedThisTurn: true,
      }),
    ).toBe("builder");
    expect(
      classifyStepKind({
        chatMode: "build",
        step: 5,
        lastStepAllReadOnly: true,
        hasMutatedThisTurn: true,
      }),
    ).toBe("scout");
    expect(
      classifyStepKind({
        chatMode: "ask",
        step: 2,
        lastStepAllReadOnly: true,
        hasMutatedThisTurn: false,
      }),
    ).toBe("scout");
  });
});
