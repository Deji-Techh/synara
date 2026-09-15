// FILE: subagentLoop.ts
// Purpose: Async subagent execution feeding dyad/sandbox/taskRegistry:
// personas (explorer/implementer/reviewer/generic), durable threads with an
// inbox worker (send_message/followup_task wake idle or completed threads),
// cancellation, per-run step caps. Donor: team_manager spawn + personas +
// review flow (role/task prompt, background run, restricted tool subset,
// registry settle) with runLoop (harness) standing in for the AI-SDK client.
// Subagents never spawn subagents, never touch plans/blueprints.

import type { LLMAdapter } from "../../harness/loop/loop.ts";
import { runLoop } from "../../harness/loop/loop.ts";
import type { ToolDef } from "../../harness/tools/defineTool.ts";
import type { ConsentRequestFn, ConsentStore } from "../../dyad/tools/permissions.ts";
import { requireAgentToolConsent } from "../../dyad/tools/permissions.ts";
import {
  appendSubagentTranscript,
  getSubagentTask,
  isSubagentTerminal,
  queueSubagentMessage,
  registerSubagentTask,
  setSubagentCancelController,
  settleSubagentTask,
  type SubagentMessage,
} from "./taskRegistry.ts";
import { isExplorerTool, systemPromptForPersona, type SubagentPersona } from "./personas.ts";

const EXCLUDED_SUBAGENT_TOOLS = new Set([
  "spawn_subagent",
  "spawn_background_task",
  "check_subagent_status",
  "check_task_status",
  "list_agents",
  "wait_agents",
  "cancel_agent",
  "send_message",
  "followup_task",
  "write_app_blueprint",
  "write_plan",
  "exit_plan",
  "execute_fork_skill",
  "planning_questionnaire",
  "ask_env_vars",
]);

const SUBAGENT_MAX_STEPS = 15;
/** Total steps across all continuations of one thread. */
const THREAD_MAX_STEPS = 50;

export interface SubagentLoopDeps {
  appPath: string;
  sessionId: string;
  system: string;
  task: string;
  tools: ToolDef[];
  llm: LLMAdapter;
  signal?: AbortSignal;
  /** Persona gates the tool subset (explorer = read-only). */
  persona?: SubagentPersona;
  /** Prior thread transcript (continuations pick up context). */
  history?: SubagentMessage[];
  maxSteps?: number;
  /** Parent turn consent plumbing (background work keeps session posture). */
  requestConsent?: ConsentRequestFn;
  consentStore?: ConsentStore;
}

export interface SubagentLoopResult {
  stepCount: number;
  finalText: string;
}

function toLoopTool(
  def: ToolDef,
  appPath: string,
  sessionId: string,
  requestConsent?: ConsentRequestFn,
  consentStore?: ConsentStore,
) {
  return {
    name: def.name,
    description: def.description,
    readOnly: def.readOnly,
    execute: async (
      args: unknown,
      context: { signal?: AbortSignal; sessionId: string; toolId: string },
    ) => {
      // Same posture as the parent turn: mutating calls need consent.
      // Without a round-trip, stored allow/deny rules still apply exactly
      // like parent turns (deny throws, SQL auto-approve included).
      // The loop's per-call signal is forwarded so parent cancel (or
      // cancel_agent) settles a parked consent wait instead of hanging the
      // subagent forever with no turn_end.
      if (def.readOnly !== true) {
        const allowed = await requireAgentToolConsent({
          sessionId,
          toolName: def.name,
          toolDescription: def.description,
          store: consentStore,
          toolArgs: args,
          // exactOptionalPropertyTypes: never pass an explicit undefined.
          ...(context.signal ? { signal: context.signal } : {}),
          requestConsent:
            requestConsent ??
            (async () => {
              throw new Error(`No consent channel for background tool ${def.name}`);
            }),
        });
        if (!allowed) {
          throw new Error(`Tool '${def.name}' was declined.`);
        }
      }
      return def.execute(args, {
        signal: context.signal,
        appPath,
        sessionId,
        toolId: context.toolId,
      });
    },
  };
}

