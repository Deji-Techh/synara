// FILE: postDeleteDestination.test.ts
// Purpose: Cover post-project-delete landing: stay, MRU jump, recency
// fallback, empty.
// Layer: Web unit test

import { ThreadId } from "@caide/contracts";
import { describe, expect, it } from "vitest";

import { resolvePostDeleteDestination } from "./postDeleteDestination";

const threadA = ThreadId.makeUnsafe("thread-a");
const threadB = ThreadId.makeUnsafe("thread-b");
const threadC = ThreadId.makeUnsafe("thread-c");
const threadGone = ThreadId.makeUnsafe("thread-gone");

function available(...ids: ThreadId[]) {
  const set = new Set(ids);
  return (threadId: ThreadId) => set.has(threadId);
}

describe("resolvePostDeleteDestination", () => {
  it("stays when the current route survived the deletion", () => {
    expect(
      resolvePostDeleteDestination({
        routeAffected: false,
        deletedThreadIds: new Set([threadGone]),
        recentViews: [{ kind: "thread", threadId: threadA }],
        fallbackThreadIds: [threadA],
        isThreadAvailable: available(threadA, threadB),
      }),
    ).toEqual({ kind: "stay" });
  });

  it("jumps to the most recently visited surviving chat", () => {
    expect(
      resolvePostDeleteDestination({
        routeAffected: true,
        deletedThreadIds: new Set([threadGone]),
        recentViews: [
          { kind: "thread", threadId: threadGone },
          { kind: "settings", section: "general" },
          { kind: "thread", threadId: threadB },
          { kind: "thread", threadId: threadA },
        ],
        fallbackThreadIds: [threadA],
        isThreadAvailable: available(threadA, threadB),
      }),
    ).toEqual({ kind: "thread", threadId: threadB });
  });

  it("skips recent views that no longer resolve", () => {
    expect(
      resolvePostDeleteDestination({
        routeAffected: true,
        deletedThreadIds: new Set([threadGone]),
        recentViews: [
          { kind: "thread", threadId: threadB },
          { kind: "thread", threadId: threadA },
        ],
        fallbackThreadIds: [],
        isThreadAvailable: available(threadA),
      }),
    ).toEqual({ kind: "thread", threadId: threadA });
  });

  it("falls back to recency order when MRU misses", () => {
    expect(
      resolvePostDeleteDestination({
        routeAffected: true,
        deletedThreadIds: new Set([threadGone]),
        recentViews: [],
        fallbackThreadIds: [threadC, threadA],
        isThreadAvailable: available(threadA, threadB),
      }),
    ).toEqual({ kind: "thread", threadId: threadA });
  });

  it("surfaces empty when nothing survives", () => {
    expect(
      resolvePostDeleteDestination({
        routeAffected: true,
        deletedThreadIds: new Set([threadGone, threadA, threadB, threadC]),
        recentViews: [
          { kind: "thread", threadId: threadA },
          { kind: "settings", section: "general" },
        ],
        fallbackThreadIds: [threadB],
        isThreadAvailable: available(),
      }),
    ).toEqual({ kind: "empty" });
  });

  it("surfaces empty with no recent views at all", () => {
    expect(
      resolvePostDeleteDestination({
        routeAffected: true,
        deletedThreadIds: new Set<ThreadId>(),
        recentViews: [],
        fallbackThreadIds: [],
        isThreadAvailable: available(),
      }),
    ).toEqual({ kind: "empty" });
  });
});
