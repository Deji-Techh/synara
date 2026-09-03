// FILE: gitTools.ts
// Purpose: Git checkpoint tools for the agent (status/diff/log/commit).
// Donor: dyad x caide tools/git_tools.ts — schemas, descriptions, consent
// levels, and output shapes kept verbatim; git CLI invoked directly
// (spawn, no Electron git_utils wrapper). Consent gating happens at the loop
// layer via dyad/tools permissions (M3 wiring), not inside execute.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { defineTool, type ToolDef } from "../../harness/tools/defineTool.ts";

const execFileAsync = promisify(execFile);

export class GitToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitToolError";
  }
}

async function runGit(
  args: string[],
  cwd: string,
  signal?: AbortSignal,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      signal,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (e: any) {
    if (e?.code === "ENOENT") {
      throw new GitToolError("git binary not found on PATH");
    }
    return {
      stdout: e?.stdout ?? "",
      stderr: e?.stderr ?? e?.message ?? String(e),
      exitCode: typeof e?.code === "number" ? e.code : 1,
    };
  }
}

function ensureRepo(stdout: string, stderr: string, exitCode: number): void {
  if (/not a git repository|not a git repo/i.test(`${stdout}\n${stderr}`) || exitCode === 128) {
    if (/not a git repositor/i.test(`${stdout}\n${stderr}`)) {
      throw new GitToolError("Not a git repository — run `git init` first or pick a project workspace");
    }
  }
}

// --- git_status (donor schema + description verbatim) ---

const gitStatusSchema = z.object({});

export const gitStatusTool = defineTool({
  name: "git_status",
  description: `Show the current git working tree status.
Returns a list of modified, staged, deleted, and untracked files — similar to 'git status --short'.
Use this to understand what has changed before committing or to inspect the state of the repository.`,
  schema: gitStatusSchema,
  readOnly: true,
  modifiesState: false,
  execute: async (_, ctx) => executeGitStatus(ctx.appPath, ctx.signal),
  presentCall: () => "git status",
});

export async function executeGitStatus(appPath: string, signal?: AbortSignal): Promise<string> {
  const result = await runGit(["status", "--porcelain=v1", "-z"], appPath, signal);
  if (result.exitCode !== 0) {
    ensureRepo(result.stdout, result.stderr, result.exitCode);
    throw new GitToolError(`git status failed (exit ${result.exitCode}):\n${result.stderr}`);
  }
  const entries = result.stdout.split("\0").filter((e) => e.length > 0);
  const files: Array<{ status: string; path: string }> = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const code = entry.slice(0, 2);
    const filePath = entry.slice(3);
    // Rename order under -z is reversed: "R  <new>\0<old>\0" — the entry
    // itself already carries the new path, so just skip the old-path entry.
    if (code[0] === "R" && i + 1 < entries.length) {
      i++;
    }
    const xy = code.trim();
    const status =
      xy.includes("R") || code[0] === "R"
        ? "renamed"
        : xy.includes("A")
          ? "added"
          : xy.includes("D")
            ? "deleted"
            : xy.includes("M")
              ? "modified"
              : "untracked";
    files.push({ status, path: filePath });
  }

  if (files.length === 0) {
    return "Working tree clean — no uncommitted changes.";
  }

  const lines = files.map((f) => {
    const statusLabel =
      f.status === "added"
        ? "A "
        : f.status === "modified"
          ? "M "
          : f.status === "deleted"
            ? "D "
            : f.status === "renamed"
              ? "R "
              : "? ";
    return `${statusLabel} ${f.path}`;
  });

  return `${files.length} file(s) with uncommitted changes:\n\n${lines.join("\n")}`;
}

// --- git_diff (donor schema + description verbatim) ---

const gitDiffSchema = z.object({
  staged: z.boolean().optional().describe("If true, show staged (index) diff instead of working tree diff"),
  path: z.string().optional().describe("Limit diff to this relative file or directory path"),
});

const MAX_DIFF_CHARS = 20_000;

export const gitDiffTool = defineTool({
  name: "git_diff",
  description: `Show the diff of the current working tree vs HEAD.
- By default shows unstaged changes (working tree vs index)
- Set staged: true to show staged changes (index vs HEAD)
- Set path to limit the diff to a specific file or directory
Useful for reviewing what you've changed before committing, or verifying that a search_replace had the intended effect.`,
  schema: gitDiffSchema,
  readOnly: true,
  modifiesState: false,
  execute: async (args, ctx) => executeGitDiff(gitDiffSchema.parse(args), ctx.appPath, ctx.signal),
  presentCall: (args: any) => (args?.path ? `git diff ${args.path}` : "git diff"),
});

