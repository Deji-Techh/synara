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
    const EXCLUDED = new Set([".git", "build", ".dart_tool", "node_modules", ".idea", ".synara"]);
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

export const fileTools: readonly ToolDefinition<any>[] = [
  writeFileTool,
  readFileTool,
  listFilesTool,
];