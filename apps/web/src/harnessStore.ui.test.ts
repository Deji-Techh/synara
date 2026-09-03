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

  it("keeps an ordered timeline of tokens, tools, checkpoints, and errors", () => {
    harnessStore.clearSession("s-ui");
    harnessStore.handleEvent({ type: "token", sessionId: "s-ui", content: "Hi" });
    harnessStore.handleEvent({
      type: "tool_call",
      sessionId: "s-ui",
      id: "c1",
      name: "read_file",
      args: {},
      status: "started",
    });
    harnessStore.handleEvent({ type: "token", sessionId: "s-ui", content: "there" });
    harnessStore.handleEvent({
      type: "tool_call",
      sessionId: "s-ui",
      id: "c1",
      name: "read_file",
      args: {},
      status: "completed",
      result: "ok",
    });
    harnessStore.handleEvent({
      type: "checkpoint",
      sessionId: "s-ui",
      id: "k1",
      reason: "Review",
      requiresResponse: true,
    });
    harnessStore.handleEvent({
      type: "error",
      sessionId: "s-ui",
      code: "E",
      message: "boom",
      recoverable: true,
    });
    const timeline = harnessStore.getState().sessions["s-ui"]?.timeline ?? [];
    // completed tool_call updates in place — only the started call is timelined.
    expect(timeline.map((e) => e.kind)).toEqual(["token", "tool", "token", "checkpoint", "error"]);
    expect(timeline.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
    harnessStore.clearSession("s-ui");
  });
});
