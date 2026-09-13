// FILE: uiBridge.ts
// Purpose: M3 delivery — binds every human-gate transport to the harness
// WebSocket server: plan questionnaire/env-vars/integration prompts,
// tool + MCP consent round-trips, plan update/exit events, and right-dock
// pane reveals. Inbound answers resolve the matching waiter registries.
// Attach once at server startup; detach in tests.

import type { HarnessEvent } from "@caide/contracts";
import { appendHarnessEvent } from "../turn/eventLog.ts";
import { setDbPanelTransport } from "../../dyad/db/dbPanel.ts";
import { clearPendingConsentsForSession } from "../../dyad/tools/permissions.ts";
import { clearPendingMcpConsentsForSession } from "../../dyad/mcp/mcpConsent.ts";
import { setIntegrationTransport } from "../../dyad/db/dbTools.ts";
import { sharedMcpManager, type ManagedMcpServer } from "../../dyad/mcp/manager.ts";
import {
  resolveConsent,
  sessionForConsentRequest,
  type ConsentRequestFn,
} from "../../dyad/tools/permissions.ts";
import {
  resolveMcpConsent,
  sessionForMcpConsentRequest,
  type McpConsentRequestFn,
} from "../../dyad/mcp/mcpConsent.ts";
import { setPlanTransport } from "../../dyad/plan/planTools.ts";
import { setBlueprintTransport } from "../../dyad/plan/blueprintTools.ts";
import {
  clearUserInputForSession,
  dismissUserInput,
  resolveUserInput,
  sessionForRequest,
} from "../../dyad/plan/userPrompt.ts";
import {
  applySettingsSync,
  getSessionApp,
  type SettingsSyncPayload,
} from "../turn/sessionStores.ts";
import { linkAppDatabase } from "../../dyad/db/connections.ts";
import { setBlockchainNetworks, type BlockchainNetwork } from "../../dyad/web3/networks.ts";
import type { HarnessHub } from "./hub.ts";

function send(server: HarnessHub, sessionId: string, event: HarnessEvent): void {
  server.broadcastToSession(sessionId, event);
  // Persist prompts (and only prompts — tokens/turns already persist via the
  // runner) so reconnect replay rebuilds parked questionnaires/consents.
  // Withdrawals persist too so replay drops superseded/cancelled cards.
  // Answered prompts are filtered at replay time (see hub.replaySession).
  if (event.type === "ui_prompt" || event.type === "ui_prompt_withdraw") {
    void appendHarnessEvent(event).catch(() => undefined);
  }
}

/**
 * Withdraw parked prompts for a session (turn cancel): settles every waiter
 * registry (user input + tool + MCP consent) and broadcasts + persists a
 * withdrawal per card so clients drop them and replay never resurrects
 * them. Returns the withdrawn requestIds.
 */
export function withdrawSessionPrompts(server: HarnessHub, sessionId: string): string[] {
  const ids = [
    ...clearUserInputForSession(sessionId),
    ...clearPendingConsentsForSession(sessionId),
    ...clearPendingMcpConsentsForSession(sessionId),
  ];
  for (const requestId of ids) {
    send(server, sessionId, { type: "ui_prompt_withdraw", sessionId, requestId });
  }
  return ids;
}

/**
 * Durable settle tombstone for one answered/dismissed prompt: persisted
 * BEFORE the waiter resolves so replay-after-restart can never resurrect
 * the card, then broadcast so sibling tabs drop it too.
 */
async function settlePrompt(
  server: HarnessHub,
  sessionId: string,
  requestId: string,
): Promise<void> {
  const event = { type: "ui_prompt_withdraw", sessionId, requestId } as const;
  try {
    await appendHarnessEvent(event);
  } catch {
    // logging must never break a turn
  }
  server.broadcastToSession(sessionId, event);
}

/**
 * Attach all UI transports to a WS server. Returns the consent request
 * factories turn contexts use (they emit ui_prompt and await the answer
 * via the matching waiter — no transport-specific code at call sites).
 */