export async function executeGitDiff(
  input: z.infer<typeof gitDiffSchema>,
  appPath: string,
  signal?: AbortSignal,
): Promise<string> {
  const parsed = gitDiffSchema.parse(input);
  const gitArgs = ["diff"];
  if (parsed.staged) gitArgs.push("--cached");
  if (parsed.path) gitArgs.push("--", parsed.path);

  const result = await runGit(gitArgs, appPath, signal);

  if (result.exitCode !== 0) {
    ensureRepo(result.stdout, result.stderr, result.exitCode);
    return `git diff failed (exit ${result.exitCode}):\n${result.stderr}`;
  }

  const diff = result.stdout;
  if (!diff.trim()) {
    return parsed.staged ? "No staged changes." : "No unstaged changes in working tree.";
  }

  if (diff.length > MAX_DIFF_CHARS) {
    return `...[diff truncated — showing last ${MAX_DIFF_CHARS} chars]\n${diff.slice(-MAX_DIFF_CHARS)}`;
  }

  return diff;
}

// --- git_log (donor schema + description verbatim) ---

const gitLogSchema = z.object({
  limit: z.number().min(1).max(50).optional().default(10).describe("Number of recent commits to show (default 10, max 50)"),
});

export const gitLogTool = defineTool({
  name: "git_log",
  description: `Show recent git commit history.
Returns a list of recent commits with hash, date, and message.
Useful for understanding the project history, finding a specific commit, or confirming that a commit was created.`,
  schema: gitLogSchema,
  readOnly: true,
  modifiesState: false,
  execute: async (args, ctx) => executeGitLog(gitLogSchema.parse(args), ctx.appPath, ctx.signal),
  presentCall: () => "git log",
});

export async function executeGitLog(
  input: z.infer<typeof gitLogSchema>,
  appPath: string,
  signal?: AbortSignal,
): Promise<string> {
  const parsed = gitLogSchema.parse(input);
  const result = await runGit(
    ["log", `--max-count=${parsed.limit ?? 10}`, "--format=%h %ad %s", "--date=short"],
    appPath,
    signal,
  );

  if (result.exitCode !== 0) {
    ensureRepo(result.stdout, result.stderr, result.exitCode);
    return `git log failed (exit ${result.exitCode}):\n${result.stderr}`;
  }

  return result.stdout.trim() || "No commits found.";
}

// --- git_commit (donor schema + description verbatim) ---

const gitCommitSchema = z.object({
  message: z.string().min(1).describe("Commit message"),
  stage_all: z
    .boolean()
    .optional()
    .default(true)
    .describe("Stage all modified/deleted/added files before committing (default true). Set to false to commit only already-staged files."),
});

export const gitCommitTool = defineTool({
  name: "git_commit",
  description: `Create a git commit with all current changes.
By default, stages all modified/deleted/added files (git add -A) then commits.
Use this after completing a meaningful unit of work to create a checkpoint.
Returns the commit hash of the new commit.`,
  schema: gitCommitSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) => executeGitCommit(gitCommitSchema.parse(args), ctx.appPath, ctx.signal),
  presentCall: (args: any) => `git commit -m "${args.message}"`,
});

export async function executeGitCommit(
  input: z.infer<typeof gitCommitSchema>,
  appPath: string,
  signal?: AbortSignal,
): Promise<string> {
  const parsed = gitCommitSchema.parse(input);
  if (parsed.stage_all !== false) {
    const add = await runGit(["add", "-A"], appPath, signal);
    if (add.exitCode !== 0) {
      ensureRepo(add.stdout, add.stderr, add.exitCode);
      throw new GitToolError(`git add -A failed (exit ${add.exitCode}):\n${add.stderr}`);
    }
  }
  const commit = await runGit(["commit", "-m", parsed.message], appPath, signal);
  if (commit.exitCode !== 0) {
    const combined = `${commit.stdout}\n${commit.stderr}`;
    if (/nothing to commit/i.test(combined)) {
      throw new GitToolError("Nothing to commit — working tree clean");
    }
    ensureRepo(commit.stdout, commit.stderr, commit.exitCode);
    throw new GitToolError(`git commit failed (exit ${commit.exitCode}):\n${commit.stderr || commit.stdout}`);
  }
  const rev = await runGit(["rev-parse", "HEAD"], appPath, signal);
  const hash = rev.stdout.trim();
  return `Created commit ${hash}: ${parsed.message}`;
}

export const ALL_GIT_TOOLS: ToolDef[] = [gitStatusTool, gitDiffTool, gitLogTool, gitCommitTool];
