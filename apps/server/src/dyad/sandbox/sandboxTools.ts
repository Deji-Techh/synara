// FILE: sandboxTools.ts
// Purpose: execute_sandbox_script (vm runner + read-only FS hosts),
// execute_fork_skill (deferred skill sub-agent via injected runner), and the
// task/subagent status readers. Donor schemas/descriptions/consent verbatim;
// Electron/worker-thread/MCP-host/AI-SDK replaced as noted per tool.
// Donor: dyad x caide tools/{execute_sandbox_script,execute_fork_skill,
// task_manager(check),team_manager(check)}.ts.

import { z } from "zod";
import { defineTool, type ToolDef } from "../../harness/tools/defineTool.ts";
import { COMPANION_SKILL_FRONTMATTERS, WEB3_SKILL_FRONTMATTERS } from "../prompts/skillPacks.ts";
import { clampSandboxTimeoutMs, SANDBOX_SCRIPT_SOURCE_LIMIT_BYTES } from "./limits.ts";
import { formatSubagentStatus, formatTaskStatus } from "./taskRegistry.ts";
import { createFsHosts, runInVm } from "./vmRunner.ts";

export class SandboxValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxValidationError";
  }
}

/** Tool-result budget (matches run_command-style truncation). */
const MAX_RESULT_CHARS = 20_000;

// --- execute_sandbox_script (donor schema verbatim) ---

const executeSandboxScriptSchema = z.object({
  script: z
    .string()
    .max(SANDBOX_SCRIPT_SOURCE_LIMIT_BYTES)
    .describe("Sandboxed JavaScript subset source code to execute."),
  description: z.string().max(160).optional().describe("One-line human-readable summary of what the script does."),
  execution_thread: z
    .enum(["main", "worker"])
    .optional()
    .default("main")
    .describe(
      "Where to run the script. Default 'main' runs in-process. " +
        "Use 'worker' for compute-heavy work (parsing multi-MB attachments, " +
        "large aggregations, anything that might take more than a few hundred " +
        "milliseconds) so chat streaming and other main-process work isn't " +
        "stalled. MCP host functions are NOT available on the worker thread.",
    ),
});

const SANDBOX_BASE_DESCRIPTION = `Execute a sandboxed JavaScript snippet with read-only workspace hosts (read_file, list_files, grep).

- The script has no ambient authority: no require/process/fetch/globals. It can only act through the host functions.
- Assign the outcome to \`result\`; use console.log for progress lines.
- Main-thread execution with a 60s timeout. The 'worker' thread and MCP host functions land in M4 — scripts requesting them run on main and say so.
- The write_file host is capability-gated (donor blueprint rule) and lands with M3 consent wiring; scripts cannot write files yet.`;

export const executeSandboxScriptTool = defineTool({
  name: "execute_sandbox_script",
  description: SANDBOX_BASE_DESCRIPTION,
  schema: executeSandboxScriptSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) =>
    executeSandboxScript(executeSandboxScriptSchema.parse(args), ctx.appPath, ctx.signal),
  presentCall: (args: any) => args.description ?? "Run sandbox script",
});

export async function executeSandboxScript(
  input: z.infer<typeof executeSandboxScriptSchema>,
  appPath: string,
  signal?: AbortSignal,
): Promise<string> {
  const parsed = executeSandboxScriptSchema.parse(input);
  if (signal?.aborted) throw new SandboxValidationError("Operation aborted");
  const hosts = createFsHosts(appPath);
  const started = Date.now();
  const { result, logs } = await runInVm(
    parsed.script,
    {
      read_file: hosts.read_file,
      list_files: hosts.list_files,
      grep: hosts.grep,
    },
    clampSandboxTimeoutMs(undefined),
  );
  const executionMs = Date.now() - started;
  const body = [
    ...logs,
    `result: ${typeof result === "string" ? result : JSON.stringify(result)}`,
  ].join("\n");
  const truncated = body.length > MAX_RESULT_CHARS;
  const threadNote =
    parsed.execution_thread === "worker"
      ? " (worker thread lands in M4; ran on main)"
      : "";
  const output = truncated ? body.slice(-MAX_RESULT_CHARS) : body;
  return [
    `Sandbox script finished in ${executionMs}ms${threadNote}.`,
    truncated ? `Output truncated to last ${MAX_RESULT_CHARS} chars.` : null,
    "--- OUTPUT ---",
    output || "(empty)",
  ]
    .filter(Boolean)
    .join("\n");
}

// --- execute_fork_skill (donor schema + skill registry verbatim) ---

