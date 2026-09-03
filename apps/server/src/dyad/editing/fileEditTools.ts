// FILE: fileEditTools.ts
// Purpose: File-editing agent tools on the Caide defineTool DSL.
// Donor: dyad x caide tools/{search_replace,multi_replace,copy_file,
// delete_file,rename_file}.ts — schemas, descriptions, and consent-preview
// strings kept verbatim; Electron/supabase/telemetry/lock wrappers deferred
// to M4 (noted per tool). Consent gating happens at the loop layer via
// dyad/tools permissions (M3 wiring), not inside execute.

import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { defineTool, type ToolDef } from "../../harness/tools/defineTool.ts";
import { applySearchReplace } from "./searchReplaceProcessor.ts";
import { escapeSearchReplaceMarkers } from "./markers.ts";
import { safeJoinAppPath } from "./safePath.ts";

export class FileEditValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileEditValidationError";
  }
}

// --- search_replace (donor schema + description verbatim) ---

const searchReplaceSchema = z.object({
  file_path: z
    .string()
    .describe("The path to the file you want to search and replace in."),
  old_string: z
    .string()
    .describe(
      "The text block to replace. Matching is line-based: each line in old_string must match a whole line in the file, not just a substring within a line. To edit part of a line, include the entire original line in old_string and the entire edited line in new_string. The block must be unique within the file.",
    ),
  new_string: z
    .string()
    .describe(
      "The edited text to replace the old_string (must be different from the old_string)",
    ),
});

export const searchReplaceTool = defineTool({
  name: "search_replace",
  description: `Use this tool to propose a search and replace operation on an existing file.

The tool will replace ONE occurrence of old_string with new_string in the specified file. Matching is line-based: old_string must match whole file lines, not a partial fragment within a line. To edit part of a line, include the entire original line in old_string and the entire edited line in new_string.

CRITICAL REQUIREMENTS FOR USING THIS TOOL:

1. UNIQUENESS: The old_string MUST uniquely identify the specific instance you want to change. This means:
   - Include AT LEAST 3-5 lines of context BEFORE the change point
   - Include AT LEAST 3-5 lines of context AFTER the change point
   - Include all whitespace, indentation, and surrounding code exactly as it appears in the file
   - Do NOT use only a partial fragment of a line. Include the full line containing the change.

2. SINGLE INSTANCE: This tool can only change ONE instance at a time. If you need to change multiple instances:
   - Make separate calls to this tool for each instance
   - Each call must uniquely identify its specific instance using extensive context

3. VERIFICATION: Before using this tool:
   - Re-read the target file immediately before editing; do not reuse content from an earlier turn after another tool may have changed it
   - If multiple instances exist, gather enough context to uniquely identify each one
   - Plan separate tool calls for each instance
   - If a search block does not match, re-read the file and retry once with the current exact lines
   - After repeated mismatch failures, use write_file only when replacing the complete file is safe
`,
  schema: searchReplaceSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) => executeSearchReplace(args, ctx.appPath),
  presentCall: (args: any) => `Edit ${args.file_path}`,
});

/** Context-bound execution (ToolContext carries appPath/signal). */
export async function executeSearchReplace(
  input: z.infer<typeof searchReplaceSchema>,
  appPath: string,
): Promise<string> {
  const parsed = searchReplaceSchema.parse(input);
  if (parsed.old_string === parsed.new_string) {
    throw new FileEditValidationError("old_string and new_string must be different");
  }
  const fullPath = safeJoinAppPath(appPath, parsed.file_path);
  if (!fs.existsSync(fullPath)) {
    throw new FileEditValidationError(`File does not exist: ${parsed.file_path}`);
  }
  const original = await fs.promises.readFile(fullPath, "utf8");
  const operations = `<<<<<<< SEARCH\n${escapeSearchReplaceMarkers(parsed.old_string)}\n=======\n${escapeSearchReplaceMarkers(parsed.new_string)}\n>>>>>>> REPLACE`;
  const result = applySearchReplace(original, operations);
  if (!result.success || typeof result.content !== "string") {
    const failure = result.error ?? "unknown";
    throw new FileEditValidationError(
      [
        `Failed to apply search-replace: ${failure}`,
        "",
        `Recovery: re-read ${parsed.file_path} now, copy the current full lines with exact whitespace, and retry once.`,
        "Do not reuse an old search block after another tool has edited the file.",
      ].join("\n"),
    );
  }
  await fs.promises.writeFile(fullPath, result.content);
  return `Successfully applied edits to ${parsed.file_path}`;
}

