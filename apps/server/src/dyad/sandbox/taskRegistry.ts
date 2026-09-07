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

export type SubagentStatus = "running" | "idle" | "completed" | "failed";

export interface SubagentMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SubagentTask {
  id: string;
  role: string;
  /** Owning session (chat scoping for list_agents). */
  sessionId: string;
  status: SubagentStatus;
  /** Durable thread transcript (survives continuations). */
  transcript: SubagentMessage[];
  /** Queued messages consumed by the thread worker. */
  inbox: string[];
  persona: string;
  taskName: string;
  scope: string[];
  stepsUsed: number;
  result?: SubagentResult;
  error?: string;
}

let taskCounter = 0;
let subagentCounter = 0;
const backgroundTasks = new Map<string, BackgroundTask>();
const subagentTasks = new Map<string, SubagentTask>();
/** Abort controllers for running subagents (donor cancelSubagent parity). */
const subagentCancelControllers = new Map<string, AbortController>();

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

export function registerSubagentTask(
  role: string,
  sessionId = "",
  init?: Partial<Pick<SubagentTask, "persona" | "taskName" | "scope" | "transcript">>,
): SubagentTask {
  const task: SubagentTask = {
    id: `subagent-${Date.now()}-${++subagentCounter}`,
    role,
    sessionId,
    status: "running",
    transcript: init?.transcript ?? [],
    inbox: [],
    persona: init?.persona ?? "generic",
    taskName: init?.taskName ?? role,
    scope: init?.scope ?? [],
    stepsUsed: 0,
  };
  subagentTasks.set(task.id, task);
  return task;
}

/** Append a transcript line (bounded: keeps the last 100). */
export function appendSubagentTranscript(id: string, message: SubagentMessage): void {
  const task = subagentTasks.get(id);
  if (!task) return;
  task.transcript.push(message);
  if (task.transcript.length > 100) {
    task.transcript.splice(0, task.transcript.length - 100);
  }
}

/** Queue a message for the thread worker (bounded: rejects past 20). */
export function queueSubagentMessage(id: string, message: string): "queued" | "missing" | "full" | "terminal" {
  const task = subagentTasks.get(id);
  if (!task) return "missing";
  if (isSubagentTerminal(task)) return "terminal";
  if (task.inbox.length >= 20) return "full";
  task.inbox.push(message);
  return "queued";
}

/** Look up a thread (any status). */
export function getSubagentTask(id: string): SubagentTask | undefined {
  return subagentTasks.get(id);
}

export function settleSubagentTask(
  id: string,
  patch: Partial<Pick<SubagentTask, "status" | "result" | "error">>,
): void {
  const task = subagentTasks.get(id);
  if (!task) return;
  Object.assign(task, patch);
  // Terminal tasks need no cancellation handle — evict to bound growth.
  if (isSubagentTerminal(task)) {
    subagentCancelControllers.delete(id);
  }
}

export function formatSubagentStatus(id: string): string {
  const task = subagentTasks.get(id);
  if (!task) {
    return `Error: Subagent Task ID ${id} not found.`;
  }
  if (task.status === "running") {
    return `Task ID: ${task.id} (${task.role}) is still running.`;
  }
  if (task.status === "idle") {
    const tail = task.transcript.filter((m) => m.role === "assistant").at(-1)?.content ?? "";
    return `Task ID: ${task.id} (${task.role}) is idle.${tail ? `\n\nLast report:\n${tail.slice(0, 1500)}` : ""}`;
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
  subagentCancelControllers.clear();
}

/** Snapshot of subagent tasks, optionally scoped to one session (chat). */
export function listSubagentTasks(sessionId?: string): SubagentTask[] {
  const all = [...subagentTasks.values()];
  if (sessionId === undefined) return all;
  return all.filter((t) => t.sessionId === sessionId);
}

/** True when the task reached a terminal state. */
export function isSubagentTerminal(task: SubagentTask): boolean {
  return task.status === "completed" || task.status === "failed";
}

/**
 * Attach a cancellation controller to a running subagent. Called by the
 * spawner; cancel_agent aborts it at the next safe boundary.
 */
export function setSubagentCancelController(id: string, controller: AbortController): void {
  if (subagentTasks.has(id)) {
    subagentCancelControllers.set(id, controller);
  }
}

/**
 * Request cancellation of a running sub-agent. Returns false when the id
 * is unknown, already terminal, or has no live cancellation handle (no
 * false "requested" reports). The runner settles the task as failed
 * with a cancellation note when the abort lands.
 */
export function requestSubagentCancel(id: string): boolean {
  const task = subagentTasks.get(id);
  if (!task || isSubagentTerminal(task)) return false;
  const controller = subagentCancelControllers.get(id);
  if (!controller) return false;
  controller.abort(`cancel_agent ${id}`);
  return true;
}
