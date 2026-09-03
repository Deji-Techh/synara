// FILE: harnessStore.ui.test.ts
// Purpose: M3 gate — store tracks UI prompts, reveals, and plan lifecycle.

import { describe, expect, it } from "vitest";
import { harnessStore } from "./harnessStore";

describe("harnessStore ui events (m3)", () => {
  it("queues prompts without duplicates and resolves them", () => {
    harnessStore.clearSession("s-ui");
    harnessStore.handleEvent({
      type: "ui_prompt",
      sessionId: "s-ui",
      requestId: "r1",
      kind: "questionnaire",
      payload: { questions: [] },
    });
    harnessStore.handleEvent({
      type: "ui_prompt",
      sessionId: "s-ui",
      requestId: "r1",
      kind: "questionnaire",
      payload: { questions: [] },
    });
    expect(harnessStore.getState().sessions["s-ui"]?.prompts).toHaveLength(1);
    harnessStore.resolvePrompt("s-ui", "r1");
    expect(harnessStore.getState().sessions["s-ui"]?.prompts).toHaveLength(0);
    harnessStore.clearSession("s-ui");
  });

  it("records reveals and plan lifecycle", () => {
    harnessStore.clearSession("s-ui");
    harnessStore.handleEvent({ type: "ui_reveal", sessionId: "s-ui", pane: "database", reason: "execute_sql" });
    expect(harnessStore.getState().sessions["s-ui"]?.reveals).toHaveLength(1);
    harnessStore.handleEvent({
      type: "plan_update",
      sessionId: "s-ui",
      title: "Auth",
      summary: "Login",
      plan: "## Overview",
    });
    expect(harnessStore.getState().sessions["s-ui"]?.plan?.exited).toBe(false);
    harnessStore.handleEvent({ type: "plan_exit", sessionId: "s-ui" });
    expect(harnessStore.getState().sessions["s-ui"]?.plan?.exited).toBe(true);
    harnessStore.clearSession("s-ui");
  });

  it("records blueprint updates", () => {
    harnessStore.clearSession("s-ui");
    harnessStore.handleEvent({
      type: "blueprint_update",
      sessionId: "s-ui",
      appName: "FreshBite",
      userPrompt: "Build me a restaurant website",
      framework: "website",
      designDirection: "Warm and inviting",
      primaryColor: "#E85D04",
      visuals: [{ type: "logo", description: "Header logo", prompt: "Minimalist logo" }],
    });
    const blueprint = harnessStore.getState().sessions["s-ui"]?.blueprint;
    expect(blueprint?.appName).toBe("FreshBite");
    expect(blueprint?.approved).toBe(false);
    harnessStore.clearSession("s-ui");
  });
});