const FORK_SKILL_REGISTRY: Record<string, { description: string }> = {};
for (const [id, fm] of Object.entries(COMPANION_SKILL_FRONTMATTERS)) {
  FORK_SKILL_REGISTRY[id] = { description: fm.description ?? "" };
}
for (const [id, fm] of Object.entries(WEB3_SKILL_FRONTMATTERS)) {
  FORK_SKILL_REGISTRY[id] = { description: fm.description ?? "" };
}

const knownSkillIds = Object.keys(FORK_SKILL_REGISTRY).join(", ");

const executeForkSkillSchema = z.object({
  skill_id: z.string().describe(`The skill identifier. Known skills: ${knownSkillIds}`),
  task: z.string().describe("The specific task to delegate to this skill sub-agent"),
  context: z.string().optional().describe("Optional file paths or data for the sub-agent to work with"),
});

export type SkillRunner = (input: { system: string; prompt: string }) => Promise<string>;

let skillRunner: SkillRunner | null = null;
/** M3 wires the provider-backed skill runner here. */
export function setSkillRunner(fn: SkillRunner | null): void {
  skillRunner = fn;
}

export function listForkSkillIds(): string[] {
  return Object.keys(FORK_SKILL_REGISTRY);
}

export const executeForkSkillTool = defineTool({
  name: "execute_fork_skill",
  description: [
    "Delegate a self-contained analysis or review task to a specialized skill sub-agent.",
    "The sub-agent runs the skill's domain logic as a focused LLM call.",
    "Use this when a task requires deep, focused attention from a specific skill domain.",
    `Available skills: ${knownSkillIds}`,
  ].join(" "),
  schema: executeForkSkillSchema,
  readOnly: true,
  modifiesState: false,
  execute: async (args) => executeForkSkill(executeForkSkillSchema.parse(args)),
  presentCall: (args: any) => `Fork skill: ${args.skill_id}`,
});

export async function executeForkSkill(
  input: z.infer<typeof executeForkSkillSchema>,
): Promise<string> {
  const parsed = executeForkSkillSchema.parse(input);
  const known = FORK_SKILL_REGISTRY[parsed.skill_id];
  if (!known) {
    throw new SandboxValidationError(
      `Unknown skill "${parsed.skill_id}". Known skills: ${knownSkillIds}`,
    );
  }
  if (!skillRunner) {
    return `Skill sub-agent transport not wired yet (M3) — skill "${parsed.skill_id}" not executed. Task was: ${parsed.task}`;
  }
  const system = [
    `You are a specialized sub-agent using the "${parsed.skill_id}" skill.`,
    known.description ? `\n## Skill Description\n${known.description}` : "",
    parsed.context ? `\n## Context\n${parsed.context}` : "",
    `\n## Task\n${parsed.task}`,
    "\n## Constraints\n- Provide your analysis or output directly.",
    "- Be thorough, specific, and actionable.",
    "- Do not ask clarifying questions — work with what you have.",
  ]
    .filter(Boolean)
    .join("\n");
  const text = await skillRunner({ system, prompt: parsed.task });
  return [`<fork-skill-execution skill="${parsed.skill_id}">`, text, `</fork-skill-execution>`].join("\n");
}

// --- check_task_status (donor description verbatim) ---

const checkTaskSchema = z.object({
  task_id: z.string().describe("The task ID returned by the spawn call"),
});

export const checkTaskStatusTool = defineTool({
  name: "check_task_status",
  description: `Check the status and output of a previously spawned background task.
If the task is still running, it will return the latest trailing output.
To prevent token bloat, the output is truncated to the last 1500 characters.`,
  schema: checkTaskSchema,
  readOnly: true,
  modifiesState: false,
  execute: async (args) => formatTaskStatus(checkTaskSchema.parse(args).task_id),
  presentCall: (args: any) => `Check task: ${args.task_id}`,
});

// --- check_subagent_status (donor description verbatim) ---

const checkSubagentSchema = z.object({
  task_id: z.string().describe("The subagent task ID"),
});

export const checkSubagentStatusTool = defineTool({
  name: "check_subagent_status",
  description: `Check the status and final output of a background subagent.`,
  schema: checkSubagentSchema,
  readOnly: true,
  modifiesState: false,
  execute: async (args) => formatSubagentStatus(checkSubagentSchema.parse(args).task_id),
  presentCall: (args: any) => `Check subagent: ${args.task_id}`,
});

export const ALL_SANDBOX_TOOLS: ToolDef[] = [
  executeSandboxScriptTool,
  executeForkSkillTool,
  checkTaskStatusTool,
  checkSubagentStatusTool,
];
