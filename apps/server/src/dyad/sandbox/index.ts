// FILE: index.ts
// Purpose: Barrel for the Dyad-transplant sandbox + skill/task tools.

export {
  SANDBOX_SCRIPT_SOURCE_LIMIT_BYTES,
  SANDBOX_LLM_OUTPUT_LIMIT_BYTES,
  SANDBOX_UI_OUTPUT_LIMIT_BYTES,
  SANDBOX_READ_FILE_LIMIT_BYTES,
  DEFAULT_SANDBOX_TIMEOUT_MS,
  MAX_SANDBOX_TIMEOUT_MS,
  SANDBOX_WALL_CLOCK_TIMEOUT_MS,
  clampSandboxTimeoutMs,
} from "./limits.ts";
export { createFsHosts, runInVm, type SandboxHost, type VmRunResult } from "./vmRunner.ts";
export {
  registerBackgroundTask,
  settleBackgroundTask,
  formatTaskStatus,
  registerSubagentTask,
  settleSubagentTask,
  formatSubagentStatus,
  listSubagentTasks,
  isSubagentTerminal,
  setSubagentCancelController,
  requestSubagentCancel,
  clearTaskRegistries,
  type BackgroundTask,
  type SubagentTask,
  type SubagentResult,
} from "./taskRegistry.ts";
export {
  ALL_SANDBOX_TOOLS,
  executeSandboxScriptTool,
  executeForkSkillTool,
  checkTaskStatusTool,
  checkSubagentStatusTool,
  listAgentsTool,
  waitAgentsTool,
  cancelAgentTool,
  sendMessageTool,
  followupTaskTool,
  executeSandboxScript,
  executeForkSkill,
  listForkSkillIds,
  setSkillRunner,
  SandboxValidationError,
  type SkillRunner,
  type SandboxHostContext,
} from "./sandboxTools.ts";
export { runWorkerSandbox, WORKER_WALL_TIMEOUT_MS } from "./workerRunner.ts";
export {
  runSubagentLoop,
  spawnSubagentTask,
  wakeSubagentThread,
  setSubagentToolSource,
  getSubagentTools,
  clearThreadDeps,
  type SubagentLoopDeps,
  type SubagentLoopResult,
  type SpawnSubagentDeps,
} from "./subagentLoop.ts";
export {
  systemPromptForPersona,
  isExplorerTool,
  EXPLORER_SYSTEM_PROMPT,
  IMPLEMENTER_SYSTEM_PROMPT,
  REVIEWER_SYSTEM_PROMPT,
  type SubagentPersona,
} from "./personas.ts";
