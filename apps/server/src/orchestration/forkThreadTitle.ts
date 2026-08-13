// FILE: forkThreadTitle.ts
// Purpose: Assign stable, lineage-wide sequence titles to forked threads.
// Layer: Orchestration domain helper

interface ForkLineageThread {
  readonly id?: string | undefined;
  readonly threadId?: string | undefined;
  readonly projectId: string;
  readonly title: string;
  readonly forkSourceThreadId?: string | null | undefined;
  readonly sidechatSourceThreadId?: string | null | undefined;
}

interface LineageRoot {
  readonly thread: ForkLineageThread;
  readonly complete: boolean;
}

const FORK_VERSION_SUFFIX = /^(.*) \((\d+)\)$/;

function getThreadId(thread: ForkLineageThread): string {
  return thread.threadId ?? thread.id ?? "";
}

function findLineageRoot(
  source: ForkLineageThread,
  threadsById: ReadonlyMap<string, ForkLineageThread>,
): LineageRoot {
  const sourceId = getThreadId(source);
  const visited = new Set<string>([sourceId]);
  let current = source;

  while (current.forkSourceThreadId) {
    const parent = threadsById.get(current.forkSourceThreadId);
    const currentId = getThreadId(current);
    if (!parent || parent.projectId !== source.projectId || visited.has(getThreadId(parent))) {
      return { thread: current, complete: false };
    }
    visited.add(getThreadId(parent));
    current = parent;
  }

  return { thread: current, complete: true };
}

function parseForkVersion(title: string): { readonly baseTitle: string; readonly version: number } {
  const match = FORK_VERSION_SUFFIX.exec(title);
  if (!match) {
    return { baseTitle: title, version: 1 };
  }

  const version = Number(match[2]);
  if (!Number.isSafeInteger(version) || version < 2) {
    return { baseTitle: title, version: 1 };
  }

  return { baseTitle: match[1]!, version };
}

export function buildForkThreadTitle(
  source: ForkLineageThread,
  projectThreads: readonly ForkLineageThread[],
): string {
  const threadsById = new Map(projectThreads.map((thread) => [getThreadId(thread), thread]));
  const sourceRoot = findLineageRoot(source, threadsById);
  const fallbackTitle = parseForkVersion(source.title);
  const lineageTitle = sourceRoot.complete
    ? parseForkVersion(sourceRoot.thread.title)
    : fallbackTitle;
  const family = projectThreads.filter((thread) => {
    if (thread.projectId !== source.projectId || thread.sidechatSourceThreadId) {
      return false;
    }
    const root = findLineageRoot(thread, threadsById);
    return (
      root.complete &&
      sourceRoot.complete &&
      getThreadId(root.thread) === getThreadId(sourceRoot.thread)
    );
  });
  const latestNamedVersion = family.reduce((latest, thread) => {
    const candidate = parseForkVersion(thread.title);
    return candidate.baseTitle === lineageTitle.baseTitle
      ? Math.max(latest, candidate.version)
      : latest;
  }, lineageTitle.version);
  const nextVersion = Math.max(2, family.length + 1, latestNamedVersion + 1);

  return `${lineageTitle.baseTitle} (${nextVersion})`;
}
