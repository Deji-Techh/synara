import { z } from "zod";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import {
  AgentContext,
  ToolDefinition,
  escapeXmlAttr,
} from "./types";
import { safeJoin } from "@/ipc/utils/path_utils";
import { killProcessTree } from "@/ipc/utils/process_tree";
import { getStandardShellEnv } from "@/ipc/utils/shell_utils";
import { globalProcessSemaphore } from "@/ipc/utils/process_semaphore";
import { backgroundTaskRegistry } from "@/ipc/utils/background_task_registry";

import type { ChildProcess } from "node:child_process";

export interface BackgroundTask {
  id: string;
  command: string;
  status: "running" | "completed" | "failed";
  stdout: string;
  stderr: string;
  exitCode: number | null;
  process?: ChildProcess;
}

const backgroundTasks = new Map<string, BackgroundTask>();

function syncGlobalTasks() {
  for (const t of backgroundTasks.values()) {
    backgroundTaskRegistry.registerTask(t.id, t.command, t.status);
  }
}

export function getBackgroundTasks() {
  return Array.from(backgroundTasks.values());
}

export function stopBackgroundTask(taskId: string) {
  const task = backgroundTasks.get(taskId);
  if (task && task.status === "running" && task.process) {
    killProcessTree(task.process.pid, "SIGTERM");
    task.status = "failed";
    syncGlobalTasks();
  }
}

const spawnTaskSchema = z.object({
  command: z
    .string()
    .min(1)
    .describe(
      "The shell command to run in the background (e.g., 'npm run test').",
    ),
  cwd: z
    .string()
    .optional()
    .describe("Optional working directory relative to the app root."),
});

const checkTaskSchema = z.object({
  task_id: z.string().min(1).describe("The ID of the task to check."),
});

export const spawnBackgroundTaskTool: ToolDefinition<
  z.infer<typeof spawnTaskSchema>
> = {
  name: "spawn_background_task",
  description: `Start a long-running command (like a build, test suite, or dev server) in the background. 
This tool returns immediately with a task ID, allowing you to continue planning or editing other files without waiting.
You can check the status of the task later using the check_task_status tool.`,
  inputSchema: spawnTaskSchema,
  defaultConsent: "always",
  modifiesState: true,

  getConsentPreview: (args) => `Spawn background task: ${args.command}`,

  buildXml: (args, isComplete) => {
    if (!args.command) return undefined;
    if (isComplete) return undefined;
    return `<caide-spawn-task command="${escapeXmlAttr(args.command)}">Spawning...</caide-spawn-task>`;
  },

  execute: async (args, ctx: AgentContext) => {
    const cwd = safeJoin(ctx.appPath, args.cwd || ".");
    const taskId = `task_${crypto.randomBytes(4).toString("hex")}`;

    const task: BackgroundTask = {
      id: taskId,
      command: args.command,
      status: "running",
      stdout: "",
      stderr: "",
      exitCode: null,
    };

    backgroundTasks.set(taskId, task);
    syncGlobalTasks();

    const releaseSemaphore = await globalProcessSemaphore.acquire();

    const child = spawn(args.command, {
      cwd,
      shell: true,
      detached: process.platform !== "win32",
      env: getStandardShellEnv(),
    });

    task.process = child;

    child.stdout?.on("data", (data) => {
      task.stdout += data.toString();
      if (task.stdout.length > 50000) {
        task.stdout = task.stdout.substring(task.stdout.length - 20000);
      }
    });

    child.stderr?.on("data", (data) => {
      task.stderr += data.toString();
      if (task.stderr.length > 50000) {
        task.stderr = task.stderr.substring(task.stderr.length - 20000);
      }
    });

    child.on("close", (code) => {
      releaseSemaphore();
      task.status = code === 0 ? "completed" : "failed";
      task.exitCode = code;
      syncGlobalTasks();
    });

    child.on("error", (error) => {
      releaseSemaphore();
      task.status = "failed";
      task.stderr += `\nError spawning task: ${error.message}`;
      syncGlobalTasks();
    });

    return `Task started successfully.\nTask ID: ${taskId}\nCommand: ${args.command}\nUse check_task_status to view output.`;
  },
};

export const checkTaskStatusTool: ToolDefinition<
  z.infer<typeof checkTaskSchema>
> = {
  name: "check_task_status",
  description: `Check the status and output of a previously spawned background task.
If the task is still running, it will return the latest trailing output. 
To prevent token bloat, the output is truncated to the last 1500 characters.`,
  inputSchema: checkTaskSchema,
  defaultConsent: "always",
  isReadOnly: true,

  getConsentPreview: (args) => `Check task: ${args.task_id}`,

  buildXml: (args, isComplete) => {
    if (!args.task_id) return undefined;
    if (isComplete) return undefined;
    return `<caide-check-task id="${escapeXmlAttr(args.task_id)}">Checking...</caide-check-task>`;
  },

  execute: async (args, _ctx: AgentContext) => {
    const task = backgroundTasks.get(args.task_id);

    if (!task) {
      return `Error: Task ID ${args.task_id} not found.`;
    }

    const truncate = (str: string, len: number) => {
      if (str.length <= len) return str;
      return (
        `...[truncated ${str.length - len} chars]...\n` +
        str.substring(str.length - len)
      );
    };

    const out = truncate(task.stdout, 1500);
    const err = truncate(task.stderr, 1500);

    return [
      `Task ID: ${task.id}`,
      `Command: ${task.command}`,
      `Status: ${task.status}`,
      `Exit Code: ${task.exitCode ?? "N/A"}`,
      `--- STDOUT ---`,
      out || "(empty)",
      `--- STDERR ---`,
      err || "(empty)",
    ].join("\n");
  },
};