// --- multi_replace (donor schema + description verbatim) ---

const replacementChunkSchema = z.object({
  startLine: z.number().describe("The starting line number (1-indexed) of the chunk to replace."),
  endLine: z.number().describe("The ending line number (1-indexed) of the chunk to replace."),
  replacementContent: z.string().describe("The content to replace the target chunk with."),
});

const multiReplaceSchema = z.object({
  file_path: z.string().describe("The path to the file you want to search and replace in."),
  chunks: z
    .array(replacementChunkSchema)
    .min(1)
    .describe("A list of chunks to replace in the file. Start and end lines are 1-indexed and inclusive."),
});

export const multiReplaceTool = defineTool({
  name: "multi_replace",
  description: `Use this tool to propose multiple, targeted line-based edits to an existing file.

This tool is significantly more token-efficient than rewriting the entire file or using block-based search/replace.
You provide an array of chunks, specifying the startLine and endLine (1-indexed, inclusive) and the replacementContent.

CRITICAL REQUIREMENTS:
1. Ensure the startLine and endLine exactly match the lines you want to replace.
2. The chunks must be ordered from top to bottom (ascending line numbers).
3. Chunks must NOT overlap.
4. To insert code at a specific line without removing anything, set both startLine and endLine to the line AFTER the insertion point, and include the existing line at the end of your replacementContent. Or just replace the single line with the new content + the old line.
`,
  schema: multiReplaceSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) => executeMultiReplace(args, ctx.appPath),
  presentCall: (args: any) => `Edit ${args.file_path} (${args.chunks?.length ?? 0} chunks)`,
});

export async function executeMultiReplace(
  input: z.infer<typeof multiReplaceSchema>,
  appPath: string,
): Promise<string> {
  const parsed = multiReplaceSchema.parse(input);
  const fullPath = safeJoinAppPath(appPath, parsed.file_path);
  if (!fs.existsSync(fullPath)) {
    throw new FileEditValidationError(`File does not exist: ${parsed.file_path}`);
  }
  const chunks = [...parsed.chunks].sort((a, b) => a.startLine - b.startLine);
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    if (!Number.isInteger(c.startLine) || !Number.isInteger(c.endLine) || c.startLine < 1 || c.endLine < c.startLine) {
      throw new FileEditValidationError(
        `Invalid chunk ${i + 1}: startLine/endLine must be 1-indexed with startLine <= endLine`,
      );
    }
    if (i > 0 && c.startLine <= chunks[i - 1].endLine) {
      throw new FileEditValidationError(
        `Chunks must be ordered top-to-bottom without overlap (chunk ${i + 1} overlaps chunk ${i})`,
      );
    }
  }
  const original = await fs.promises.readFile(fullPath, "utf8");
  const lineEnding = original.includes("\r\n") ? "\r\n" : "\n";
  const lines = original.split(/\r?\n/);
  const total = lines.length;
  for (const c of chunks) {
    if (c.endLine > total) {
      throw new FileEditValidationError(
        `Chunk [${c.startLine}-${c.endLine}] exceeds file length (${total} lines) — re-read ${parsed.file_path} and retry`,
      );
    }
  }
  // Apply bottom-up so earlier line numbers stay valid.
  for (let i = chunks.length - 1; i >= 0; i--) {
    const c = chunks[i];
    lines.splice(c.startLine - 1, c.endLine - c.startLine + 1, ...c.replacementContent.split("\n"));
  }
  await fs.promises.writeFile(fullPath, lines.join(lineEnding));
  return `Successfully applied ${chunks.length} edit(s) to ${parsed.file_path}`;
}

