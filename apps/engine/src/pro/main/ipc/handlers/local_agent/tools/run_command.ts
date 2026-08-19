import { z } from "zod";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import {
  buildTool,
  type AgentContext,
  escapeXmlAttr,
  escapeXmlContent,
} from "./types";
import { killProcessTree } from "@/ipc/utils/process_tree";
import { getSystemShell, getStandardShellEnv } from "@/ipc/utils/shell_utils";
import { globalProcessSemaphore } from "@/ipc/utils/process_semaphore";

// Shell patterns that are always blocked regardless of user consent
const BLOCKED_COMMAND_PATTERNS = [
  /rm\s+-[rRf]*f\s*\/(?:\s|$)/, // rm -rf / and variants
  /:\s*\(\s*\)\s*\{/, // fork bomb: :() { :|:& };:
  />\s*\/dev\/sd[a-z]/, // overwriting disk devices
  /mkfs\./,
  /dd\s+.*of=\/dev\/(?!null|zero|urandom)/,
  /sudo\s/,
  /curl\s+.*\|\s*(?:bash|sh|zsh|fish)/,
  /wget\s+.*-\s*\|\s*(?:bash|sh|zsh|fish)/,
];
const MAX_OUTPUT_CHARS = 1500;

export function appendCappedOutput(
  buf: string,
  chunk: string,
): { buf: string; truncated: boolean } {
  const next = buf + chunk;
  if (next.length > MAX_OUTPUT_CHARS) {
    return { buf: next.slice(-MAX_OUTPUT_CHARS), truncated: true };
  }
  return { buf: next, truncated: false };
}

const runCommandSchema = z.object({
  command: z
    .string()
    .describe(
      "The shell command to run. Examples: 'npm run test', 'npm run build', 'npx biome check src/', 'npm run lint'",
    ),
  timeout_seconds: z
    .number()
    .min(1)
    .max(300)
    .optional()
    .default(120)
    .describe(
      "Max seconds to wait before killing the command (default 120, max 300)",
    ),
  working_directory: z
    .string()
    .optional()
    .describe(
      "Subdirectory relative to the app root to run the command in. Omit to run in the app root.",
    ),
});

export const runCommandTool = buildTool({
  name: "run_command",
  description: `Run a shell command in the project directory and return its output.

Use this to:
- Run tests: 'npm run test', 'npx vitest run', 'npx jest'
- Build the app: 'npm run build'
- Run linters: 'npx biome check src/', 'npx eslint src/'
- Run type checks: 'npm run ts', 'npx tsc --noEmit'
- Run any package.json script: 'npm run <script>'

Rules:
- The command always runs with the app directory as the working directory
- NEVER use this for file edits — use write_file or search_replace instead  
- Returns stdout, stderr and exit code
- Times out after 120 seconds by default (configurable up to 300s)
- Certain dangerous commands (rm -rf /, sudo, etc.) are always blocked`,
  inputSchema: runCommandSchema,
  defaultConsent: "ask",
  modifiesState: true,

  getConsentPreview: (args) =>
    `$ ${args.command}` +
    (args.working_directory ? ` (in ./${args.working_directory})` : ""),

  buildXml: (args, isComplete) => {
    if (!args.command) return undefined;
    const cmd = escapeXmlAttr(args.command ?? "");
    return `<caide-status title="Running: ${cmd}">${isComplete ? "</caide-status>" : ""}`;
  },

  execute: async (args, ctx: AgentContext) => {
    // Check blocked patterns
    for (const pattern of BLOCKED_COMMAND_PATTERNS) {
      if (pattern.test(args.command)) {
        return `ERROR: Command blocked for safety reasons: \`${args.command}\`\nThis matches a dangerous command pattern. Use more specific commands instead.`;
      }
    }

    const cwd = args.working_directory
      ? path.join(ctx.appPath, args.working_directory)
      : ctx.appPath;

    if (!fs.existsSync(cwd)) {
      return `ERROR: Working directory does not exist: ${args.working_directory ?? cwd}`;
    }

    ctx.onXmlStream(
      `<caide-status title="Running: ${escapeXmlAttr(args.command)}"></caide-status>`,
    );

    const releaseSemaphore = await globalProcessSemaphore.acquire();

    try {
      return await new Promise<string>((resolve) => {
        let stdoutBuf = "";
        let stderrBuf = "";
        let stdoutTruncated = false;
        let stderrTruncated = false;
        let timedOut = false;
        let abortedBySignal = false;

        const sysShell = getSystemShell(args.command);
        const child = spawn(sysShell.command, sysShell.args, {
          cwd,
          env: getStandardShellEnv(),
          detached: process.platform !== "win32",
          stdio: ["ignore", "pipe", "pipe"],
        });

        const onAbort = () => {
          abortedBySignal = true;
          killProcessTree(child.pid, "SIGTERM");
          setTimeout(() => killProcessTree(child.pid, "SIGKILL"), 1000);
        };

        if (ctx.abortSignal) {
          if (ctx.abortSignal.aborted) {
            onAbort();
          } else {
            ctx.abortSignal.addEventListener("abort", onAbort, { once: true });
          }
        }

        const timeoutMs = (args.timeout_seconds ?? 120) * 1000;
        const timer = setTimeout(() => {
          timedOut = true;
          killProcessTree(child.pid, "SIGTERM");
          setTimeout(() => killProcessTree(child.pid, "SIGKILL"), 2000);
        }, timeoutMs);

        child.stdout.on("data", (d: Buffer) => {
          const res = appendCappedOutput(stdoutBuf, d.toString());
          stdoutBuf = res.buf;
          stdoutTruncated = stdoutTruncated || res.truncated;
        });
        child.stderr.on("data", (d: Buffer) => {
          const res = appendCappedOutput(stderrBuf, d.toString());
          stderrBuf = res.buf;
          stderrTruncated = stderrTruncated || res.truncated;
        });

        child.on("close", (code) => {
          clearTimeout(timer);
          if (ctx.abortSignal) {
            ctx.abortSignal.removeEventListener("abort", onAbort);
          }

          const parts: string[] = [];

          if (abortedBySignal) {
            parts.push(
              "[ABORTED — process group was terminated due to turn cancellation]",
            );
          } else if (timedOut) {
            parts.push(
              `[TIMED OUT after ${args.timeout_seconds ?? 120}s — process group was killed]`,
            );
          } else {
            parts.push(`Exit code: ${code}`);
          }

          const formatOutput = (buf: string, truncated: boolean) =>
            truncated
              ? `...[truncated, showing last ${MAX_OUTPUT_CHARS} chars]\n${buf}`
              : buf;

          if (stdoutBuf) {
            parts.push(
              `STDOUT${stdoutTruncated ? " (truncated)" : ""}:\n${formatOutput(stdoutBuf, stdoutTruncated)}`,
            );
          }
          if (stderrBuf) {
            parts.push(
              `STDERR${stderrTruncated ? " (truncated)" : ""}:\n${formatOutput(stderrBuf, stderrTruncated)}`,
            );
          }

          const result = parts.join("\n\n") || "(no output)";
          const status =
            code === 0 && !timedOut && !abortedBySignal
              ? "finished"
              : "aborted";

          ctx.onXmlComplete(
            `<caide-status title="$ ${escapeXmlAttr(args.command)}" state="${status}">\n${escapeXmlContent(result)}\n</caide-status>`,
          );

          resolve(result);
        });

        child.on("error", (err) => {
          clearTimeout(timer);
          if (ctx.abortSignal) {
            ctx.abortSignal.removeEventListener("abort", onAbort);
          }
          const result = `ERROR: Failed to start command: ${err.message}`;
          ctx.onXmlComplete(
            `<caide-status title="$ ${escapeXmlAttr(args.command)}" state="aborted">\n${escapeXmlContent(result)}\n</caide-status>`,
          );
          resolve(result);
        });
      });
    } finally {
      releaseSemaphore();
    }
  },
});
