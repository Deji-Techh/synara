// FILE: postDeleteDestination.ts
// Purpose: Decide where the UI lands after a project deletion: stay put when
// the current route survived, jump to the most recently visited surviving
// chat when the route died with the project, or surface the empty workspace
// (create-app prompt) when nothing survives.
// Layer: Web routing helper (pure)
// Exports: resolvePostDeleteDestination, PostDeleteDestination

import type { ThreadId } from "@caide/contracts";

import type { RecentView } from "../recentViews.logic";

export type PostDeleteDestination =
  | { kind: "stay" }
  | { kind: "thread"; threadId: ThreadId }
  | { kind: "empty" };

export function resolvePostDeleteDestination(input: {
  /** True when the current route pointed inside the deleted project. */
  routeAffected: boolean;
  /** Ids of the threads removed with the project (pre-delete snapshot). */
  deletedThreadIds: ReadonlySet<ThreadId>;
  /** MRU-ordered recent views (most recent first). */
  recentViews: readonly RecentView[];
  /** Recency-ordered surviving thread ids (most active first), MRU fallback. */
  fallbackThreadIds: readonly ThreadId[];
  /** True for thread ids that still resolve post-delete (summaries + drafts). */
  isThreadAvailable: (threadId: ThreadId) => boolean;
}): PostDeleteDestination {
  if (!input.routeAffected) {
    return { kind: "stay" };
  }
  const candidates: ThreadId[] = [];
  for (const view of input.recentViews) {
    if (view.kind === "thread") {
      candidates.push(view.threadId);
    }
  }
  candidates.push(...input.fallbackThreadIds);
  for (const threadId of candidates) {
    if (input.deletedThreadIds.has(threadId)) {
      continue;
    }
    if (!input.isThreadAvailable(threadId)) {
      continue;
    }
    return { kind: "thread", threadId };
  }
  return { kind: "empty" };
}
