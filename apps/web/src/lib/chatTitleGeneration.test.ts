// FILE: chatTitleGeneration.test.ts
// Purpose: Cover the deterministic half of new-chat naming: per-project chat
// numbering and the model-title vs `Chat N` fallback decision.
// Layer: Web unit test

import { ProjectId, ThreadId } from "@caide/contracts";
import { describe, expect, it } from "vitest";

import {
  resolveChatNumberForThread,
  resolveFinalChatTitle,
  type ChatThreadIdentity,
} from "./chatTitleGeneration";

const PROJECT_ID = ProjectId.makeUnsafe("project-chat-title");

function identity(
  id: string,
  createdAt: string,
  extra?: Partial<ChatThreadIdentity>,
): ChatThreadIdentity {
  return {
    id: ThreadId.makeUnsafe(id),
    projectId: PROJECT_ID,
    createdAt,
    ...extra,
  };
}

describe("resolveChatNumberForThread", () => {
  it("numbers chats by creation order within the project", () => {
    const threads = [
      identity("t1", "2026-01-01T00:00:00.000Z"),
      identity("t2", "2026-01-02T00:00:00.000Z"),
      identity("t3", "2026-01-03T00:00:00.000Z"),
    ];
    expect(resolveChatNumberForThread(threads, PROJECT_ID, ThreadId.makeUnsafe("t1"))).toBe(1);
    expect(resolveChatNumberForThread(threads, PROJECT_ID, ThreadId.makeUnsafe("t3"))).toBe(3);
  });

  it("ignores other projects and archived threads", () => {
    const threads = [
      identity("t1", "2026-01-01T00:00:00.000Z"),
      identity("gone", "2026-01-02T00:00:00.000Z", {
        archivedAt: "2026-02-01T00:00:00.000Z",
      }),
      {
        id: ThreadId.makeUnsafe("other"),
        projectId: ProjectId.makeUnsafe("project-other"),
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      identity("t2", "2026-01-03T00:00:00.000Z"),
    ];
    expect(resolveChatNumberForThread(threads, PROJECT_ID, ThreadId.makeUnsafe("t2"))).toBe(2);
  });

  it("sorts unknown threads last so retries never reuse a number", () => {
    const threads = [identity("t1", "2026-01-01T00:00:00.000Z")];
    expect(resolveChatNumberForThread(threads, PROJECT_ID, ThreadId.makeUnsafe("missing"))).toBe(2);
  });
});

describe("resolveFinalChatTitle", () => {
  it("prefers a usable model title", () => {
    expect(resolveFinalChatTitle("Fix the login redirect loop", 4)).toBe(
      "Fix the login redirect loop",
    );
  });

  it("falls back to Chat N for generic or empty model output", () => {
    expect(resolveFinalChatTitle("New thread", 4)).toBe("Chat 4");
    expect(resolveFinalChatTitle("  ", 2)).toBe("Chat 2");
    expect(resolveFinalChatTitle(null, 1)).toBe("Chat 1");
    expect(resolveFinalChatTitle(undefined, 7)).toBe("Chat 7");
  });
});
