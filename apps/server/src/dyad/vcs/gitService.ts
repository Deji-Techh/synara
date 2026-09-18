// FILE: gitService.ts
// Purpose: Serialized per-repo stage/commit sequences with index.lock
// retry (agent + auto-checkpoint + tools share repos; concurrent sequences
// must not race on .git/index.lock).
// Donor: dyad x caide src/ipc/services/git_service.ts — serialization,
// stale-lock recovery, and method semantics verbatim; git plumbing via
// dyad/vcs runGit (no dugite/git_utils).

import { runGit } from "./gitTools.ts";

const INDEX_LOCK_RETRY_DELAYS_MS = [100, 250, 500] as const;
const STALE_INDEX_LOCK_AGE_MS = 5 * 60_000;

export class GitServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitServiceError";
  }
}

// Git protects its index with .git/index.lock. All CAIDE-owned
// stage/commit sequences for the same repository must run one at a time or
// concurrent app actions can race and one of them will fail to create lock.
const repositoryOperationTails = new Map<string, Promise<unknown>>();

function isGitIndexLockError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    message.includes("index.lock") &&
    (message.includes("file exists") ||
      message.includes("unable to create") ||
      message.includes("another git process"))
  );
}

async function indexLockPath(repoPath: string): Promise<string | null> {
  const { default: path } = await import("node:path");
  const { default: fs } = await import("node:fs");
  const gitMetadataPath = path.join(repoPath, ".git");
  try {
    const stat = await fs.promises.stat(gitMetadataPath);
    if (stat.isDirectory()) return path.join(gitMetadataPath, "index.lock");
    if (stat.isFile()) {
      // Worktrees/submodules store a `gitdir: ...` pointer in .git.
      const metadata = await fs.promises.readFile(gitMetadataPath, "utf8");
      const match = /^gitdir:\s*(.+)$/im.exec(metadata);
      if (!match?.[1]) return null;
      const ref = match[1].trim();
      const gitDir = path.isAbsolute(ref) ? ref : path.resolve(repoPath, ref);
      return path.join(gitDir, "index.lock");
    }
  } catch {
    return null;
  }
  return null;
}

