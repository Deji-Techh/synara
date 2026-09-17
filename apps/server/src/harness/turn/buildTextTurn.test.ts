// FILE: buildTextTurn.test.ts
// Purpose: 008-m9b gate — build text turn: direct apply, dry-run repair,
// unclosed-write continuation, and empty-response handling. Scripted fake
// LLM; temp workspace; no provider calls.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { HarnessEvent } from "@caide/contracts";
import type { ChatMessage } from "../session/buildChain.ts";
import type { LLMAdapter } from "../loop/loop.ts";
import { runBuildTextTurn } from "./buildTextTurn.ts";
import { resolveUserInput, dismissUserInput } from "../../dyad/plan/userPrompt.ts";
import { setProposalTransport, type BuildProposal } from "../../dyad/editing/proposal.ts";

function workspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-buildtext-"));
  fs.writeFileSync(path.join(dir, "app.ts"), "line one\nline two\nline three\n");
  return dir;
}

/** Scripted adapter: each stream() call emits the next queued text as one token. */
function scriptedLlm(texts: string[], seenMessages: ChatMessage[][] = []): LLMAdapter {
  const queue = [...texts];
  return {
    async *stream(messages) {
      seenMessages.push(messages);
      const text = queue.shift() ?? "";
      if (text) yield { type: "token", content: text };
    },
  };
}

function harness() {
  const events: HarnessEvent[] = [];
  return {
    events,
    onEvent: (e: HarnessEvent): void => {
      events.push(e);
    },
  };
}

const baseMessages = (extra: ChatMessage[]): Promise<ChatMessage[]> =>
  Promise.resolve([{ role: "user", content: "build a thing" }, ...extra]);

describe("runBuildTextTurn (donor build path)", () => {
  it("streams text with no tools and applies write tags directly", async () => {
    const dir = workspace();
    const { events, onEvent } = harness();
    const result = await runBuildTextTurn({
      sessionId: "s-bt-apply",
      turnId: "t-1",
      appPath: dir,
      framework: "website",
      autoApprove: true,
      llm: scriptedLlm([
        'Intro text\n<dyad-write path="src/a.ts">export const a = 1;</dyad-write>\nDone',
      ]),
      buildMessages: baseMessages,
      onEvent,
    });
    expect(result.applied?.writtenFiles).toContain("src/a.ts");
    expect(fs.readFileSync(path.join(dir, "src/a.ts"), "utf8")).toBe("export const a = 1;");
    expect(events).toContainEqual(
      expect.objectContaining({ type: "artifact_updated", path: "src/a.ts" }),
    );
    expect(events.filter((e) => e.type === "token").length).toBeGreaterThan(0);
  });

  it("repairs a bad search-replace via the fix loop, then applies", async () => {
    const dir = workspace();
    const { events, onEvent } = harness();
    const seen: ChatMessage[][] = [];
    const result = await runBuildTextTurn({
      sessionId: "s-bt-repair",
      turnId: "t-2",
      appPath: dir,
      autoApprove: true,
      llm: scriptedLlm(
        [
          '<dyad-search-replace path="app.ts"><<<<<<< SEARCH\nabsent line\n=======\ny\n>>>>>>> REPLACE</dyad-search-replace>',
          '<dyad-write path="app.ts">fixed\n</dyad-write>',
        ],
        seen,
      ),
      buildMessages: baseMessages,
      onEvent,
    });
    expect(seen.length).toBe(2);
    // Second pass carries the fix prompt after the accumulated response.
    const secondPass = JSON.stringify(seen[1]);
    expect(secondPass).toContain("dyad-search-replace");
    expect(secondPass).toContain("read the latest version");
    expect(result.applied?.writtenFiles).toContain("app.ts");
    expect(fs.readFileSync(path.join(dir, "app.ts"), "utf8")).toBe("fixed");
    expect(events.map((e) => e.type)).toContain("token");
  });

  it("continues an unclosed write tag before applying", async () => {
    const dir = workspace();
    const { onEvent } = harness();
    const seen: ChatMessage[][] = [];
    const result = await runBuildTextTurn({
      sessionId: "s-bt-cont",
      turnId: "t-3",
      appPath: dir,
      autoApprove: true,
      llm: scriptedLlm(
        ['<dyad-write path="half.ts">const half = 1;', "\nconst done = 2;</dyad-write>"],
        seen,
      ),
      buildMessages: baseMessages,
      onEvent,
    });
    expect(seen.length).toBe(2);
    expect(JSON.stringify(seen[1])).toContain("Continue exactly where you left off");
    expect(result.applied?.writtenFiles).toContain("half.ts");
    expect(fs.readFileSync(path.join(dir, "half.ts"), "utf8")).toContain("const done = 2;");
  });

  it("reports an empty model response instead of completing silently", async () => {
    const dir = workspace();
    const { events, onEvent } = harness();
    const result = await runBuildTextTurn({
      sessionId: "s-bt-empty",
      turnId: "t-4",
      appPath: dir,
      autoApprove: true,
      llm: scriptedLlm([""]),
      buildMessages: baseMessages,
      onEvent,
    });
    expect(result.applied).toBeNull();
    expect(events).toContainEqual(
      expect.objectContaining({ type: "error", code: "BUILD_EMPTY_RESPONSE" }),
    );
  });

  it("stops cleanly when aborted mid-stream", async () => {
    const dir = workspace();
    const { onEvent } = harness();
    const controller = new AbortController();
    controller.abort("cancelled");
    const result = await runBuildTextTurn({
      sessionId: "s-bt-abort",
      turnId: "t-5",
      appPath: dir,
      signal: controller.signal,
      autoApprove: true,
      llm: scriptedLlm(['<dyad-write path="x.ts">x</dyad-write>']),
      buildMessages: baseMessages,
      onEvent,
    });
    expect(result.applied).toBeNull();
    expect(fs.existsSync(path.join(dir, "x.ts"))).toBe(false);
  });
});

