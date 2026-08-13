// FILE: src/agent/tools/fileTools.ts
// Purpose: File-system tools for the engine agent loop. All paths resolve
// against the workspace root (no traversal outside it). These are the engine's
// replacement for Caide's dyad-write/dyad-read tags: structured tool calls
// instead of markdown-tag parsing.
// Layer: Engine agent tools

import fs from "node:fs";
import path from "node:path";

import { z } from "zod";

import { defineTool, type ToolContext, type ToolDefinition } from "../tool.ts";

function resolveInsideWorkspace(relativePath: string, context: ToolContext): string {
  const abs = path.resolve(context.workspaceDir, relativePath);
  if (!abs.startsWith(path.resolve(context.workspaceDir) + path.sep)) {
    throw new Error(`path escapes workspace: ${relativePath}`);
  }
  return abs;
}

export const writeFileTool = defineTool({
  name: "write_file",
  description:
    "Write (create or overwrite) a file in the workspace. Creates parent " +
    "directories as needed. Relative to the workspace root; absolute paths " +
    "outside the workspace are rejected.",
  parameters: z.object({
    path: z.string().describe("Path relative to the workspace root, e.g. lib/main.dart"),
    content: z.string().describe("Full file content to write"),
  }),
  execute(args, context) {
    const filePath = resolveInsideWorkspace(args.path, context);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, args.content, "utf8");
    return `Wrote ${args.path} (${args.content.length} bytes)`;
  },
});

export const readFileTool = defineTool({
  name: "read_file",
  description: "Read a file from the workspace and return its content.",
  parameters: z.object({
    path: z.string().describe("Path relative to the workspace root"),
  }),
  execute(args, context) {
    const filePath = resolveInsideWorkspace(args.path, context);
    if (!fs.existsSync(filePath)) {
      throw new Error(`file not found: ${args.path}`);
    }
    return fs.readFileSync(filePath, "utf8");
  },
});

export const listFilesTool = defineTool({
  name: "list_files",
  description:
    "List files in the workspace (optionally under a directory), excluding " +
    "git metadata, build artifacts, and dependencies.",
  parameters: z.object({
    path: z
      .string()
      .optional()
      .describe("Directory to list, relative to the workspace root; defaults to root"),
  }),
  execute(args, context) {
    const dir = args.path ? resolveInsideWorkspace(args.path, context) : context.workspaceDir;
    if (!fs.existsSync(dir)) {
      throw new Error(`directory not found: ${args.path ?? "."}`);
    }
    const EXCLUDED = new Set([".git", "build", ".dart_tool", "node_modules", ".idea", ".caide"]);
    const files: string[] = [];
    const walk = (current: string, rel: string) => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        if (EXCLUDED.has(entry.name)) {
          continue;
        }
        const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
        if (entry.isDirectory()) {
          walk(path.join(current, entry.name), childRel);
        } else {
          files.push(childRel);
        }
      }
    };
    walk(dir, args.path ?? "");
    return files.length === 0 ? "(empty)" : files.sort().join("\n");
  },
});

export const editFileTool = defineTool({
  name: "edit_file",
  description:
    "Edit an existing file by replacing a unique exact target string with replacement text. " +
    "Target must match character-for-character including whitespace and indentation.",
  parameters: z.object({
    path: z.string().describe("Path relative to the workspace root"),
    target: z.string().describe("Exact string to replace within the file"),
    replacement: z.string().describe("Replacement string to substitute"),
    multiple: z
      .boolean()
      .optional()
      .describe("If true, replace all occurrences. Defaults to false (must be unique)."),
  }),
  execute(args, context) {
    const filePath = resolveInsideWorkspace(args.path, context);
    if (!fs.existsSync(filePath)) {
      throw new Error(`file not found: ${args.path}`);
    }
    const content = fs.readFileSync(filePath, "utf8");
    if (!content.includes(args.target)) {
      throw new Error(
        `target string not found in ${args.path}. Ensure exact character match including whitespace.`,
      );
    }
    if (!args.multiple) {
      const firstIndex = content.indexOf(args.target);
      const secondIndex = content.indexOf(args.target, firstIndex + 1);
      if (secondIndex !== -1) {
        throw new Error(
          `target string occurs multiple times in ${args.path}. Provide more surrounding lines for uniqueness, or pass multiple: true.`,
        );
      }
      const updated =
        content.slice(0, firstIndex) +
        args.replacement +
        content.slice(firstIndex + args.target.length);
      fs.writeFileSync(filePath, updated, "utf8");
      return `Edited ${args.path} (1 occurrence replaced)`;
    } else {
      const parts = content.split(args.target);
      const occurrences = parts.length - 1;
      const updated = parts.join(args.replacement);
      fs.writeFileSync(filePath, updated, "utf8");
      return `Edited ${args.path} (${occurrences} occurrences replaced)`;
    }
  },
});

export const deleteFileTool = defineTool({
  name: "delete_file",
  description: "Delete a file from the workspace.",
  parameters: z.object({
    path: z.string().describe("Path relative to the workspace root"),
  }),
  execute(args, context) {
    const filePath = resolveInsideWorkspace(args.path, context);
    if (!fs.existsSync(filePath)) {
      throw new Error(`file not found: ${args.path}`);
    }
    fs.unlinkSync(filePath);
    return `Deleted ${args.path}`;
  },
});

export const searchCodeTool = defineTool({
  name: "search_code",
  description:
    "Search for exact text or regex across workspace files. Returns matching lines with file paths and line numbers.",
  parameters: z.object({
    query: z.string().describe("Text or regex pattern to search for"),
    path: z
      .string()
      .optional()
      .describe("Subdirectory to search inside (defaults to workspace root)"),
    isRegex: z
      .boolean()
      .optional()
      .describe("Whether query is a regex pattern (defaults to false)"),
  }),
  execute(args, context) {
    const dir = args.path ? resolveInsideWorkspace(args.path, context) : context.workspaceDir;
    if (!fs.existsSync(dir)) {
      throw new Error(`directory not found: ${args.path ?? "."}`);
    }
    const EXCLUDED = new Set([".git", "build", ".dart_tool", "node_modules", ".idea", ".caide"]);
    const regex = args.isRegex ? new RegExp(args.query, "i") : null;
    const queryLower = args.query.toLowerCase();
    const matches: string[] = [];
    const MAX_MATCHES = 100;

    const walk = (current: string, rel: string) => {
      if (matches.length >= MAX_MATCHES) return;
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        if (matches.length >= MAX_MATCHES) return;
        if (EXCLUDED.has(entry.name)) continue;
        const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
        const childPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          walk(childPath, childRel);
        } else {
          try {
            const content = fs.readFileSync(childPath, "utf8");
            const lines = content.split(/\r?\n/);
            for (let i = 0; i < lines.length; i++) {
              if (matches.length >= MAX_MATCHES) break;
              const line = lines[i]!;
              const matched = regex ? regex.test(line) : line.toLowerCase().includes(queryLower);
              if (matched) {
                matches.push(`${childRel}:${i + 1}: ${line.trim()}`);
              }
            }
          } catch {
            // Skip binary / non-utf8 files
          }
        }
      }
    };

    walk(dir, args.path ?? "");
    if (matches.length === 0) return "No matches found.";
    const result = matches.join("\n");
    return matches.length >= MAX_MATCHES
      ? `${result}\n(Results capped at ${MAX_MATCHES} matches)`
      : result;
  },
});

export const fileTools: readonly ToolDefinition<any>[] = [
  writeFileTool,
  readFileTool,
  editFileTool,
  deleteFileTool,
  listFilesTool,
  searchCodeTool,
];
