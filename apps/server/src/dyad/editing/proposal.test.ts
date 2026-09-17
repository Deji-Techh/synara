// FILE: proposal.test.ts
// Purpose: 008-m9b2 gate — proposal payload shape (V1 get-proposal parity)
// and approval verdicts (approve/reject/dismiss/headless/empty).

import { describe, expect, it } from "vitest";
import {
  buildProposalPayload,
  requestBuildProposalApproval,
  setProposalTransport,
} from "./proposal.ts";
import { resolveUserInput } from "../plan/userPrompt.ts";

const RESPONSE = [
  "<dyad-chat-summary>Add a widget</dyad-chat-summary>",
  '<dyad-write path="src/a.ts" description="Add widget">export const a = 1;</dyad-write>',
  '<dyad-search-replace path="src/b.ts"><<<<<<< SEARCH\nx\n=======\ny\n>>>>>>> REPLACE</dyad-search-replace>',
  '<dyad-rename from="old.ts" to="new.ts"></dyad-rename>',
  '<dyad-delete path="gone.ts" />',
  '<dyad-copy from="a.png" to="b.png" />',
  '<dyad-generate-test path="login">t</dyad-generate-test>',
].join("\n");

describe("buildProposalPayload (donor get-proposal parity)", () => {
  it("lists every file-tag family with summaries", () => {
    const proposal = buildProposalPayload(RESPONSE);
    expect(proposal?.title).toBe("Add a widget");
    expect(proposal?.filesChanged).toMatchObject([
      { path: "src/a.ts", type: "write", summary: "Add widget" },
      { path: "src/b.ts", type: "write" },
      { path: "new.ts", type: "rename" },
      { path: "gone.ts", type: "delete", summary: "Delete file" },
      { path: "b.png", type: "copy" },
      { path: "tests/login.spec.ts", type: "test" },
    ]);
  });

  it("defaults the title and returns null for tag-free responses", () => {
    expect(buildProposalPayload('<dyad-write path="a.ts">x</dyad-write>')?.title).toBe(
      "Proposed File Changes",
    );
    expect(buildProposalPayload("Just chat text.")).toBeNull();
  });
});

describe("requestBuildProposalApproval", () => {
  function stubTransport(answer: Record<string, string> | null): string[] {
    const sent: string[] = [];
    setProposalTransport({
      sendProposal: (_sessionId, requestId, _proposal) => {
        sent.push(requestId);
        setImmediate(() => (answer ? resolveUserInput(requestId, answer) : undefined));
      },
      sendPromptWithdraw: () => {},
    });
    return sent;
  }

  it("approves and rejects on user verdict", async () => {
    stubTransport({ approved: "true" });
    try {
      const ok = await requestBuildProposalApproval({
        sessionId: "s-prop-ok",
        fullText: '<dyad-write path="a.ts">x</dyad-write>',
      });
      expect(ok.decision).toBe("approved");
      expect(typeof ok.requestId).toBe("string");
    } finally {
      setProposalTransport(null);
    }
    stubTransport({ approved: "false" });
    try {
      const no = await requestBuildProposalApproval({
        sessionId: "s-prop-no",
        fullText: '<dyad-write path="a.ts">x</dyad-write>',
      });
      expect(no.decision).toBe("rejected");
    } finally {
      setProposalTransport(null);
    }
  });

  it("dismisses headless turns instead of parking them", async () => {
    setProposalTransport(null);
    const result = await requestBuildProposalApproval({
      sessionId: "s-prop-headless",
      fullText: '<dyad-write path="a.ts">x</dyad-write>',
    });
    expect(result).toMatchObject({ decision: "dismissed", requestId: null });
  });

  it("reports empty for tag-free responses without sending a card", async () => {
    const sent = stubTransport({ approved: "true" });
    try {
      const result = await requestBuildProposalApproval({
        sessionId: "s-prop-empty",
        fullText: "Just chat text.",
      });
      expect(result).toMatchObject({ decision: "empty", requestId: null });
      expect(sent).toHaveLength(0);
    } finally {
      setProposalTransport(null);
    }
  });

  it("times out unanswered cards instead of parking forever", async () => {
    stubTransport(null);
    try {
      const result = await requestBuildProposalApproval({
        sessionId: "s-prop-timeout",
        fullText: '<dyad-write path="a.ts">x</dyad-write>',
        timeoutMs: 15,
      });
      expect(result.decision).toBe("timed-out");
    } finally {
      setProposalTransport(null);
    }
  });
});