export function attachUiBridge(server: HarnessHub): {
  requestConsent: ConsentRequestFn;
  requestMcpConsent: McpConsentRequestFn;
  detach: () => void;
} {
  setPlanTransport({
    sendQuestionnaire: (sessionId, requestId, questions) =>
      send(server, sessionId, {
        type: "ui_prompt",
        sessionId,
        requestId,
        kind: "questionnaire",
        payload: { questions },
      }),
    sendEnvVarRequest: (sessionId, requestId, vars) =>
      send(server, sessionId, {
        type: "ui_prompt",
        sessionId,
        requestId,
        kind: "env-vars",
        payload: { vars },
      }),
    sendPlanUpdate: (sessionId, plan) =>
      send(server, sessionId, { type: "plan_update", sessionId, ...plan }),
    sendPlanExit: (sessionId) => send(server, sessionId, { type: "plan_exit", sessionId }),
    sendTodosUpdate: (sessionId, todos) =>
      send(server, sessionId, { type: "todos_update", sessionId, todos }),
    sendPromptWithdraw: (sessionId, requestId) =>
      send(server, sessionId, { type: "ui_prompt_withdraw", sessionId, requestId }),
  });

  setDbPanelTransport({
    revealDatabase: (sessionId, reason) =>
      send(server, sessionId, { type: "ui_reveal", sessionId, pane: "database", reason }),
  });

  setBlueprintTransport({
    sendBlueprintUpdate: (sessionId, blueprint) =>
      send(server, sessionId, { type: "blueprint_update", sessionId, ...blueprint }),
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
    void (async () => {
      const sessionId = sessionForRequest(requestId);
      if (sessionId) await settlePrompt(server, sessionId, requestId);
      if (answers) resolveUserInput(requestId, answers);
      else dismissUserInput(requestId);
    })();
  });
  server.onConsentAnswer((requestId, decision) => {
    void (async () => {
      const sessionId =
        sessionForConsentRequest(requestId) ?? sessionForMcpConsentRequest(requestId);
      if (sessionId) await settlePrompt(server, sessionId, requestId);
      resolveConsent(requestId, decision);
      resolveMcpConsent(requestId, decision);
    })();
  });
  server.onMcpOAuthStart((sessionId, input) => {
    void (async () => {
      const base = { sessionId, requestId: input.requestId, serverId: input.serverId } as const;
      try {
        const { beginMcpOAuthFlow, completeMcpOAuthFlow } =
          await import("../../dyad/mcp/mcpOAuth.ts");
        const begun = await beginMcpOAuthFlow({
          serverId: input.serverId,
          serverUrl: input.serverUrl,
          ...(input.clientId ? { clientId: input.clientId } : {}),
          ...(input.scope ? { scope: input.scope } : {}),
          ...(typeof input.callbackPort === "number" ? { callbackPort: input.callbackPort } : {}),
        });
        send(server, sessionId, {
          ...base,
          type: "mcp_oauth",
          status: "authorize",
          authorizeUrl: begun.authorizeUrl,
        });
        const { code } = await begun.waitForCallback;
        await completeMcpOAuthFlow({
          serverId: input.serverId,
          metadata: begun.metadata,
          client: begun.client,
          code,
          redirectUri: begun.redirectUri,
          verifier: begun.verifier,
        });
        send(server, sessionId, { ...base, type: "mcp_oauth", status: "connected" });
      } catch (err) {
        send(server, sessionId, {
          ...base,
          type: "mcp_oauth",
          status: "failed",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  });
  server.onSettingsSync((sessionId, settings) => {
    const payload = settings as SettingsSyncPayload & { blockchainNetworks?: BlockchainNetwork[] };
    applySettingsSync(sessionId, payload);
    // Project-scoped DB persistence: a synced link also lands on the app so
    // later chats in the same project reuse it (never outside the project).
    if (payload.dbLinks && payload.dbLinks.length > 0) {
      const appPath = getSessionApp(sessionId);
      if (appPath) linkAppDatabase(appPath, payload.dbLinks[0]);
    }
    if (payload.blockchainNetworks && payload.blockchainNetworks.length > 0) {
      setBlockchainNetworks(payload.blockchainNetworks.filter((n) => n.id && n.rpcUrl));
    }
    // Settings UI → live tools: sync manager connections. OAuth-transport
    // servers sync as SSE (their stored OAuth token authorizes at connect);
    // the token itself never crosses the socket.
    if (payload.mcpServers && payload.mcpServers.length > 0) {
      const servers: ManagedMcpServer[] = payload.mcpServers
        .filter((s) => s.transport === "stdio" || s.transport === "sse" || s.transport === "oauth")
        .map((s) => ({
          id: s.id,
          name: s.name,
          enabled: s.enabled !== false,
          defaultConsent: s.defaultConsent,
          config: (s.transport === "stdio"
            ? {
                transport: "stdio" as const,
                command: s.command ?? "",
                args: s.args,
                env: s.env,
              }
            : {
                transport: "sse" as const,
                url: s.url ?? "",
                headers: s.headers,
              }) as ManagedMcpServer["config"],
        }))
        .filter((s) =>
          s.config.transport === "sse" ? s.config.url.length > 0 : s.config.command.length > 0,
        );
      if (servers.length > 0) {
        void sharedMcpManager()
          .sync(servers)
          .then(() => sharedMcpManager().syncRegistry())
          .catch(() => {});
      }
    }
  });

  return {
    requestConsent,
    requestMcpConsent,
    detach: () => {
      setPlanTransport(null);
      setDbPanelTransport(null);
      setBlueprintTransport(null);
      setIntegrationTransport(null);
      server.onPromptAnswer(() => {});
      server.onConsentAnswer(() => {});
      server.onSettingsSync(() => {});
    },
  };
}