describe("runBuildTextTurn proposal gate (donor shouldAutoApply)", () => {
  const tagText = '<dyad-write path="p.ts">export const p = 1;</dyad-write>';

  /** Stub transport capturing the card, answering on the next tick. */
  function stubTransport(answer: Record<string, string> | null): {
    proposals: Array<{ sessionId: string; requestId: string; proposal: BuildProposal }>;
  } {
    const proposals: Array<{ sessionId: string; requestId: string; proposal: BuildProposal }> = [];
    setProposalTransport({
      sendProposal: (sessionId, requestId, proposal) => {
        proposals.push({ sessionId, requestId, proposal });
        setImmediate(() => {
          if (answer) resolveUserInput(requestId, answer);
          else dismissUserInput(requestId);
        });
      },
      sendPromptWithdraw: () => {},
    });
    return { proposals };
  }

  it("applies tags on approval with the file list on the card", async () => {
    const dir = workspace();
    const { events, onEvent } = harness();
    const { proposals } = stubTransport({ approved: "true" });
    try {
      const result = await runBuildTextTurn({
        sessionId: "s-bt-prop-ok",
        turnId: "t-6",
        appPath: dir,
        autoApprove: false,
        llm: scriptedLlm([tagText]),
        buildMessages: baseMessages,
        onEvent,
      });
      expect(proposals).toHaveLength(1);
      expect(proposals[0]?.proposal.title).toBe("Proposed File Changes");
      expect(proposals[0]?.proposal.filesChanged).toMatchObject([{ path: "p.ts", type: "write" }]);
      expect(result.applied?.writtenFiles).toContain("p.ts");
      expect(fs.readFileSync(path.join(dir, "p.ts"), "utf8")).toBe("export const p = 1;");
      expect(events).toContainEqual(
        expect.objectContaining({ type: "artifact_updated", path: "p.ts" }),
      );
    } finally {
      setProposalTransport(null);
    }
  });

  it("discards tags on rejection with a transcript note", async () => {
    const dir = workspace();
    const { events, onEvent } = harness();
    stubTransport({ approved: "false" });
    try {
      const result = await runBuildTextTurn({
        sessionId: "s-bt-prop-no",
        turnId: "t-7",
        appPath: dir,
        autoApprove: false,
        llm: scriptedLlm([tagText]),
        buildMessages: baseMessages,
        onEvent,
      });
      expect(result.applied).toBeNull();
      expect(fs.existsSync(path.join(dir, "p.ts"))).toBe(false);
      expect(
        events.some(
          (e) =>
            e.type === "token" && (e as { content: string }).content.includes("Proposal rejected"),
        ),
      ).toBe(true);
    } finally {
      setProposalTransport(null);
    }
  });

  it("dismisses headless turns instead of parking them", async () => {
    const dir = workspace();
    setProposalTransport(null);
    const { onEvent } = harness();
    const result = await runBuildTextTurn({
      sessionId: "s-bt-prop-headless",
      turnId: "t-8",
      appPath: dir,
      autoApprove: false,
      llm: scriptedLlm([tagText]),
      buildMessages: baseMessages,
      onEvent,
    });
    expect(result.applied).toBeNull();
    expect(fs.existsSync(path.join(dir, "p.ts"))).toBe(false);
  });
});
