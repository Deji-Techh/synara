/**
 * IPC handlers for agent tool consent management
 */

import {
  getAllAgentToolConsents,
  setAgentToolConsent,
  resolveAgentToolConsent,
  TOOL_DEFINITIONS,
  getDefaultConsent,
  type AgentToolName,
} from "./tool_definitions";
import { createLoggedHandler } from "@/ipc/handlers/safe_handle";
import log from "electron-log";
import type {
  AgentTool,
  SetAgentToolConsentParams,
  AgentToolConsentResponseParams,
  PromptEnvVarResponseParams,
} from "@/ipc/types";
import { getBackgroundTasks, stopBackgroundTask } from "./tools/task_manager";
import { envVarResolver } from "./userInputResolvers";

const logger = log.scope("agent_tool_handlers");
const handle = createLoggedHandler(logger);
export function registerAgentToolHandlers() {
  // Get list of available tools with their consent settings
  handle("agent-tool:get-tools", async (): Promise<AgentTool[]> => {
    const consents = getAllAgentToolConsents();
    return TOOL_DEFINITIONS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      isAllowedByDefault: getDefaultConsent(tool.name) === "always",
      consent: consents[tool.name],
    }));
  });

  // Set consent for a single tool
  handle("agent-tool:set-consent", async (_event, params: SetAgentToolConsentParams) => {
    setAgentToolConsent(params.toolName as AgentToolName, params.consent);
    return { success: true };
  });

  // Handle consent response from renderer
  handle("agent-tool:consent-response", async (_event, params: AgentToolConsentResponseParams) => {
    resolveAgentToolConsent(params.requestId, params.decision);
  });

  handle("agent-tool:env-var-response", async (_event, params: PromptEnvVarResponseParams) => {
    envVarResolver.resolve(params.requestId, params.envVars);
  });

  handle("agent-tool:list-background-tasks", async () => {
    return getBackgroundTasks().map((task) => ({
      id: task.id,
      command: task.command,
      status: task.status,
      stdout: task.stdout,
      stderr: task.stderr,
      exitCode: task.exitCode,
    }));
  });

  handle("agent-tool:stop-background-task", async (_event, taskId: string) => {
    stopBackgroundTask(taskId);
  });
}
