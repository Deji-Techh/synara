// FILE: uiBridge.ts
// Purpose: M3 delivery — binds every human-gate transport to the harness
// WebSocket server: plan questionnaire/env-vars/integration prompts,
// tool + MCP consent round-trips, plan update/exit events, and right-dock
// pane reveals. Inbound answers resolve the matching waiter registries.
// Attach once at server startup; detach in tests.

import type { HarnessEvent } from "@caide/contracts";
import { setDbPanelTransport } from "../../dyad/db/dbPanel.ts";
import { setIntegrationTransport } from "../../dyad/db/dbTools.ts";
import {
  resolveConsent,
  type ConsentRequestFn,
} from "../../dyad/tools/permissions.ts";
import {
  resolveMcpConsent,
  type McpConsentRequestFn,
} from "../../dyad/mcp/mcpConsent.ts";
import { setPlanTransport } from "../../dyad/plan/planTools.ts";
import { dismissUserInput, resolveUserInput } from "../../dyad/plan/userPrompt.ts";
import {
  applySettingsSync,
  type SettingsSyncPayload,
} from "../turn/sessionStores.ts";
import type { HarnessWebSocketServer } from "./server.ts";

function send(server: HarnessWebSocketServer, sessionId: string, event: HarnessEvent): void {
  server.broadcastToSession(sessionId, event);
}

/**
 * Attach all UI transports to a WS server. Returns the consent request
 * factories turn contexts use (they emit ui_prompt and await the answer
 * via the matching waiter — no transport-specific code at call sites).
 */
export function attachUiBridge(server: HarnessWebSocketServer): {
  requestConsent: ConsentRequestFn;
  requestMcpConsent: McpConsentRequestFn;
  detach: () => void;
} {
  setPlanTransport({
    sendQuestionnaire: (sessionId, requestId, questions) =>
      send(server, sessionId, { type: "ui_prompt", sessionId, requestId, kind: "questionnaire", payload: { questions } }),
    sendEnvVarRequest: (sessionId, requestId, vars) =>
      send(server, sessionId, { type: "ui_prompt", sessionId, requestId, kind: "env-vars", payload: { vars } }),
    sendPlanUpdate: (sessionId, plan) =>
      send(server, sessionId, { type: "plan_update", sessionId, ...plan }),
    sendPlanExit: (sessionId) => send(server, sessionId, { type: "plan_exit", sessionId }),
  });

  setDbPanelTransport({
    revealDatabase: (sessionId, reason) =>
      send(server, sessionId, { type: "ui_reveal", sessionId, pane: "database", reason }),
  });

  setIntegrationTransport({
    sendIntegrationPrompt: (sessionId, requestId, provider) =>
      send(server, sessionId, {
        type: "ui_prompt",
        sessionId,
        requestId,
        kind: "integration",
        payload: { provider: provider ?? null },
      }),
  });

  const requestConsent: ConsentRequestFn = async (req) => {
    send(server, req.sessionId, {
      type: "ui_prompt",
      sessionId: req.sessionId,
      requestId: req.requestId,
      kind: "tool-consent",
      payload: {
        toolName: req.toolName,
        toolDescription: req.toolDescription ?? null,
        inputPreview: req.inputPreview ?? null,
      },
    });
    // The waiter (waitForConsent) is parked by requireAgentToolConsent before
    // this factory runs; never resolve here — the answer arrives below.
    return new Promise<never>(() => {});
  };

  const requestMcpConsent: McpConsentRequestFn = async (req) => {
    send(server, req.sessionId, {
      type: "ui_prompt",
      sessionId: req.sessionId,
      requestId: req.requestId,
      kind: "mcp-consent",
      payload: {
        serverName: req.serverName,
        toolName: req.toolName,
        inputPreview: req.inputPreview ?? null,
        autoApproveReason: req.autoApproveReason ?? null,
      },
    });
    return new Promise<never>(() => {});
  };

  server.onPromptAnswer((requestId, answers) => {
    if (answers) resolveUserInput(requestId, answers);
    else dismissUserInput(requestId);
  });
  server.onConsentAnswer((requestId, decision) => {
    resolveConsent(requestId, decision);
    resolveMcpConsent(requestId, decision);
  });
  server.onSettingsSync((sessionId, settings) => {
    applySettingsSync(sessionId, settings as SettingsSyncPayload);
  });

  return {
    requestConsent,
    requestMcpConsent,
    detach: () => {
      setPlanTransport(null);
      setDbPanelTransport(null);
      setIntegrationTransport(null);
      server.onPromptAnswer(() => {});
      server.onConsentAnswer(() => {});
      server.onSettingsSync(() => {});
    },
  };
}
