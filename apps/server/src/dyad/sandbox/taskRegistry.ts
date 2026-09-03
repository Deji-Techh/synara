// FILE: taskRegistry.ts
// Purpose: Session registries behind check_task_status /
// check_subagent_status. Donor output strings kept verbatim; the M3 async
// spawn loop writes entries via register*/settle* (donor task_manager /
// team_manager behavior, Electron stripped).

export type BackgroundTaskStatus = "running" | "completed" | "failed";

export interface BackgroundTask {
  id: string;
  command: string;
  status: BackgroundTaskStatus;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export interface SubagentResult {
  stepCount: number;
  finalText: string;
}

export type SubagentStatus = "running" | "completed" | "failed";

export interface SubagentTask {
  id: string;
  role: string;
  status: SubagentStatus;
  result?: SubagentResult;
  error?: string;
}

let taskCounter = 0;
let subagentCounter = 0;
const backgroundTasks = new Map<string, BackgroundTask>();
const subagentTasks = new Map<string, SubagentTask>();

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return `...[truncated ${str.length - len} chars]...\n` + str.substring(str.length - len);
}

export function registerBackgroundTask(command: string): BackgroundTask {
  const task: BackgroundTask = {
    id: `task-${Date.now()}-${++taskCounter}`,
    command,
    status: "running",
    stdout: "",
    stderr: "",
    exitCode: null,
  };
  backgroundTasks.set(task.id, task);
  return task;
}

export function settleBackgroundTask(
  id: string,
  patch: Partial<Pick<BackgroundTask, "status" | "stdout" | "stderr" | "exitCode">>,
): void {
  const task = backgroundTasks.get(id);
  if (task) Object.assign(task, patch);
}

export function formatTaskStatus(id: string): string {
  const task = backgroundTasks.get(id);
  if (!task) {
    return `Error: Task ID ${id} not found.`;
  }
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
}

export function registerSubagentTask(role: string): SubagentTask {
  const task: SubagentTask = {
    id: `subagent-${Date.now()}-${++subagentCounter}`,
    role,
    status: "running",
  };
  subagentTasks.set(task.id, task);
  return task;
}

export function settleSubagentTask(
  id: string,
  patch: Partial<Pick<SubagentTask, "status" | "result" | "error">>,
): void {
  const task = subagentTasks.get(id);
  if (task) Object.assign(task, patch);
}

export function formatSubagentStatus(id: string): string {
  const task = subagentTasks.get(id);
  if (!task) {
    return `Error: Subagent Task ID ${id} not found.`;
  }
  if (task.status === "running") {
    return `Task ID: ${task.id} (${task.role}) is still running.`;
  }
  if (task.status === "failed") {
    return `Task ID: ${task.id} (${task.role}) failed:\n${task.error}`;
  }
  const res = task.result!;
  return `Task ID: ${task.id} (${task.role}) completed in ${res.stepCount} steps.\n\nFinal Report:\n${res.finalText}`;
}

export function clearTaskRegistries(): void {
  backgroundTasks.clear();
  subagentTasks.clear();
}
