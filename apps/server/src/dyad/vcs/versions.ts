// FILE: versions.ts
// Purpose: App version snapshots (commit/restore/list) for the Versions
// timeline. Snapshots are git commits plus an app-scoped metadata log
// (<app>/.caide/versions.jsonl); restore checks out paths from a snapshot
// without touching the index beyond the restored files. Donor pattern:
// version_handlers.ts commit/restore (Electron + drizzle versions table
// replaced by git + JSONL; retryOnLocked unneeded — no shared SQLite).
// Unwired UI: the right-dock timeline consumes listVersions/restoreVersion
// in a follow-up.

import * as fs from "node:fs";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { GitToolError } from "./gitTools.ts";

const execFileAsync = promisify(execFile);

export interface AppVersion {
  hash: string;
  message: string;
  createdAt: number;
  files: string[];
}

interface VersionLogEntry {
  hash: string;
  message: string;
  createdAt: number;
}

function versionsFile(appPath: string): string {
  return path.join(appPath, ".caide", "versions.jsonl");
}

async function git(cwd: string, args: string[], signal?: AbortSignal): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      signal,
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return stdout;
  } catch (e: any) {
    if (e?.code === "ENOENT") throw new GitToolError("git binary not found on PATH");
    const combined = `${e?.stdout ?? ""}\n${e?.stderr ?? ""}`;
    if (/not a git repository/i.test(combined)) {
      throw new GitToolError("Not a git repository — run `git init` first or pick a project workspace");
    }
    throw new GitToolError(`git ${args[0]} failed: ${(e?.stderr ?? e?.message ?? String(e)).trim()}`);
  }
}

function readVersionLog(appPath: string): VersionLogEntry[] {
  try {
    return fs
      .readFileSync(versionsFile(appPath), "utf-8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as VersionLogEntry)
      .filter((e) => typeof e?.hash === "string");
  } catch {
    return [];
  }
}

async function appendVersionLog(appPath: string, entry: VersionLogEntry): Promise<void> {
  await fs.promises.mkdir(path.join(appPath, ".caide"), { recursive: true });
  await fs.promises.appendFile(versionsFile(appPath), `${JSON.stringify(entry)}\n`);
}

/**
 * Snapshot the working tree as a version. Clean trees record the current
 * HEAD without a new commit. Returns the version entry.
 */
export async function createVersion(
  appPath: string,
  message: string,
  signal?: AbortSignal,
): Promise<AppVersion> {
  const status = (await git(appPath, ["status", "--porcelain=v1"], signal)).trim();
  let hash: string;
  let files: string[];
  if (!status) {
    hash = (await git(appPath, ["rev-parse", "HEAD"], signal)).trim();
    files = [];
  } else {
    await git(appPath, ["add", "-A"], signal);
    const fullMessage = message.trim() || "Checkpoint";
    await git(appPath, ["commit", "-m", fullMessage], signal);
    hash = (await git(appPath, ["rev-parse", "HEAD"], signal)).trim();
    // Porcelain v1 lines are `XY PATH` (rename: `XY ORIG -> PATH`), but some
    // gits collapse the Y column (`M a.txt`). Strip the longest status
    // prefix that fits rather than slicing a fixed width.
    files = status
      .split("\n")
      .map((l) => l.replace(/^..\s/, "").replace(/^.\s/, "").trim())
      .map((p) => (p.includes(" -> ") ? p.slice(p.indexOf(" -> ") + 4).trim() : p))
      .map((p) => p.replace(/^"|"$/g, ""))
      .filter(Boolean);
  }
  const entry: VersionLogEntry = { hash, message: message.trim() || "Checkpoint", createdAt: Date.now() };
  await appendVersionLog(appPath, entry);
  return { ...entry, files };
}

/** List versions newest-first (metadata log joined with git history). */
export async function listVersions(appPath: string, limit = 30, signal?: AbortSignal): Promise<AppVersion[]> {
  const log = readVersionLog(appPath);
  // Verify hashes still exist (history rewrites drop them).
  const existing = new Set<string>();
  try {
    const revs = (await git(appPath, ["rev-list", `HEAD`, `--max-count=${limit * 2}`], signal))
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    for (const r of revs) existing.add(r);
  } catch {
    return [];
  }
  return log
    .filter((e) => existing.has(e.hash))
    .slice(-limit)
    .reverse()
    .map((e) => ({ ...e, files: [] as string[] }));
}

/**
 * Restore working-tree files from a snapshot without committing. Dirty
 * uncommitted work is stashed first (stash entry named caide-restore-wip)
 * so nothing is lost. Returns a summary.
 */
export async function restoreVersion(
  appPath: string,
  hash: string,
  signal?: AbortSignal,
): Promise<string> {
  if (!/^[0-9a-f]{4,64}$/i.test(hash)) {
    throw new GitToolError(`Refusing to restore "${hash}": not a commit hash`);
  }
  try {
    await git(appPath, ["cat-file", "-e", `${hash}^{commit}`], signal);
  } catch {
    throw new GitToolError(`Unknown commit "${hash}" in this repository`);
  }
  const dirty = (await git(appPath, ["status", "--porcelain=v1"], signal)).trim();
  let stashed = false;
  if (dirty) {
    await git(appPath, ["stash", "push", "-m", "caide-restore-wip", "--include-untracked"], signal);
    stashed = true;
  }
  await git(appPath, ["checkout", hash, "--", "."], signal);
  return `Restored working tree from ${hash}.${stashed ? " Previous uncommitted work was stashed as caide-restore-wip." : ""} Review with git status/diff, then commit when satisfied.`;
}
