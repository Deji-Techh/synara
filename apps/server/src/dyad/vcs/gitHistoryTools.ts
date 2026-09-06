// FILE: gitHistoryTools.ts
// Purpose: Git history inspection + single-file restore for the agent
// (show_commit/show_file/restore_file). Donor schemas, descriptions, and
// consent levels kept verbatim; execution is git CLI via the shared runGit
// seam. dotenv values are never printed (donor redaction parity); restore
// writes the working tree only (index untouched) and rejects symlinks.
// Donor: dyad tools/git.ts (show/restore subset; Electron git_utils,
// file-lock, cloud-sync, and Supabase-deploy side effects not carried).

import * as fs from "node:fs";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { defineTool, type ToolDef } from "../../harness/tools/defineTool.ts";
import { safeJoinAppPath, UnsafePathError } from "../editing/safePath.ts";
import { GitToolError } from "./gitTools.ts";

const execFileAsync = promisify(execFile);

const MAX_OUTPUT_CHARS = 20_000;

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

function throwIfRepoError(stdout: string, stderr: string, exitCode: number, what: string): void {
  const combined = `${stdout}\n${stderr}`;
  if (/not a git repository|not a git repo/i.test(combined) || exitCode === 128) {
    throw new GitToolError("Not a git repository — run `git init` first or pick a project workspace");
  }
  if (exitCode !== 0) {
    throw new GitToolError(`${what} failed (exit ${exitCode}):\n${stderr || stdout}`);
  }
}

// --- donor schemas verbatim ---

const revisionSchema = z
  .string()
  .min(1)
  .max(256)
  .refine(
    (revision) =>
      !revision.startsWith("-") &&
      !revision.includes("..") &&
      !/[\0\r\n]/.test(revision),
    {
      message:
        "Git options, revision ranges, and control characters are not allowed",
    },
  )
  .describe(
    "A commit hash, branch, or tag; Git options and ranges are rejected",
  );

const pathSchema = z
  .string()
  .min(1)
  .max(4096)
  .describe("A literal path relative to the app root");

function normalizeGitFilterPath(filePath: string | undefined): string | undefined {
  return filePath === "." ? undefined : filePath;
}

/** dotenv values are never printed (donor redaction parity). */
function assertNotSensitive(relativePath: string): void {
  if (path.basename(relativePath).startsWith(".env")) {
    throw new GitToolError(
      `Refusing to display "${relativePath}": dotenv values are never printed. Inspect the file's tracked keys via git log instead.`,
    );
  }
}

function summarizeDiff(content: string): { files: number; additions: number; deletions: number } {
  let files = 0;
  let additions = 0;
  let deletions = 0;
  for (const line of content.split("\n")) {
    if (line.startsWith("diff --git ")) {
      files += 1;
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      additions += 1;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      deletions += 1;
    }
  }
  return { files, additions, deletions };
}

function countTextLines(content: string): number {
  const withoutTrailingNewline = content.replace(/\r?\n$/, "");
  return withoutTrailingNewline ? withoutTrailingNewline.split(/\r?\n/).length : 0;
}

function truncateOutput(content: string): string {
  if (content.length <= MAX_OUTPUT_CHARS) return content;
  return `...[output truncated — showing last ${MAX_OUTPUT_CHARS} chars]\n${content.slice(-MAX_OUTPUT_CHARS)}`;
}

// --- git_show_commit (donor schema + description verbatim) ---

const gitShowCommitSchema = z.object({
  revision: revisionSchema,
  path: pathSchema.optional(),
});

export const gitShowCommitTool = defineTool({
  name: "git_show_commit",
  description:
    "Show metadata and a bounded first-parent patch for one commit in the current app. Optionally limit the patch to one path. Sensitive dotenv and Dyad-managed patches are omitted.",
  schema: gitShowCommitSchema,
  readOnly: true,
  modifiesState: false,
  execute: async (args, ctx) =>
    executeGitShowCommit(gitShowCommitSchema.parse(args), ctx.appPath, ctx.signal),
  presentCall: (args: any) =>
    `Inspect commit ${args.revision}${args.path ? ` for ${args.path}` : ""}`,
});

export async function executeGitShowCommit(
  input: z.infer<typeof gitShowCommitSchema>,
  appPath: string,
  signal?: AbortSignal,
): Promise<string> {
  const parsed = gitShowCommitSchema.parse(input);
  const filePath = normalizeGitFilterPath(parsed.path);
  if (filePath) assertNotSensitive(filePath);
  const gitArgs = ["show", "--first-parent", "--format=fuller", "--no-ext-diff", parsed.revision];
  if (filePath) gitArgs.push("--", filePath);
  const result = await runGit(gitArgs, appPath, signal);
  throwIfRepoError(result.stdout, result.stderr, result.exitCode, "git show");
  const summary = summarizeDiff(result.stdout);
  const header = `commit ${parsed.revision} — ${summary.files} file(s), +${summary.additions}/-${summary.deletions}\n\n`;
  const content = result.stdout.trim() || "No matching commit content.";
  return header + truncateOutput(content);
}

