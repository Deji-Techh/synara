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
  isFavorite?: boolean;
  note?: string;
}

interface VersionLogEntry {
  hash: string;
  message: string;
  createdAt: number;
  isFavorite?: boolean;
  note?: string;
}

function versionsFile(appPath: string): string {
  return path.join(appPath, ".caide", "versions.jsonl");
}

/**
 * Donor ensureDyadGitignored parity (gitignoreUtils.ts): the operational
 * `.caide/` dir is never committed — otherwise versions.jsonl (appended
 * after every checkpoint commit) permanently dirties the tree and breaks
 * the clean-tree guards on checkout/revert. Idempotent; creates
 * .gitignore when missing. Called by createVersion so imported projects
 * (not just fresh scaffolds) are covered.
 */
export async function ensureCaideGitignored(appPath: string): Promise<void> {
  const gitignorePath = path.join(appPath, ".gitignore");
  let content = "";
  try {
    content = await fs.promises.readFile(gitignorePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  const lines = content.split(/\r?\n/);
  const covered = lines.some((line) => line.trim() === ".caide/" || line.trim() === ".caide");
  if (covered) return;
  const suffix = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
  await fs.promises.writeFile(gitignorePath, `${content}${suffix}.caide/\n`, "utf-8");
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
      throw new GitToolError(
        "Not a git repository — run `git init` first or pick a project workspace",
      );
    }
    throw new GitToolError(
      `git ${args[0]} failed: ${(e?.stderr ?? e?.message ?? String(e)).trim()}`,
    );
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

export async function updateVersionMetadata(
  appPath: string,
  hash: string,
  updates: { isFavorite?: boolean; note?: string },
): Promise<void> {
  const log = readVersionLog(appPath);
  const entry = log.find((e) => e.hash === hash);
  if (!entry) throw new GitToolError(`Version ${hash} not found`);
  if (updates.isFavorite !== undefined) entry.isFavorite = updates.isFavorite;
  if (updates.note !== undefined) entry.note = updates.note;
  await fs.promises.mkdir(path.join(appPath, ".caide"), { recursive: true });
  await fs.promises.writeFile(
    versionsFile(appPath),
    log.map((e) => JSON.stringify(e)).join("\n") + "\n",
  );
}

export async function createVersion(
  appPath: string,
  message: string,
  signal?: AbortSignal,
): Promise<AppVersion> {
  // Operational dir stays out of git (donor parity) so the log append below
  // never dirties the tree it just snapshotted.
  await ensureCaideGitignored(appPath).catch(() => undefined);
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
    files = status
      .split("\n")
      .map((l) => l.replace(/^..\s/, "").replace(/^.\s/, "").trim())
      .map((p) => (p.includes(" -> ") ? p.slice(p.indexOf(" -> ") + 4).trim() : p))
      .map((p) => p.replace(/^"|"$/g, ""))
      .filter((p) => Boolean(p) && p !== ".caide/" && !p.startsWith(".caide/"));
  }
  const entry: VersionLogEntry = {
    hash,
    message: message.trim() || "Checkpoint",
    createdAt: Date.now(),
  };
  await appendVersionLog(appPath, entry);
  return { ...entry, files };
}

export async function listVersions(
  appPath: string,
  limit = 30,
  signal?: AbortSignal,
): Promise<AppVersion[]> {
  const log = readVersionLog(appPath);
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

export async function restoreVersion(
  appPath: string,
  hash: string,
  signal?: AbortSignal,
): Promise<string> {
  if (!/^[0-9a-f]{4,64}$/i.test(hash))
    throw new GitToolError(`Refusing to restore "${hash}": not a commit hash`);
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

export interface VersionChange {
  path: string;
  type: "added" | "modified" | "deleted";
  diff?: string;
}

export async function getVersionChanges(
  appPath: string,
  hash: string,
  signal?: AbortSignal,
): Promise<VersionChange[]> {
  if (!/^[0-9a-f]{4,64}$/i.test(hash)) throw new GitToolError(`Invalid hash: ${hash}`);
  const out: VersionChange[] = [];
  try {
    const nameStatus = await git(appPath, ["diff", "--name-status", `${hash}^`, hash], signal);
    const lines = nameStatus
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    // Concurrency limit of 10 for diff fetching
    const CONCURRENCY = 10;
    for (let i = 0; i < lines.length; i += CONCURRENCY) {
      const chunk = lines.slice(i, i + CONCURRENCY);
      await Promise.all(
        chunk.map(async (line) => {
          const parts = line.split(/\s+/);
          const status = parts[0] ?? "";
          const filePath = parts[parts.length - 1] ?? ""; // Handles renames mostly via last part
          if (!filePath) return;

          let type: VersionChange["type"] = "modified";
          if (status.startsWith("A")) type = "added";
          else if (status.startsWith("D")) type = "deleted";

          let diff = "";
          try {
            // 1MB + binary guard
            const diffOutput = await git(
              appPath,
              ["diff", `${hash}^`, hash, "--", filePath],
              signal,
            );
            if (diffOutput.length > 1024 * 1024) {
              diff = "<diff too large to display (exceeds 1MB)>";
            } else if (diffOutput.includes("Binary files")) {
              diff = "<binary file>";
            } else {
              diff = diffOutput;
            }
          } catch {
            diff = "<diff unavailable>";
          }

          out.push({ path: filePath, type, diff });
        }),
      );
    }
  } catch {
    // If it's the very first commit, diffing against hash^ fails
    const nameStatus = await git(
      appPath,
      ["show", "--name-status", "--format=", hash],
      signal,
    ).catch(() => "");
    const lines = nameStatus
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of lines) {
      const parts = line.split(/\s+/);
      const filePath = parts[parts.length - 1];
      if (filePath) out.push({ path: filePath, type: "added" });
    }
  }
  return out;
}

export async function checkoutVersion(
  appPath: string,
  hash: string,
  branchName: string,
  signal?: AbortSignal,
): Promise<string> {
  if (!/^[0-9a-f]{4,64}$/i.test(hash)) throw new GitToolError(`Invalid hash: ${hash}`);
  const dirty = (await git(appPath, ["status", "--porcelain=v1"], signal)).trim();
  if (dirty)
    throw new GitToolError(
      "Working tree is dirty. Please commit or stash changes before checking out a version branch.",
    );
  await git(appPath, ["checkout", "-b", branchName, hash], signal);
  // Note: Neon preview/dev switch hooks should be orchestrated by the caller when this succeeds.
  return `Checked out new branch ${branchName} at ${hash}`;
}

export async function revertVersion(
  appPath: string,
  hash: string,
  signal?: AbortSignal,
): Promise<string> {
  if (!/^[0-9a-f]{4,64}$/i.test(hash)) throw new GitToolError(`Invalid hash: ${hash}`);
  const dirty = (await git(appPath, ["status", "--porcelain=v1"], signal)).trim();
  if (dirty)
    throw new GitToolError(
      "Working tree is dirty. Please commit or stash changes before reverting.",
    );

  await git(appPath, ["revert", "--no-edit", hash], signal);
  // Note: message prune, Neon point-in-time restore, and Supabase redeploy
  // should be orchestrated by the backend service coordinating the revert.
  return `Reverted commit ${hash}`;
}