/** Run one subagent turn synchronously (background wrapper below detaches). */
export async function runSubagentLoop(deps: SubagentLoopDeps): Promise<SubagentLoopResult> {
  const tools = deps.tools
    .filter((t) => !EXCLUDED_SUBAGENT_TOOLS.has(t.name))
    .filter((t) => (deps.persona === "explorer" ? isExplorerTool(t.name, t.readOnly) : true))
    .map((t) =>
      toLoopTool(t, deps.appPath, deps.sessionId, deps.requestConsent, deps.consentStore),
    );
  let stepCount = 0;
  const texts: string[] = [];
  const history = (deps.history ?? []).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
  const stream = runLoop({
    sessionId: `${deps.sessionId}:subagent`,
    maxSteps: deps.maxSteps ?? SUBAGENT_MAX_STEPS,
    signal: deps.signal,
    llm: deps.llm,
    buildMessages: () => [
      { role: "system" as const, content: deps.system },
      ...history,
      {
        role: "user" as const,
        content: history.length > 0 ? "Continue with the thread above." : "Begin your task.",
      },
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

export interface SpawnSubagentDeps extends Omit<SubagentLoopDeps, "system" | "history"> {
  role: string;
  persona?: SubagentPersona;
  taskName?: string;
  scope?: string[];
}

const threadWorkers = new Set<string>();
/** Frozen worker deps per thread so continuations reuse model/tools. */
const threadDeps = new Map<string, WorkerDeps>();
/** Turn tool source for subagent toolsets (registered by turnContext). */
let toolSource: (() => ToolDef[]) | null = null;

/** Register the turn toolset provider (called once per turn context). */
export function setSubagentToolSource(fn: (() => ToolDef[]) | null): void {
  toolSource = fn;
}

/** Tools available to subagents (empty until a turn registers its set). */
export function getSubagentTools(): ToolDef[] {
  try {
    return toolSource?.() ?? [];
  } catch {
    return [];
  }
}

/**
 * Spawn a background subagent thread: registers immediately (pollable via
 * check_subagent_status), runs detached, settles the registry per turn and
 * idles with its transcript when the inbox drains. send_message and
 * followup_task wake the worker for continuations. Returns the task id
 * synchronously — donor spawn behavior.
 */
export function spawnSubagentTask(deps: SpawnSubagentDeps): string {
  const persona = deps.persona ?? "generic";
  const task = registerSubagentTask(deps.role, deps.sessionId, {
    persona,
    taskName: deps.taskName ?? deps.role,
    scope: deps.scope ?? [],
    // Transcript starts empty: the worker appends the queued assignment on
    // consume (pre-seeding here duplicated the first user message).
  });
  const controller = new AbortController();
  setSubagentCancelController(task.id, controller);
  // addEventListener never fires for an already-aborted parent — check up
  // front so a cancelled turn cannot spawn runaway subagents.
  if (deps.signal?.aborted) {
    controller.abort(deps.signal.reason ?? "parent turn aborted");
  }
  const onExternalAbort = () => controller.abort(deps.signal?.reason ?? "parent turn aborted");
  deps.signal?.addEventListener("abort", onExternalAbort, { once: true });
  const system = [systemPromptForPersona(persona), `Assignment: ${deps.task}`].join("\n\n");
  queueSubagentMessage(task.id, deps.task);
  const workerDeps: WorkerDeps = {
    appPath: deps.appPath,
    sessionId: deps.sessionId,
    system,
    tools: deps.tools,
    llm: deps.llm,
    signal: deps.signal,
    persona: deps.persona,
    requestConsent: deps.requestConsent,
    consentStore: deps.consentStore,
  };
  threadDeps.set(task.id, workerDeps);
  void runThreadWorker(task.id, workerDeps, controller, onExternalAbort);
  return task.id;
}

interface WorkerDeps extends Omit<SubagentLoopDeps, "system" | "history" | "task"> {
  system: string;
}

/** Drain one thread's inbox turn by turn; idles (transcript kept) when drained. */
export async function runThreadWorker(
  taskId: string,
  deps: WorkerDeps,
  controller: AbortController,
  onExternalAbort?: () => void,
): Promise<void> {
  if (threadWorkers.has(taskId)) return;
  threadWorkers.add(taskId);
  try {
    for (;;) {
      const task = getSubagentTask(taskId);
      if (!task) return;
      if (isSubagentTerminal(task)) {
        // Completed threads with queued follow-ups start a new
        // continuation turn; failed threads stay failed (start anew).
        if (task.status !== "completed" || task.inbox.length === 0) return;
        settleSubagentTask(taskId, { status: "running" });
      }
      if (controller.signal.aborted) {
        settleSubagentTask(taskId, {
          status: "failed",
          error: `Cancelled: ${String(controller.signal.reason ?? "cancel_agent")}`,
        });
        return;
      }
      const next = task.inbox.shift();
      if (next === undefined) {
        if (task.status !== "idle") {
          settleSubagentTask(taskId, { status: "idle" });
        }
        return;
      }
      if (task.stepsUsed >= THREAD_MAX_STEPS) {
        settleSubagentTask(taskId, {
          status: "failed",
          error: `Thread step budget exhausted (${THREAD_MAX_STEPS} steps). Start a new thread with a narrower assignment.`,
        });
        return;
      }
      if (task.status !== "running") {
        settleSubagentTask(taskId, { status: "running" });
      }
      appendSubagentTranscript(taskId, { role: "user", content: next });
      try {
        const live = getSubagentTask(taskId);
        const result = await runSubagentLoop({
          ...deps,
          system: deps.system,
          task: next,
          signal: controller.signal,
          history: live?.transcript ?? [],
          maxSteps: SUBAGENT_MAX_STEPS,
        });
        const settled = getSubagentTask(taskId);
        if (settled) settled.stepsUsed += result.stepCount;
        appendSubagentTranscript(taskId, { role: "assistant", content: result.finalText });
        const done = getSubagentTask(taskId);
        if (done && !isSubagentTerminal(done)) {
          settleSubagentTask(taskId, {
            status: done.inbox.length > 0 ? "running" : "idle",
            result,
          });
        }
      } catch (err) {
        if (controller.signal.aborted) {
          settleSubagentTask(taskId, {
            status: "failed",
            error: `Cancelled: ${String(controller.signal.reason ?? "cancel_agent")}`,
          });
          return;
        }
        settleSubagentTask(taskId, {
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        });
        return;
      }
    }
  } finally {
    threadWorkers.delete(taskId);
    if (onExternalAbort && deps.signal) {
      deps.signal.removeEventListener("abort", onExternalAbort);
    }
  }
}

/**
 * Wake a thread's worker (follow-ups on idle/completed threads start a new
 * continuation with full transcript, reusing the spawn-time model/tools).
 * Returns true when the message is durably queued on a live thread (a
 * running worker consumes it; otherwise one is started when spawn-time deps
 * exist). False for unknown or failed threads — start a new thread instead.
 */
export function wakeSubagentThread(taskId: string): boolean {
  const task = getSubagentTask(taskId);
  if (!task || task.status === "failed") return false;
  // A live worker owns its controller: never overwrite the registry handle
  // (cancel_agent would then abort a dead controller and lose cancellation).
  if (threadWorkers.has(taskId)) return true;
  const deps = threadDeps.get(taskId);
  if (!deps) return true;
  const active = new AbortController();
  setSubagentCancelController(taskId, active);
  if (deps.signal?.aborted) {
    active.abort(deps.signal.reason ?? "parent turn aborted");
  } else {
    deps.signal?.addEventListener(
      "abort",
      () => active.abort(deps.signal?.reason ?? "parent turn aborted"),
      {
        once: true,
      },
    );
  }
  void runThreadWorker(taskId, deps, active);
  return true;
}

/** Test-only: drop cached worker deps. */
export function clearThreadDeps(): void {
  threadDeps.clear();
}
