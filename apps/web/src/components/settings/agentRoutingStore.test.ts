// FILE: agentRoutingStore.test.ts
// Purpose: Routing settings load/save/normalize round-trip.

import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_ROUTING,
  loadAgentRouting,
  saveAgentRouting,
} from "./agentRoutingStore";

beforeEach(() => {
  localStorage.clear();
});

describe("agent routing store", () => {
  it("defaults to single mode with empty slots", () => {
    expect(loadAgentRouting()).toEqual(DEFAULT_ROUTING);
    expect(DEFAULT_ROUTING.mode).toBe("single");
  });

  it("round-trips per-step picks and normalizes garbage", () => {
    saveAgentRouting({
      mode: "per-step",
      steps: {
        scout: { providerId: "openai", modelId: "gpt-x" },
        builder: { providerId: "", modelId: "" },
        planner: { providerId: "anthropic", modelId: "" },
      },
      fallbacks: [],
    });
    expect(loadAgentRouting().mode).toBe("per-step");
    expect(loadAgentRouting().steps.scout).toEqual({ providerId: "openai", modelId: "gpt-x" });
    localStorage.setItem("caide:agent-routing.v1", JSON.stringify({ mode: "wild", steps: null }));
    expect(loadAgentRouting().mode).toBe("single");
  });

  it("round-trips fallbacks capped at 3", () => {
    saveAgentRouting({
      mode: "single",
      steps: {
        scout: { providerId: "", modelId: "" },
        builder: { providerId: "", modelId: "" },
        planner: { providerId: "", modelId: "" },
      },
      fallbacks: [
        { providerId: "openai", modelId: "gpt-x" },
        { providerId: "", modelId: "" },
      ],
    });
    expect(loadAgentRouting().fallbacks).toEqual([{ providerId: "openai", modelId: "gpt-x" }]);
  });
});
