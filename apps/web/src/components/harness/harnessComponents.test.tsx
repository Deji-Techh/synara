// FILE: harnessComponents.test.tsx
// Purpose: M3 gate — harness prompt queue, plan card, and gate render from
// store state (static markup; sending is covered by store tests).

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { harnessStore } from "~/harnessStore";
import { HarnessBlueprintCard } from "./HarnessBlueprintCard";
import { HarnessPlanCard } from "./HarnessPlanCard";
import { HarnessTranscript } from "./HarnessTranscript";
import { HarnessPrompts } from "./HarnessPrompts";

const send = () => {};

function seedPrompts() {
  harnessStore.clearSession("s-hc");
  harnessStore.handleEvent({
    type: "ui_prompt",
    sessionId: "s-hc",
    requestId: "r-q",
    kind: "questionnaire",
    payload: { questions: [{ id: "q1", question: "Style?", type: "radio", options: ["A", "B"] }] },
  });
  harnessStore.handleEvent({
    type: "ui_prompt",
    sessionId: "s-hc",
    requestId: "r-c",
    kind: "tool-consent",
    payload: { toolName: "run_command", inputPreview: "bun run dev" },
  });
  harnessStore.handleEvent({
    type: "ui_prompt",
    sessionId: "s-hc",
    requestId: "r-m",
    kind: "mcp-consent",
    payload: { serverName: "github", toolName: "issue_write" },
  });
  harnessStore.handleEvent({
    type: "ui_prompt",
    sessionId: "s-hc",
    requestId: "r-e",
    kind: "env-vars",
    payload: { vars: [{ key: "STRIPE_SECRET_KEY" }] },
  });
  harnessStore.handleEvent({
    type: "ui_prompt",
    sessionId: "s-hc",
    requestId: "r-i",
    kind: "integration",
    payload: { provider: null },
  });
}

describe("harness components (m3)", () => {
  it("renders every prompt kind with actions", () => {
    seedPrompts();
    const markup = renderToStaticMarkup(<HarnessPrompts sessionId="s-hc" send={send} />);
    expect(markup).toContain("Style?");
    expect(markup).toContain("Allow run_command?");
    expect(markup).toContain("github");
    expect(markup).toContain("issue_write");
    expect(markup).toContain("STRIPE_SECRET_KEY");
    expect(markup).toContain("Connect a database provider");
    expect(markup).toContain("Always allow");
    harnessStore.clearSession("s-hc");
  });

  it("renders the plan card and the continue gate", () => {
    harnessStore.clearSession("s-hc");
    harnessStore.handleEvent({
      type: "plan_update",
      sessionId: "s-hc",
      title: "Auth",
      summary: "Login",
      plan: "## Overview\nThings.",
    });
    const before = renderToStaticMarkup(<HarnessPlanCard sessionId="s-hc" send={send} />);
    expect(before).toContain("Auth");
    expect(before).toContain("Looks good — continue");

    harnessStore.handleEvent({ type: "plan_exit", sessionId: "s-hc" });
    const after = renderToStaticMarkup(<HarnessPlanCard sessionId="s-hc" send={send} />);
    expect(after).toContain("Continue in Agent mode");
    expect(after).toContain("Start building");
    harnessStore.clearSession("s-hc");
  });

  it("renders the blueprint card with approval actions", () => {
    harnessStore.clearSession("s-hc");
    harnessStore.handleEvent({
      type: "blueprint_update",
      sessionId: "s-hc",
      appName: "FreshBite",
      userPrompt: "Build me a restaurant website",
      framework: "website",
      designDirection: "Warm and inviting",
      primaryColor: "#E85D04",
      visuals: [{ type: "logo", description: "Header logo", prompt: "Minimalist logo" }],
    });
    const markup = renderToStaticMarkup(<HarnessBlueprintCard sessionId="s-hc" send={send} />);
    expect(markup).toContain("FreshBite");
    expect(markup).toContain("Approve blueprint");
    expect(markup).toContain("Request changes");
    harnessStore.clearSession("s-hc");
  });

  it("renders the transcript in order: text, tool card, checkpoint, error", () => {
    harnessStore.clearSession("s-hc");
    harnessStore.handleEvent({ type: "token", sessionId: "s-hc", content: "Working on it" });
    harnessStore.handleEvent({
      type: "tool_call",
      sessionId: "s-hc",
      id: "c9",
      name: "read_file",
      args: { path: "a.ts" },
      status: "started",
    });
    harnessStore.handleEvent({
      type: "tool_call",
      sessionId: "s-hc",
      id: "c9",
      name: "read_file",
      args: { path: "a.ts" },
      status: "completed",
      result: "content here",
    });
    harnessStore.handleEvent({
      type: "checkpoint",
      sessionId: "s-hc",
      id: "k9",
      reason: "Gate review",
      requiresResponse: true,
      diff: "diff text",
    });
    harnessStore.handleEvent({
      type: "error",
      sessionId: "s-hc",
      code: "E",
      message: "kaput",
      recoverable: true,
    });
    const markup = renderToStaticMarkup(<HarnessTranscript sessionId="s-hc" send={send} />);
    expect(markup).toContain("Working on it");
    expect(markup).toContain("Read");
    expect(markup).toContain("a.ts");
    expect(markup).toContain("Gate review");
    expect(markup).toContain("kaput");
    harnessStore.clearSession("s-hc");
  });
});
