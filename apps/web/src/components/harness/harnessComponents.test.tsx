// FILE: harnessComponents.test.tsx
// Purpose: M3 gate — harness prompt queue, plan card, and gate render from
// store state (static markup; sending is covered by store tests).

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { harnessStore } from "~/harnessStore";
import { HarnessBlueprintCard } from "./HarnessBlueprintCard";
import { HarnessPlanCard } from "./HarnessPlanCard";
import { HarnessTodosCard } from "./HarnessTodosCard";
import { HarnessVerifierCard } from "./HarnessVerifierCard";
import { HarnessVersionsCard } from "./HarnessVersionsCard";
import { HarnessTranscript, collapseRepetitiveLines, narrationStem } from "./HarnessTranscript";
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

  it("disables questionnaire submit until at least one answer exists", () => {
    seedPrompts();
    // Static render = no answers yet: Submit must be disabled so empty
    // submits (which the model reads as dismissal and re-asks) are impossible.
    const markup = renderToStaticMarkup(<HarnessPrompts sessionId="s-hc" send={send} />);
    expect(markup).toContain("Submit answers");
    expect(markup).toMatch(
      /disabled[^>]*>Submit answers|Submit answers[^<]*<\/button[^>]*disabled/,
    );
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

  it("renders the transcript extras in order: tool card, checkpoint, error (text lives in the thread transcript)", () => {
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
    // Token text is mirrored into the thread transcript, never the strip.
    expect(markup).not.toContain("Working on it");
    expect(markup).toContain("Read");
    expect(markup).toContain("a.ts");
    expect(markup).toContain("Gate review");
    expect(markup).toContain("kaput");
    harnessStore.clearSession("s-hc");
  });

  it("renders the todos, verifier, and versions cards from store state", () => {
    harnessStore.clearSession("s-hc");
    harnessStore.handleEvent({
      type: "todos_update",
      sessionId: "s-hc",
      todos: [
        { id: "1", content: "Build auth", status: "in_progress" },
        { id: "2", content: "Write tests", status: "pending" },
      ],
    });
    const todos = renderToStaticMarkup(<HarnessTodosCard sessionId="s-hc" />);
    expect(todos).toContain("Build auth");
    expect(todos).toContain("(0/2)");
    expect(todos).toContain('role="progressbar"');
    expect(todos).toContain("To-dos");

    harnessStore.handleEvent({
      type: "verifier_result",
      sessionId: "s-hc",
      passed: false,
      confidence: 70,
      tasteScore: 55,
      issues: ["[major] a.ts — missing null check"],
    });
    const verifier = renderToStaticMarkup(<HarnessVerifierCard sessionId="s-hc" />);
    expect(verifier).toContain("Review found 1 issue");
    expect(verifier).toContain("below bar");

    harnessStore.handleEvent({
      type: "versions_state",
      sessionId: "s-hc",
      versions: [{ hash: "abc1234567", message: "Checkpoint: polish", createdAt: Date.now() }],
    });
    const versions = renderToStaticMarkup(<HarnessVersionsCard sessionId="s-hc" send={send} />);
    expect(versions).toContain("Checkpoint: polish");
    expect(versions).toContain("1 checkpoint");
    harnessStore.clearSession("s-hc");
  });

  it("does not render diverted user bubbles in the strip (they live in the thread transcript)", () => {
    harnessStore.clearSession("s-hc");
    harnessStore.appendUserMessage("s-hc", "m1", "Build me a marketplace");
    const markup = renderToStaticMarkup(<HarnessTranscript sessionId="s-hc" send={send} />);
    expect(markup).not.toContain("Build me a marketplace");
    harnessStore.clearSession("s-hc");
  });

  it("renders todo file refs and questionnaire why text", () => {
    harnessStore.clearSession("s-hc");
    harnessStore.handleEvent({
      type: "todos_update",
      sessionId: "s-hc",
      todos: [
        {
          id: "1",
          content: "Build home",
          status: "in_progress",
          ref: "src/screens/HomeScreen.tsx",
        },
      ],
    });
    const todos = renderToStaticMarkup(<HarnessTodosCard sessionId="s-hc" />);
    expect(todos).toContain("HomeScreen.tsx");
    expect(todos).toContain("Open src/screens/HomeScreen.tsx");
    harnessStore.clearSession("s-hc");

    harnessStore.handleEvent({
      type: "ui_prompt",
      sessionId: "s-hc",
      requestId: "r-why",
      kind: "questionnaire",
      payload: {
        questions: [
          { id: "q1", question: "Style?", type: "radio", options: ["A"], why: "Locks the palette" },
        ],
      },
    });
    const prompts = renderToStaticMarkup(<HarnessPrompts sessionId="s-hc" send={send} />);
    expect(prompts).toContain("Locks the palette");
    harnessStore.clearSession("s-hc");
  });

  it("collapses repeated assistant status narration (item 16 helpers)", () => {
    expect(narrationStem("Building your IUO marketplace — mapping the project first.")).toBe(
      "building your iuo marketplace",
    );
    expect(narrationStem("Done.")).toBe("");
    const { text, collapsed } = collapseRepetitiveLines(
      "Building your IUO marketplace — mapping the project first.\nBuilding your IUO marketplace — mapping the full experience.\nFixing import paths now.",
    );
    expect(collapsed).toBe(1);
    expect(text).toContain("Fixing import paths now.");
    expect(text.match(/Building your IUO/g)).toHaveLength(1);

    // The strip no longer renders token text (thread transcript owns it),
    // but tool cards still render around it.
    harnessStore.clearSession("s-hc");
    harnessStore.handleEvent({
      type: "token",
      sessionId: "s-hc",
      content: "Building the full marketplace — wiring home first.",
    });
    harnessStore.handleEvent({
      type: "tool_call",
      sessionId: "s-hc",
      id: "c1",
      name: "read_file",
      args: {},
      status: "started",
    });
    harnessStore.handleEvent({
      type: "tool_call",
      sessionId: "s-hc",
      id: "c1",
      name: "read_file",
      args: {},
      status: "completed",
      result: "ok",
    });
    const markup = renderToStaticMarkup(<HarnessTranscript sessionId="s-hc" send={send} />);
    expect(markup).not.toContain("Building the full marketplace");
    expect(markup).toContain("Read");
    harnessStore.clearSession("s-hc");
  });

  it("renders inline images from screenshot tool results", () => {
    harnessStore.clearSession("s-hc");
    const payload = JSON.stringify({ base64: `data:image/png;base64,${"A".repeat(300)}` });
    harnessStore.handleEvent({ type: "token", sessionId: "s-hc", content: "Captured." });
    harnessStore.handleEvent({
      type: "tool_call",
      sessionId: "s-hc",
      id: "c-img",
      name: "screenshot",
      args: {},
      status: "started",
    });
    harnessStore.handleEvent({
      type: "tool_call",
      sessionId: "s-hc",
      id: "c-img",
      name: "screenshot",
      args: {},
      status: "completed",
      result: payload,
    });
    const markup = renderToStaticMarkup(<HarnessTranscript sessionId="s-hc" send={send} />);
    expect(markup).toContain("<img");
    expect(markup).toContain("data:image/png;base64,");
    harnessStore.clearSession("s-hc");
  });
});
