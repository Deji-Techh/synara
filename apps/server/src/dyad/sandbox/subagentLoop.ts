// FILE: subagentLoop.ts
// Purpose: Async subagent execution feeding dyad/sandbox/taskRegistry.
// Donor: team_manager spawn (role/task prompt, background run, 15-step cap,
// restricted tool subset, registry settle) with runLoop (harness) standing in
// for runSubagentLoop and streamProvider standing in for the AI-SDK client.
// Subagents never spawn subagents, never touch plans/blueprints.

import type { LLMAdapter } from "../../harness/loop/loop.ts";
import { runLoop } from "../../harness/loop/loop.ts";
import type { ToolDef } from "../../harness/tools/defineTool.ts";
import {
  registerSubagentTask,
  settleSubagentTask,
} from "./taskRegistry.ts";

const EXCLUDED_SUBAGENT_TOOLS = new Set([
  "spawn_subagent",
  "check_subagent_status",
  "spawn_background_task",
  "check_task_status",
  "write_app_blueprint",
  "write_plan",
  "exit_plan",
  "execute_fork_skill",
]);

const SUBAGENT_MAX_STEPS = 15;

export interface SubagentLoopDeps {
  appPath: string;
  sessionId: string;
  system: string;
  task: string;
  tools: ToolDef[];
  llm: LLMAdapter;
  signal?: AbortSignal;
}

export interface SubagentLoopResult {
  stepCount: number;
  finalText: string;
}

function toLoopTool(def: ToolDef, appPath: string, sessionId: string) {
  return {
    name: def.name,
    description: def.description,
    execute: async (args: unknown, context: { signal?: AbortSignal; sessionId: string; toolId: string }) =>
      def.execute(args, {
        signal: context.signal,
        appPath,
        sessionId,
        toolId: context.toolId,
      }),
  };
}

/** Run one subagent turn synchronously (background wrapper below detaches). */
export async function runSubagentLoop(deps: SubagentLoopDeps): Promise<SubagentLoopResult> {
  const tools = deps.tools
    .filter((t) => !EXCLUDED_SUBAGENT_TOOLS.has(t.name))
    .map((t) => toLoopTool(t, deps.appPath, deps.sessionId));
  let stepCount = 0;
  const texts: string[] = [];
  const stream = runLoop({
    sessionId: `${deps.sessionId}:subagent`,
    maxSteps: SUBAGENT_MAX_STEPS,
    signal: deps.signal,
    llm: deps.llm,
    buildMessages: () => [
      { role: "system" as const, content: deps.system },
      { role: "user" as const, content: "Begin your task." },
    ],
    tools,
    role: "builder",
  });
  for await (const event of stream) {
    if (event.type === "stage" && event.to.startsWith("step-")) stepCount++;
    if (event.type === "token") texts.push(event.content);
  }
  return { stepCount, finalText: texts.join("").trim() };
}

export interface SpawnSubagentDeps extends Omit<SubagentLoopDeps, "system"> {
  role: string;
}

/**
 * Spawn a background subagent: registers immediately (pollable via
 * check_subagent_status), runs detached, settles the registry on completion.
 * Returns the task id synchronously — donor spawn behavior.
 */
export function spawnSubagentTask(deps: SpawnSubagentDeps): string {
  const task = registerSubagentTask(deps.role);
  const system = [
    `You are a "${deps.role}" subagent.`,
    `Your task is: ${deps.task}`,
    "You are operating asynchronously in the background. Use the available tools to complete your task, then explain what you did.",
    "Do not ask for user input, as you are running in the background. If you are stuck, return an error or summary of your progress.",
  ].join("\n");
  void (async () => {
    try {
      const result = await runSubagentLoop({ ...deps, system });
      settleSubagentTask(task.id, { status: "completed", result });
    } catch (err) {
      settleSubagentTask(task.id, {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();
  return task.id;
}
