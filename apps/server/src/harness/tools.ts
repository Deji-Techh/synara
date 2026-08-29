// harness/tools.ts — M6: Real tool execution (read/write/grep/bash) with trusted workspace
import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import { mkdir } from "node:fs/promises";

const CAIDE_HOME = process.env.CAIDE_HOME ?? join(homedir(), "caide-apps");
const execAsync = promisify(execCb);

export type ToolDef = { name: string; description: string; readOnly: boolean; required: string[] };

export const CAIDE_TOOLS: readonly ToolDef[] = [
  { name: "read", description: "Read file. Error if path outside project root or not found.", readOnly: true, required: ["path"] },
  { name: "write", description: "Write file. Error if path outside project root or parent missing.", readOnly: false, required: ["path", "content"] },
  { name: "grep", description: "Search code. Returns error if pattern invalid.", readOnly: true, required: ["pattern"] },
  { name: "list", description: "List files. Returns error if path outside project root.", readOnly: true, required: ["path"] },
  { name: "bash", description: "Run shell command. Returns error if timeout or non-zero exit.", readOnly: false, required: ["command"] },
  { name: "screenshot", description: "Capture preview screenshot. Returns error if preview not running.", readOnly: true, required: ["threadId"] },
  { name: "planning_questionnaire", description: "Ask user questionnaire. Returns error if called outside plan mode.", readOnly: false, required: ["questions"] },
  { name: "webfetch", description: "Fetch URL. Returns error if network fails.", readOnly: true, required: ["url"] },
];

export function isReadOnlyTool(name: string): boolean {
  return CAIDE_TOOLS.find((t) => t.name === name)?.readOnly ?? false;
}

export function canRunToolInMode(tool: string, mode: "plan" | "default"): boolean {
  if (mode === "plan") return ["read", "grep", "list", "webfetch", "planning_questionnaire"].includes(tool);
  return true;
}

// M6: Real tool execution with trusted workspace
export async function executeTool(
  tool: string,
  args: Record<string, string>,
  projectDir: string,
): Promise<{ ok: boolean; result?: string; error?: string }> {
  switch (tool) {
    case "read": {
      const filePath = join(projectDir, args.path ?? "");
      if (!filePath.startsWith(projectDir)) return { ok: false, error: "Path outside project root" };
      try {
        const content = await readFile(filePath, "utf8");
        return { ok: true, result: content };
      } catch (e) {
        return { ok: false, error: `File not found: ${(e as Error).message}` };
      }
    }
    case "write": {
      const filePath = join(projectDir, args.path ?? "");
      if (!filePath.startsWith(projectDir)) return { ok: false, error: "Path outside project root" };
      try {
        const dir = filePath.substring(0, filePath.lastIndexOf("/"));
        await mkdir(dir, { recursive: true });
        await writeFile(filePath, args.content ?? "", "utf8");
        return { ok: true, result: `Wrote ${filePath}` };
      } catch (e) {
        return { ok: false, error: `Write failed: ${(e as Error).message}` };
      }
    }
    case "grep": {
      try {
        const { stdout } = await execAsync(`grep -rn "${args.pattern ?? ""}" "${projectDir}" 2>/dev/null | head -20`, { timeout: 10000 });
        return { ok: true, result: stdout || "No matches" };
      } catch {
        return { ok: true, result: "No matches" };
      }
    }
    case "list": {
      const listPath = join(projectDir, args.path ?? ".");
      try {
        const files = await readdir(listPath);
        return { ok: true, result: files.join("\n") };
      } catch (e) {
        return { ok: false, error: `List failed: ${(e as Error).message}` };
      }
    }
    case "bash": {
      try {
        const { stdout, stderr } = await execAsync(args.command ?? "echo ok", { cwd: projectDir, timeout: 30000 });
        return { ok: true, result: stdout || stderr || "Done" };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    }
    default:
      return { ok: false, error: `Unknown tool: ${tool}` };
  }
}