// --- git_show_file (donor schema + description verbatim) ---

const gitShowFileSchema = z
  .object({
    revision: revisionSchema,
    path: pathSchema,
    start_line_one_indexed: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("One-indexed first line to return (inclusive)"),
    end_line_one_indexed_inclusive: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("One-indexed final line to return (inclusive)"),
  })
  .refine(
    (args) =>
      args.start_line_one_indexed == null ||
      args.end_line_one_indexed_inclusive == null ||
      args.start_line_one_indexed <= args.end_line_one_indexed_inclusive,
    {
      message:
        "start_line_one_indexed must be <= end_line_one_indexed_inclusive",
    },
  );

export const gitShowFileTool = defineTool({
  name: "git_show_file",
  description:
    "Read a UTF-8 file as it existed at a Git revision in the current app. Supports bounded line ranges and redacts dotenv values. Binary files cannot be displayed.",
  schema: gitShowFileSchema,
  readOnly: true,
  modifiesState: false,
  execute: async (args, ctx) =>
    executeGitShowFile(gitShowFileSchema.parse(args), ctx.appPath, ctx.signal),
  presentCall: (args: any) => `Read ${args.path} at ${args.revision}`,
});

export async function executeGitShowFile(
  input: z.infer<typeof gitShowFileSchema>,
  appPath: string,
  signal?: AbortSignal,
): Promise<string> {
  const parsed = gitShowFileSchema.parse(input);
  assertNotSensitive(parsed.path);
  const result = await runGit(["show", `${parsed.revision}:${parsed.path}`], appPath, signal);
  throwIfRepoError(result.stdout, result.stderr, result.exitCode, "git show");
  let lines = result.stdout.split("\n");
  // Drop the trailing empty element from a final newline for line math.
  if (lines.length > 0 && lines[lines.length - 1] === "") lines = lines.slice(0, -1);
  const total = lines.length;
  const start = parsed.start_line_one_indexed ?? 1;
  const end = parsed.end_line_one_indexed_inclusive ?? total;
  const slice = lines.slice(start - 1, end).join("\n");
  void countTextLines(result.stdout);
  const shown = `lines ${start}-${Math.min(end, total)} of ${total} from ${parsed.path}@${parsed.revision}\n\n`;
  return shown + truncateOutput(slice);
}

// --- git_restore_file (donor schema + description verbatim) ---

const gitRestoreFileSchema = z.object({
  revision: revisionSchema,
  path: pathSchema,
});

export const gitRestoreFileTool = defineTool({
  name: "git_restore_file",
  description:
    "Restore one regular file from a Git revision into the current app's working tree without changing the index. Existing working-tree content is overwritten; symlinks are rejected.",
  schema: gitRestoreFileSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) =>
    executeGitRestoreFile(gitRestoreFileSchema.parse(args), ctx.appPath, ctx.signal),
  presentCall: (args: any) => `Restore ${args.path} from ${args.revision} without staging it`,
});

export async function executeGitRestoreFile(
  input: z.infer<typeof gitRestoreFileSchema>,
  appPath: string,
  signal?: AbortSignal,
): Promise<string> {
  const parsed = gitRestoreFileSchema.parse(input);
  let fullPath: string;
  try {
    fullPath = safeJoinAppPath(appPath, parsed.path);
  } catch (e) {
    if (e instanceof UnsafePathError) {
      throw new GitToolError(`Refusing to restore "${parsed.path}": path escapes the workspace`);
    }
    throw e;
  }
  try {
    const existing = await fs.promises.lstat(fullPath);
    if (existing.isSymbolicLink()) {
      throw new GitToolError(`Refusing to restore "${parsed.path}": symlinks are rejected`);
    }
  } catch (e) {
    if (e instanceof GitToolError) throw e;
    if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") throw e;
    // Missing target is fine — restore creates it.
  }
  const result = await runGit(["show", `${parsed.revision}:${parsed.path}`], appPath, signal);
  throwIfRepoError(result.stdout, result.stderr, result.exitCode, "git show");
  await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.promises.writeFile(fullPath, result.stdout);
  return `Restored ${parsed.path} from ${parsed.revision} without changing the index.`;
}

export const ALL_GIT_HISTORY_TOOLS: ToolDef[] = [
  gitShowCommitTool,
  gitShowFileTool,
  gitRestoreFileTool,
];
