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
import { collapseRepetitiveLines, narrationStem } from "./transcriptNarrative";
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
  harnessStore.handleEvent({
    type: "ui_prompt",
    sessionId: "s-hc",
    requestId: "r-p",
    kind: "proposal",
    payload: {
      title: "Proposed File Changes",
      filesChanged: [
        { name: "a.ts", path: "src/a.ts", summary: "Add widget", type: "write" },
        { name: "old.ts", path: "old.ts", summary: "Delete file", type: "delete" },
      ],
    },
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
    expect(markup).toContain("Proposed File Changes");
    expect(markup).toContain("src/a.ts");
    expect(markup).toContain("Approve &amp; apply");
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
});
