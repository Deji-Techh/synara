// FILE: preCommitTools.ts
// Purpose: run_pre_commit agent tool — stage the workspace and run the
// repo's configured pre-commit hook (husky script, lefthook, pre-commit
// binary, or package.json precommit script), bounded output, max 3 runs
// per turn. Donor description + consent + retry rules kept verbatim; the
// Electron pre-commit service (fingerprinting, coordinators, Supabase
// function tracking) is replaced by direct process execution.
// Donor: dyad tools/run_pre_commit.ts (subset).

import * as fs from "node:fs";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { defineTool, type ToolDef } from "../../harness/tools/defineTool.ts";

const execFileAsync = promisify(execFile);

export const MAX_PRE_COMMIT_RUNS_PER_TURN = 3;
const HOOK_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_CHARS = 12_000;

const runPreCommitSchema = z.object({});

/** Per-turn run counter (reset by the runner at turn start). */
const runCounts = new Map<string, number>();

export function resetPreCommitCount(sessionId: string): void {
  runCounts.delete(sessionId);
}

interface DetectedHook {
  kind: "husky" | "lefthook" | "pre-commit" | "npm-script";
  command: string;
  args: string[];
  scriptName?: string;
}

async function onPath(binary: string): Promise<boolean> {
  try {
    await execFileAsync(binary, ["--version"], { timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

async function detectHook(appPath: string): Promise<DetectedHook | null> {
  const huskyHook = path.join(appPath, ".husky", "pre-commit");
  try {
    const stat = await fs.promises.stat(huskyHook);
    if (stat.isFile()) {
      try {
        await fs.promises.access(huskyHook, fs.constants.X_OK);
        return { kind: "husky", command: huskyHook, args: [] };
      } catch {
        return { kind: "husky", command: "sh", args: [huskyHook] };
      }
    }
  } catch {
    // no husky hook — try the next provider
  }
  for (const name of ["lefthook.yml", "lefthook.yaml", ".lefthook.yml", ".lefthook.yaml"]) {
    try {
      await fs.promises.access(path.join(appPath, name));
      if (await onPath("lefthook")) {
        return { kind: "lefthook", command: "lefthook", args: ["run", "pre-commit"] };
      }
      break;
    } catch {
      // try next candidate
    }
  }
  try {
    await fs.promises.access(path.join(appPath, ".pre-commit-config.yaml"));
    if (await onPath("pre-commit")) {
      return { kind: "pre-commit", command: "pre-commit", args: ["run"] };
    }
  } catch {
    // no pre-commit config
  }
  try {
    const pkgRaw = await fs.promises.readFile(path.join(appPath, "package.json"), "utf-8");
    const scripts = (JSON.parse(pkgRaw) as { scripts?: Record<string, string> }).scripts ?? {};
    for (const scriptName of ["precommit", "pre-commit"]) {
      if (typeof scripts[scriptName] === "string") {
        return {
          kind: "npm-script",
          ...packageRunner(appPath),
          args: ["run", scriptName],
          scriptName,
        };
      }
    }
  } catch {
    // no package.json or unreadable
  }
  return null;
}

/**
 * Package runner for npm-script hooks: lockfile decides (bun/pnpm/yarn/
 * npm), defaulting to bun. Caide workspaces are bun-first, but scaffolded
 * website apps may carry other lockfiles.
 */
function packageRunner(appPath: string): { command: string } {
  const exists = (name: string): boolean => {
    try {
      fs.accessSync(path.join(appPath, name));
      return true;
    } catch {
      return false;
    }
  };
  if (exists("bun.lockb") || exists("bun.lock")) return { command: "bun" };
  if (exists("pnpm-lock.yaml")) return { command: "pnpm" };
  if (exists("yarn.lock")) return { command: "yarn" };
  return { command: "npm" };
}

function truncateOutput(content: string): string {
  if (content.length <= MAX_OUTPUT_CHARS) return content;
  return `...[output truncated — showing last ${MAX_OUTPUT_CHARS} chars]\n${content.slice(-MAX_OUTPUT_CHARS)}`;
}

export const runPreCommitTool = defineTool({
  name: "run_pre_commit",
  description: `Stage all current workspace changes and run the repository's configured pre-commit hook.

- Call this after finishing file edits, before ending the turn.
- If it fails, use the returned output to fix the files, then call it again.
- A retry is allowed only after files changed. Hook-generated changes count.
- Stop after ${MAX_PRE_COMMIT_RUNS_PER_TURN} runs in one turn and summarize any remaining failure.
- A passing run verifies the currently staged snapshot. If files change afterward, run it again.`,
  schema: runPreCommitSchema,
  readOnly: false,
  modifiesState: true,
  timeoutMs: HOOK_TIMEOUT_MS + 30_000,
  execute: async (_, ctx) => executeRunPreCommit(ctx.appPath, ctx.sessionId, ctx.signal),
  presentCall: () => "Stage all changes and run the pre-commit hook",
});

export async function executeRunPreCommit(
  appPath: string,
  sessionId: string,
  signal?: AbortSignal,
): Promise<string> {
  const runs = runCounts.get(sessionId) ?? 0;
  if (runs >= MAX_PRE_COMMIT_RUNS_PER_TURN) {
    return `Pre-commit run limit reached: the hook has already run ${MAX_PRE_COMMIT_RUNS_PER_TURN} times this turn. Do not run it again. Stop editing and summarize what still fails and what you tried.`;
  }

  const hook = await detectHook(appPath);
  if (!hook) {
    return "Pre-commit hook unavailable: no husky pre-commit script, lefthook config, pre-commit config, or package.json precommit script was found, so nothing was run.";
  }

  try {
    await execFileAsync("git", ["add", "-A"], { cwd: appPath, signal, timeout: 30_000 });
  } catch (e: any) {
    return `Pre-commit staging could not start: git add -A failed (${e?.message ?? String(e)}). The hook was not run.`;
  }

  runCounts.set(sessionId, runs + 1);
  try {
    const { stdout, stderr } = await execFileAsync(hook.command, hook.args, {
      cwd: appPath,
      signal,
      timeout: HOOK_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
    });
    const output = truncateOutput(`${stdout}\n${stderr}`.trim());
    return `Pre-commit hook passed (${hook.kind}${hook.scriptName ? `:${hook.scriptName}` : ""}).${output ? `\n\n${output}` : ""}`;
  } catch (e: any) {
    const output = truncateOutput(
      `${e?.stdout ?? ""}\n${e?.stderr ?? e?.message ?? String(e)}`.trim(),
    );
    return `Pre-commit hook FAILED (exit ${typeof e?.code === "number" ? e.code : "unknown"}). Fix the files using this output, then call run_pre_commit again (only after files changed).\n\n${output}`;
  }
}

export const ALL_PRE_COMMIT_TOOLS: ToolDef[] = [runPreCommitTool];
