import { z } from "zod";
import crypto from "node:crypto";
import { AgentContext, ToolDefinition, escapeXmlAttr } from "./types";
import { runSubagentLoop, SubagentRunResult } from "./subagent_runner";
import log from "electron-log";
import type { ToolSet } from "ai";

const logger = log.scope("team_manager");

const MAX_CONCURRENT_SUBAGENTS = 3;

interface SubagentTask {
  id: string;
  role: string;
  taskDescription: string;
  status: "running" | "completed" | "failed";
  result: SubagentRunResult | null;
  error: string | null;
}

const subagentTasks = new Map<string, SubagentTask>();

export function clearSubagentTasks(): void {
  subagentTasks.clear();
  if ((globalThis as any).__caideActiveSubagents) {
    (globalThis as any).__caideActiveSubagents.clear();
  }
}

export function getSubagentTask(id: string): SubagentTask | undefined {
  return subagentTasks.get(id);
}

export function getAllSubagentTasks(): SubagentTask[] {
  return Array.from(subagentTasks.values());
}

const spawnSubagentSchema = z.object({
  role: z.string().describe("The role of the subagent (e.g., 'Database Expert', 'UI Specialist')."),
  task: z.string().describe("The specific task the subagent should accomplish."),
});

const checkSubagentSchema = z.object({
  task_id: z.string().describe("The ID of the subagent task to check."),
});

export const spawnSubagentTool: ToolDefinition<z.infer<typeof spawnSubagentSchema>> = {
  name: "spawn_subagent",
  description: `Delegate a complex task to a specialized subagent. 
This tool runs the subagent in the background and returns a task ID immediately, allowing you to work on other files in parallel. 
Use check_subagent_status to read its final report.`,
  inputSchema: spawnSubagentSchema,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) => `Spawn subagent: ${args.role}`,

  buildXml: (args, isComplete) => {
    if (!args.role) return undefined;
    if (isComplete) return undefined;
    return `<caide-spawn-subagent role="${escapeXmlAttr(args.role)}">Spawning...</caide-spawn-subagent>`;
  },

  execute: async (args, ctx: AgentContext) => {
    // Enforce max concurrent subagents limit
    const runningCount = Array.from(subagentTasks.values()).filter(
      (t) => t.status === "running",
    ).length;
    if (runningCount >= MAX_CONCURRENT_SUBAGENTS) {
      return `Error: Maximum limit of ${MAX_CONCURRENT_SUBAGENTS} concurrent background subagents reached. Please wait for existing subagents to finish or check their status before spawning a new one.`;
    }

    const taskId = `subagent_${crypto.randomBytes(4).toString("hex")}`;

    const task: SubagentTask = {
      id: taskId,
      role: args.role,
      taskDescription: args.task,
      status: "running",
      result: null,
      error: null,
    };

    subagentTasks.set(taskId, task);

    if (!(globalThis as any).__caideActiveSubagents) {
      (globalThis as any).__caideActiveSubagents = new Map();
    }
    const subagentMap = (globalThis as any).__caideActiveSubagents;
    subagentMap.set(taskId, {
      id: taskId,
      name: args.role,
      description: args.task,
      startedAt: Date.now(),
    });

    // Build subagent prompt
    const systemPrompt = `You are a specialized subagent acting as a ${args.role}.
Your task is: ${args.task}
You are operating asynchronously in the background. Use the available tools to complete your task, then explain what you did.
Do not ask for user input, as you are running in the background. If you are stuck, return an error or summary of your progress.`;

    setImmediate(async () => {
      try {
        const { buildAgentToolSet } = await import("../tool_definitions");

        // Exclude write_app_blueprint, plan mode tools, and recursive subagent spawning from subagents
        const subagentTools = buildAgentToolSet(ctx, {
          enableAppBlueprint: false,
          planModeOnly: false,
        }) as ToolSet;
        delete subagentTools.spawn_subagent;
        delete subagentTools.check_subagent_status;

        const result = await runSubagentLoop({
          ctx,
          system: systemPrompt,
          prompt: "Begin your task.",
          maxSteps: 15,
          name: args.role,
          description: args.task,
          subagentId: taskId,
          tools: subagentTools,
        });

        task.status = "completed";
        task.result = result;
      } catch (err) {
        logger.error(`Subagent task ${taskId} failed:`, err);
        task.status = "failed";
        task.error = err instanceof Error ? err.message : String(err);
      } finally {
        subagentMap.delete(taskId);
      }
    });

    return `Subagent spawned successfully.\nTask ID: ${taskId}\nRole: ${args.role}\nUse check_subagent_status to read the result.`;
  },
};

export const checkSubagentStatusTool: ToolDefinition<z.infer<typeof checkSubagentSchema>> = {
  name: "check_subagent_status",
  description: `Check the status and final output of a background subagent.`,
  inputSchema: checkSubagentSchema,
  defaultConsent: "always",
  isReadOnly: true,

  getConsentPreview: (args) => `Check subagent: ${args.task_id}`,

  execute: async (args, _ctx: AgentContext) => {
    const task = subagentTasks.get(args.task_id);

    if (!task) {
      return `Error: Subagent Task ID ${args.task_id} not found.`;
    }

    if (task.status === "running") {
      return `Task ID: ${task.id} (${task.role}) is still running.`;
    }

    if (task.status === "failed") {
      return `Task ID: ${task.id} (${task.role}) failed:\n${task.error}`;
    }

    const res = task.result!;
    return `Task ID: ${task.id} (${task.role}) completed in ${res.stepCount} steps.\n\nFinal Report:\n${res.finalText}`;
  },
};