// --- copy_file (donor schema + description verbatim) ---

const copyFileSchema = z.object({
  from: z
    .string()
    .describe("The source file or folder path (an absolute path inside the workspace, a ~ path, or a path relative to the app root)"),
  to: z.string().describe("The destination file or directory path relative to the app root"),
  description: z.string().optional().describe("Brief description of why the file or folder is being copied"),
});

export const copyFileTool = defineTool({
  name: "copy_file",
  description:
    "Copy a file or directory from any workspace location into the project codebase. Both paths must resolve inside the app root (absolute-inside, ~, or app-relative).",
  schema: copyFileSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) => executeCopyFile(args, ctx.appPath),
  presentCall: (args: any) => `Copy ${args.from} to ${args.to}`,
});

export async function executeCopyFile(
  input: z.infer<typeof copyFileSchema>,
  appPath: string,
): Promise<string> {
  const parsed = copyFileSchema.parse(input);
  const src = safeJoinAppPath(appPath, parsed.from);
  if (!fs.existsSync(src)) {
    throw new FileEditValidationError(`Copy source does not exist: ${parsed.from}`);
  }
  let dest = safeJoinAppPath(appPath, parsed.to);
  const destStat = fs.existsSync(dest) ? fs.statSync(dest) : null;
  if (destStat?.isDirectory()) {
    dest = path.join(dest, path.basename(src));
  }
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  await fs.promises.cp(src, dest, { recursive: true });
  return `Copied ${parsed.from} to ${path.relative(appPath, dest)}`;
}

// --- delete_file (donor schema + description verbatim) ---

const deleteFileSchema = z.object({
  path: z
    .string()
    .refine((value) => value.trim().length > 0, { message: "Path cannot be empty" })
    .describe("The file path to delete"),
});

export const deleteFileTool = defineTool({
  name: "delete_file",
  description: "Delete a file from the codebase",
  schema: deleteFileSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) => executeDeleteFile(args, ctx.appPath),
  presentCall: (args: any) => `Delete ${args.path}`,
});

export async function executeDeleteFile(
  input: z.infer<typeof deleteFileSchema>,
  appPath: string,
): Promise<string> {
  const parsed = deleteFileSchema.parse(input);
  const fullPath = safeJoinAppPath(appPath, parsed.path);
  if (!fs.existsSync(fullPath)) {
    throw new FileEditValidationError(`File does not exist: ${parsed.path}`);
  }
  const stat = fs.statSync(fullPath);
  if (!stat.isFile()) {
    throw new FileEditValidationError(`Not a file (refusing to delete directory): ${parsed.path}`);
  }
  await fs.promises.unlink(fullPath);
  return `Deleted ${parsed.path}`;
}

// --- rename_file (donor schema + description verbatim) ---

const renameFileSchema = z.object({
  from: z.string().describe("The current file path"),
  to: z.string().describe("The new file path"),
});

export const renameFileTool = defineTool({
  name: "rename_file",
  description: "Rename or move a file in the codebase",
  schema: renameFileSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) => executeRenameFile(args, ctx.appPath),
  presentCall: (args: any) => `Rename ${args.from} to ${args.to}`,
});

export async function executeRenameFile(
  input: z.infer<typeof renameFileSchema>,
  appPath: string,
): Promise<string> {
  const parsed = renameFileSchema.parse(input);
  const src = safeJoinAppPath(appPath, parsed.from);
  const dest = safeJoinAppPath(appPath, parsed.to);
  if (!fs.existsSync(src)) {
    throw new FileEditValidationError(`File does not exist: ${parsed.from}`);
  }
  if (fs.existsSync(dest)) {
    throw new FileEditValidationError(`Destination already exists: ${parsed.to}`);
  }
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  await fs.promises.rename(src, dest);
  return `Renamed ${parsed.from} to ${parsed.to}`;
}

export const ALL_FILE_EDIT_TOOLS: ToolDef[] = [
  searchReplaceTool,
  multiReplaceTool,
  copyFileTool,
  deleteFileTool,
  renameFileTool,
];
