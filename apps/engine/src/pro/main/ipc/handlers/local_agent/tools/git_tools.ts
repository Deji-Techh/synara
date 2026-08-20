import { z } from "zod";
import { spawn } from "node:child_process";
import { getGitUncommittedFilesWithStatus, gitCommit, gitAddAll } from "@/ipc/utils/git_utils";
import { buildTool, type AgentContext, escapeXmlAttr, escapeXmlContent } from "./types";

// ============================================================================
// git_status
// ============================================================================

const gitStatusSchema = z.object({});

export const gitStatusTool = buildTool({
  name: "git_status",
  description: `Show the current git working tree status.
Returns a list of modified, staged, deleted, and untracked files — similar to 'git status --short'.
Use this to understand what has changed before committing or to inspect the state of the repository.`,
  inputSchema: gitStatusSchema,
  defaultConsent: "always",
  isReadOnly: true,

  execute: async (_args, ctx: AgentContext) => {
    const files = await getGitUncommittedFilesWithStatus({ path: ctx.appPath });

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
  },
});

// ============================================================================
// git_diff
// ============================================================================

const gitDiffSchema = z.object({
  staged: z
    .boolean()
    .optional()
    .describe("If true, show staged (index) diff instead of working tree diff"),
  path: z.string().optional().describe("Limit diff to this relative file or directory path"),
});

const MAX_DIFF_CHARS = 20_000;

function runGitCommandSync(
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";

    const child = spawn("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ stdout, stderr, exitCode: code ?? 1 }));
    child.on("error", (err) => resolve({ stdout: "", stderr: err.message, exitCode: 1 }));
  });
}

export const gitDiffTool = buildTool({
  name: "git_diff",
  description: `Show the diff of the current working tree vs HEAD.
- By default shows unstaged changes (working tree vs index)
- Set staged: true to show staged changes (index vs HEAD)
- Set path to limit the diff to a specific file or directory
Useful for reviewing what you've changed before committing, or verifying that a search_replace had the intended effect.`,
  inputSchema: gitDiffSchema,
  defaultConsent: "always",
  isReadOnly: true,

  execute: async (args, ctx: AgentContext) => {
    const gitArgs = ["diff"];
    if (args.staged) gitArgs.push("--cached");
    if (args.path) gitArgs.push("--", args.path);

    const result = await runGitCommandSync(gitArgs, ctx.appPath);

    if (result.exitCode !== 0) {
      return `git diff failed (exit ${result.exitCode}):\n${result.stderr}`;
    }

    const diff = result.stdout;
    if (!diff.trim()) {
      return args.staged ? "No staged changes." : "No unstaged changes in working tree.";
    }

    if (diff.length > MAX_DIFF_CHARS) {
      return `...[diff truncated — showing last ${MAX_DIFF_CHARS} chars]\n${diff.slice(-MAX_DIFF_CHARS)}`;
    }

    return diff;
  },
});

// ============================================================================
// git_log
// ============================================================================

const gitLogSchema = z.object({
  limit: z
    .number()
    .min(1)
    .max(50)
    .optional()
    .default(10)
    .describe("Number of recent commits to show (default 10, max 50)"),
});

export const gitLogTool = buildTool({
  name: "git_log",
  description: `Show recent git commit history.
Returns a list of recent commits with hash, date, and message.
Useful for understanding the project history, finding a specific commit, or confirming that a commit was created.`,
  inputSchema: gitLogSchema,
  defaultConsent: "always",
  isReadOnly: true,

  execute: async (args, ctx: AgentContext) => {
    const result = await runGitCommandSync(
      ["log", `--max-count=${args.limit ?? 10}`, "--format=%h %ad %s", "--date=short"],
      ctx.appPath,
    );

    if (result.exitCode !== 0) {
      return `git log failed (exit ${result.exitCode}):\n${result.stderr}`;
    }

    return result.stdout.trim() || "No commits found.";
  },
});

// ============================================================================
// git_commit
// ============================================================================

const gitCommitSchema = z.object({
  message: z.string().min(1).describe("Commit message"),
  stage_all: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "Stage all modified/deleted/added files before committing (default true). Set to false to commit only already-staged files.",
    ),
});

export const gitCommitTool = buildTool({
  name: "git_commit",
  description: `Create a git commit with all current changes.
By default, stages all modified/deleted/added files (git add -A) then commits.
Use this after completing a meaningful unit of work to create a checkpoint.
Returns the commit hash of the new commit.`,
  inputSchema: gitCommitSchema,
  defaultConsent: "ask",
  modifiesState: true,

  getConsentPreview: (args) => `git commit -m "${args.message}"`,

  buildXml: (args, isComplete) => {
    if (!args.message) return undefined;
    return `<caide-status title="git commit: ${escapeXmlAttr(args.message)}">${isComplete ? "</caide-status>" : ""}`;
  },

  execute: async (args, ctx: AgentContext) => {
    if (args.stage_all !== false) {
      await gitAddAll({ path: ctx.appPath });
    }

    const hash = await gitCommit({
      path: ctx.appPath,
      message: args.message,
    });

    ctx.onXmlComplete(
      `<caide-status title="Committed: ${escapeXmlAttr(args.message)}" state="finished">\n${escapeXmlContent(`Commit: ${hash}\nMessage: ${args.message}`)}\n</caide-status>`,
    );

    return `Created commit ${hash}: ${args.message}`;
  },
});