async function removeStaleIndexLock(repoPath: string): Promise<boolean> {
  const lockPath = await indexLockPath(repoPath);
  if (!lockPath) return false;
  try {
    const { default: fs } = await import("node:fs");
    const stat = await fs.promises.stat(lockPath);
    if (Date.now() - stat.mtimeMs < STALE_INDEX_LOCK_AGE_MS) return false;
    await fs.promises.unlink(lockPath);
    return true;
  } catch {
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function gitAddAll(repoPath: string, signal?: AbortSignal): Promise<void> {
  const result = await runGit(["add", "-A"], repoPath, signal);
  if (result.exitCode !== 0) {
    throw new GitServiceError(`git add failed: ${result.stderr.trim()}`);
  }
}

async function gitIsIgnored(repoPath: string, filepath: string): Promise<boolean> {
  // Donor gitAdd parity: check-ignore first so ignored files (.env.local)
  // skip silently instead of failing the sequence.
  const result = await runGit(["check-ignore", "-q", "--", filepath], repoPath);
  return result.exitCode === 0;
}

async function gitAdd(repoPath: string, filepath: string, signal?: AbortSignal): Promise<void> {
  if (filepath !== "." && (await gitIsIgnored(repoPath, filepath).catch(() => false))) return;
  const result = await runGit(["add", "--", filepath], repoPath, signal);
  if (result.exitCode !== 0) {
    throw new GitServiceError(`git add ${filepath} failed: ${result.stderr.trim()}`);
  }
}

async function gitCommit(repoPath: string, message: string, signal?: AbortSignal): Promise<string> {
  const result = await runGit(["commit", "-m", message], repoPath, signal);
  if (result.exitCode !== 0) {
    throw new GitServiceError(`git commit failed: ${result.stderr.trim()}`);
  }
  const hash = await runGit(["rev-parse", "HEAD"], repoPath, signal);
  return hash.stdout.trim();
}

async function hasStagedChanges(repoPath: string, signal?: AbortSignal): Promise<boolean> {
  const result = await runGit(["diff", "--cached", "--quiet"], repoPath, signal);
  // --quiet exits 1 when staged changes exist (not an error here).
  return result.exitCode !== 0;
}

/**
 * Intent-level facade over git plumbing. Keep methods limited to sequences
 * with more than one call site; one-off operations keep using gitTools.
 */
export class GitService {
  private async runSerialized<T>(repoPath: string, operation: () => Promise<T>): Promise<T> {
    const { default: path } = await import("node:path");
    const repositoryKey = path.resolve(repoPath);
    const previous = repositoryOperationTails.get(repositoryKey);
    const current = (previous ?? Promise.resolve()).catch(() => undefined).then(operation);
    repositoryOperationTails.set(repositoryKey, current);
    try {
      return await current;
    } finally {
      if (repositoryOperationTails.get(repositoryKey) === current) {
        repositoryOperationTails.delete(repositoryKey);
      }
    }
  }

  private async runIndexWrite<T>(repoPath: string, operation: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (!isGitIndexLockError(error)) throw error;
        // A lock left by a crashed process is safe to remove only after it
        // has been untouched long enough to be clearly stale.
        if (await removeStaleIndexLock(repoPath)) continue;
        const retryDelay = INDEX_LOCK_RETRY_DELAYS_MS[attempt];
        if (retryDelay === undefined) throw error;
        await delay(retryDelay);
      }
    }
  }

  /** Init a repo and create the initial commit. Returns the commit hash. */
  async initRepoWithInitialCommit({
    path: repoPath,
    message = "Initialize CAIDE app",
    ref = "main",
    signal,
  }: {
    path: string;
    message?: string;
    ref?: string;
    signal?: AbortSignal;
  }): Promise<string> {
    return this.runSerialized(repoPath, async () => {
      const init = await runGit(["init", "-b", ref], repoPath, signal);
      if (init.exitCode !== 0) {
        throw new GitServiceError(`git init failed: ${init.stderr.trim()}`);
      }
      await this.runIndexWrite(repoPath, () => gitAddAll(repoPath, signal));
      return this.runIndexWrite(repoPath, () => gitCommit(repoPath, message, signal));
    });
  }

  /** Stage all + commit. Returns the hash; throws when nothing to commit. */
  async stageAllAndCommit({
    path: repoPath,
    message,
    signal,
  }: {
    path: string;
    message: string;
    signal?: AbortSignal;
  }): Promise<string> {
    return this.runSerialized(repoPath, async () => {
      await this.runIndexWrite(repoPath, () => gitAddAll(repoPath, signal));
      return this.runIndexWrite(repoPath, () => gitCommit(repoPath, message, signal));
    });
  }

  /** Stage all + commit only when something staged. Null when clean. */
  async stageAllAndCommitIfChanged({
    path: repoPath,
    message,
    signal,
  }: {
    path: string;
    message: string;
    signal?: AbortSignal;
  }): Promise<string | null> {
    return this.runSerialized(repoPath, async () => {
      await this.runIndexWrite(repoPath, () => gitAddAll(repoPath, signal));
      if (!(await hasStagedChanges(repoPath, signal))) return null;
      return this.runIndexWrite(repoPath, () => gitCommit(repoPath, message, signal));
    });
  }

  /**
   * Stage one file + commit. Null when nothing staged (gitAdd skips
   * .gitignore'd files like .env.local — those saves must not fail).
   */
  async commitFile({
    path: repoPath,
    filepath,
    message,
    signal,
  }: {
    path: string;
    filepath: string;
    message: string;
    signal?: AbortSignal;
  }): Promise<string | null> {
    return this.runSerialized(repoPath, async () => {
      await this.runIndexWrite(repoPath, () => gitAdd(repoPath, filepath, signal));
      if (!(await hasStagedChanges(repoPath, signal))) return null;
      return this.runIndexWrite(repoPath, () => gitCommit(repoPath, message, signal));
    });
  }

  /** Stage a controlled file set + commit as one review action. */
  async commitFiles({
    path: repoPath,
    filepaths,
    message,
    signal,
  }: {
    path: string;
    filepaths: string[];
    message: string;
    signal?: AbortSignal;
  }): Promise<string | null> {
    const uniqueFilepaths = Array.from(new Set(filepaths));
    if (uniqueFilepaths.length === 0) return null;
    return this.runSerialized(repoPath, async () => {
      for (const filepath of uniqueFilepaths) {
        await this.runIndexWrite(repoPath, () => gitAdd(repoPath, filepath, signal));
      }
      if (!(await hasStagedChanges(repoPath, signal))) return null;
      return this.runIndexWrite(repoPath, () => gitCommit(repoPath, message, signal));
    });
  }
}

export const gitService = new GitService();
