// FILE: hub.ts
// Purpose: Transport-agnostic harness session hub: client registry,
// inbound message dispatch, typed broadcasts, and reconnect replay.
// The raw-ws server (tests, standalone embedding) and the Effect route
// (production, same upgrade pipeline as RPC/device-frame) both drive it.
// One shared instance serves the server; gateway.attachWs binds a hub.

import type { HarnessEvent } from "@caide/contracts";
import { readHarnessEvents } from "../turn/eventLog.ts";

export interface ClientInboundMessage {
  type:
    | "subscribe"
    | "steer"
    | "cancel"
    | "checkpoint_response"
    | "ping"
    | "prompt_answer"
    | "consent_answer"
    | "settings_sync"
    | "blueprint_response"
    | "turn_start"
    | "provider_settings_get"
    | "provider_settings_set"
    | "provider_settings_test"
    | "versions_list"
    | "versions_restore"
    | "mcp_oauth_start";
  sessionId?: string;
  serverId?: string;
  serverUrl?: string;
  clientId?: string;
  scope?: string;
  callbackPort?: number;
  token?: string;
  prompt?: string;
  checkpointId?: string;
  approved?: boolean;
  feedback?: string;
  requestId?: string;
  answers?: Record<string, string>;
  decision?: "accept-once" | "accept-always" | "decline";
  settings?: Record<string, unknown>;
  blueprint?: Record<string, unknown>;
  turn?: TurnStartPayload;
  hash?: string;
  provider?: { id?: string; apiKey?: string; apiBaseUrl?: string; resourceName?: string };
  providerEntry?: { apiKey?: string; apiBaseUrl?: string; resourceName?: string };
  defaults?: {
    providerId?: string;
    modelId?: string;
    imageProviderId?: string;
    imageModelId?: string;
  };
}

export interface TurnStartPayload {
  appPath: string;
  prompt: string;
  mode?: "build" | "ask" | "agent" | "plan";
  framework?: "blank" | "react-native" | "flutter" | "website";
  providerId?: string;
  modelId?: string;
  maxSteps?: number;
  providerSettings?: Record<
    string,
    {
      apiKey?: { value?: string | null } | string | null;
      apiBaseUrl?: string | null;
      baseUrl?: string | null;
      resourceName?: string | null;
    }
  >;
}

export type SessionCancelHandler = (sessionId: string, reason?: string) => void;
export type SessionSteerHandler = (sessionId: string, prompt: string) => void;
export type CheckpointResponseHandler = (
  sessionId: string,
  checkpointId: string,
  approved: boolean,
  feedback?: string,
) => void;
export type PromptAnswerHandler = (
  requestId: string,
  answers: Record<string, string> | null,
) => void;
export type ConsentAnswerHandler = (
  requestId: string,
  decision: "accept-once" | "accept-always" | "decline",
) => void;
export type SettingsSyncHandler = (sessionId: string, settings: Record<string, unknown>) => void;
export type VersionsListHandler = (sessionId: string) => void;
export type VersionsRestoreHandler = (sessionId: string, hash: string) => void;
export type BlueprintResponseHandler = (
  sessionId: string,
  approved: boolean,
  blueprint?: Record<string, unknown>,
  feedback?: string,
) => void;
export type TurnStartHandler = (sessionId: string, turn: TurnStartPayload) => void;
export type McpOAuthStartHandler = (
  sessionId: string,
  input: {
    serverId: string;
    serverUrl: string;
    clientId?: string;
    scope?: string;
    callbackPort?: number;
    requestId?: string;
  },
) => void;
export type ProviderSettingsGetHandler = (sessionId: string, requestId?: string) => void;
export type ProviderSettingsSetHandler = (
  sessionId: string,
  providerId: string,
  entry: { apiKey?: string; apiBaseUrl?: string; resourceName?: string },
  defaults?: {
    providerId?: string;
    modelId?: string;
    imageProviderId?: string;
    imageModelId?: string;
  },
  requestId?: string,
) => void;
export type ProviderSettingsTestHandler = (
  sessionId: string,
  providerId: string,
  requestId?: string,
  candidate?: { apiKey?: string; apiBaseUrl?: string; baseUrl?: string },
) => void;

/** Outbound sender for one connected client (any transport). */
export interface HarnessClientSender {
  sendText: (text: string) => void;
  isOpen: () => boolean;
}

/** Diagnostic counters for fan-out health (no drops: every client gets every event). */
export interface HubBroadcastStats {
  broadcasts: number;
  deliveries: number;
  sendErrors: number;
  prunedDeadClients: number;
}

const REPLAY_YIELD_EVERY = 25;

export class HarnessHub {
  private sessionClients = new Map<string, Set<HarnessClientSender>>();
  private broadcastStats: HubBroadcastStats = {
    broadcasts: 0,
    deliveries: 0,
    sendErrors: 0,
    prunedDeadClients: 0,
  };
  private onCancelHandler?: SessionCancelHandler;
  private onSteerHandler?: SessionSteerHandler;
  private onCheckpointHandler?: CheckpointResponseHandler;
  private onPromptAnswerHandler?: PromptAnswerHandler;
  private onConsentAnswerHandler?: ConsentAnswerHandler;
  private onSettingsSyncHandler?: SettingsSyncHandler;
  private onBlueprintResponseHandler?: BlueprintResponseHandler;
  private onVersionsListHandler?: VersionsListHandler;
  private onVersionsRestoreHandler?: VersionsRestoreHandler;
  private onTurnStartHandler?: TurnStartHandler;
  private onProviderSettingsGetHandler?: ProviderSettingsGetHandler;
  private onProviderSettingsSetHandler?: ProviderSettingsSetHandler;
  private onMcpOAuthStartHandler?: McpOAuthStartHandler;
  private onProviderSettingsTestHandler?: ProviderSettingsTestHandler;

  /** Diagnostic snapshot of fan-out health. */
  getBroadcastStats(): HubBroadcastStats {
    return { ...this.broadcastStats };
  }

  /** Register a client sender; returns an unsubscribe function. */
  addClient(sessionId: string, sender: HarnessClientSender): () => void {
    let clients = this.sessionClients.get(sessionId);
    if (!clients) {
      clients = new Set();
      this.sessionClients.set(sessionId, clients);
    }
    clients.add(sender);
    sender.sendText(JSON.stringify({ type: "subscribed", sessionId }));
    void this.replaySession(sessionId, sender).catch(() => {});
    return () => {
      const current = this.sessionClients.get(sessionId);
      if (current) {
        current.delete(sender);
        if (current.size === 0) this.sessionClients.delete(sessionId);
      }
    };
  }

  /** Route one inbound text frame from a client. */
  handleText(sender: HarnessClientSender, raw: string): void {
    let msg: ClientInboundMessage;
    try {
      msg = JSON.parse(raw) as ClientInboundMessage;
    } catch {
      return;
    }
    if (msg.type === "ping") {
      sender.sendText(JSON.stringify({ type: "pong", time: Date.now() }));
      return;
    }
    if (msg.type === "subscribe" && msg.sessionId) {
      // Re-subscribes are additive; the connection-level client stays put.
      let clients = this.sessionClients.get(msg.sessionId);
      if (!clients) {
        clients = new Set();
        this.sessionClients.set(msg.sessionId, clients);
      }
      clients.add(sender);
      sender.sendText(JSON.stringify({ type: "subscribed", sessionId: msg.sessionId }));
      void this.replaySession(msg.sessionId, sender).catch(() => {});
      return;
    }
    if (msg.type === "steer" && msg.sessionId && msg.prompt) {
      this.onSteerHandler?.(msg.sessionId, msg.prompt);
      return;
    }
    if (msg.type === "cancel" && msg.sessionId) {
      this.onCancelHandler?.(msg.sessionId, "User cancelled from web client");
      return;
    }
    if (msg.type === "checkpoint_response" && msg.sessionId && msg.checkpointId) {
      this.onCheckpointHandler?.(
        msg.sessionId,
        msg.checkpointId,
        msg.approved ?? true,
        msg.feedback,
      );
      return;
    }
    if (msg.type === "prompt_answer" && msg.requestId) {
      this.onPromptAnswerHandler?.(msg.requestId, msg.answers ?? null);
      return;
    }
    if (msg.type === "consent_answer" && msg.requestId) {
      this.onConsentAnswerHandler?.(msg.requestId, msg.decision ?? "decline");
      return;
    }
    if (msg.type === "settings_sync" && msg.sessionId) {
      this.onSettingsSyncHandler?.(msg.sessionId, msg.settings ?? {});
      return;
    }
    if (msg.type === "blueprint_response" && msg.sessionId) {
      this.onBlueprintResponseHandler?.(
        msg.sessionId,
        msg.approved ?? false,
        msg.blueprint,
        msg.feedback,
      );
      return;
    }
    if (msg.type === "versions_list" && msg.sessionId) {
      this.onVersionsListHandler?.(msg.sessionId);
      return;
    }
    if (msg.type === "versions_restore" && msg.sessionId && msg.hash) {
      this.onVersionsRestoreHandler?.(msg.sessionId, msg.hash);
      return;
    }
    if (msg.type === "turn_start" && msg.sessionId && msg.turn) {
      this.onTurnStartHandler?.(msg.sessionId, msg.turn);
      return;
    }
    if (msg.type === "provider_settings_get" && msg.sessionId) {
      this.onProviderSettingsGetHandler?.(msg.sessionId, msg.requestId);
      return;
    }
    if (msg.type === "provider_settings_set" && msg.sessionId && msg.provider?.id) {
      this.onProviderSettingsSetHandler?.(
        msg.sessionId,
        msg.provider.id,
        {
          apiKey: msg.providerEntry?.apiKey,
          apiBaseUrl: msg.providerEntry?.apiBaseUrl,
          resourceName: msg.providerEntry?.resourceName,
        },
        msg.defaults,
        msg.requestId,
      );
      return;
    }
    if (msg.type === "provider_settings_test" && msg.sessionId && msg.provider?.id) {
      const candidate =
        (msg.providerEntry as { apiKey?: string; apiBaseUrl?: string }) ??
        (msg.apiKey
          ? {
              apiKey: String(msg.apiKey),
              apiBaseUrl: msg.baseUrl ? String(msg.baseUrl) : undefined,
            }
          : undefined);
      this.onProviderSettingsTestHandler?.(
        msg.sessionId,
        msg.provider.id,
        msg.requestId,
        candidate,
      );
      return;
    }
    if (msg.type === "mcp_oauth_start" && msg.sessionId && msg.serverId && msg.serverUrl) {
      this.onMcpOAuthStartHandler?.(msg.sessionId, {
        serverId: msg.serverId,
        serverUrl: msg.serverUrl,
        ...(msg.clientId ? { clientId: String(msg.clientId) } : {}),
        ...(msg.scope ? { scope: String(msg.scope) } : {}),
        ...(typeof msg.callbackPort === "number" ? { callbackPort: msg.callbackPort } : {}),
        ...(msg.requestId ? { requestId: msg.requestId } : {}),
      });
      return;
    }
  }

  broadcastToSession(sessionId: string, event: HarnessEvent): void {
    const clients = this.sessionClients.get(sessionId);
    if (!clients || clients.size === 0) return;
    this.broadcastStats.broadcasts += 1;
    const payload = JSON.stringify(event);
    for (const client of [...clients]) {
      // Prune dead senders so a disconnected tab never accumulates.
      if (!client.isOpen()) {
        clients.delete(client);
        if (clients.size === 0) this.sessionClients.delete(sessionId);
        this.broadcastStats.prunedDeadClients += 1;
        continue;
      }
      // Isolate per-client send failures: one broken socket must not kill
      // fan-out to the remaining clients of the session.
      try {
        client.sendText(payload);
        this.broadcastStats.deliveries += 1;
      } catch {
        clients.delete(client);
        if (clients.size === 0) this.sessionClients.delete(sessionId);
        this.broadcastStats.sendErrors += 1;
      }
    }
  }

  /** Send the durable event tail to a (re)subscribing client. */
  async replaySession(sessionId: string, sender: HarnessClientSender): Promise<void> {
    const events = await readHarnessEvents(sessionId);
    // Withdrawn (superseded/cancelled) prompts never replay, even if their
    // waiter survived in memory — the withdrawal is the durable truth.
    const withdrawn = new Set<string>();
    for (const event of events) {
      if (event.type === "ui_prompt_withdraw") withdrawn.add(event.requestId);
    }
    let sinceYield = 0;
    for (const event of events) {
      if (!sender.isOpen()) return;
      const clients = this.sessionClients.get(sessionId);
      if (!clients?.has(sender)) return;
      if (event.type === "ui_prompt_withdraw") continue;
      if (event.type === "ui_prompt") {
        const requestId = (event as { requestId?: unknown }).requestId;
        // Skip settled prompts: every settle path (answer, dismiss, cancel,
        // supersede) persists a withdrawal tombstone first, so "no tombstone"
        // is the durable definition of live — restart-safe, unlike the old
        // in-memory waiter check which dropped live cards after a restart.
        if (typeof requestId === "string" && withdrawn.has(requestId)) continue;
      }
      sender.sendText(JSON.stringify(event));
      sinceYield += 1;
      // Cooperative yield so a 200-event tail never blocks the event loop.
      if (sinceYield >= REPLAY_YIELD_EVERY) {
        sinceYield = 0;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }

  onCancel(handler: SessionCancelHandler): void {
    this.onCancelHandler = handler;
  }

  onSteer(handler: SessionSteerHandler): void {
    this.onSteerHandler = handler;
  }

  onCheckpointResponse(handler: CheckpointResponseHandler): void {
    this.onCheckpointHandler = handler;
  }

  onPromptAnswer(handler: PromptAnswerHandler): void {
    this.onPromptAnswerHandler = handler;
  }

  onConsentAnswer(handler: ConsentAnswerHandler): void {
    this.onConsentAnswerHandler = handler;
  }

  onSettingsSync(handler: SettingsSyncHandler): void {
    this.onSettingsSyncHandler = handler;
  }

  onBlueprintResponse(handler: BlueprintResponseHandler): void {
    this.onBlueprintResponseHandler = handler;
  }

  onVersionsList(handler: VersionsListHandler): void {
    this.onVersionsListHandler = handler;
  }

  onVersionsRestore(handler: VersionsRestoreHandler): void {
    this.onVersionsRestoreHandler = handler;
  }

  onTurnStart(handler: TurnStartHandler): void {
    this.onTurnStartHandler = handler;
  }

  onProviderSettingsGet(handler: ProviderSettingsGetHandler): void {
    this.onProviderSettingsGetHandler = handler;
  }

  onProviderSettingsSet(handler: ProviderSettingsSetHandler): void {
    this.onProviderSettingsSetHandler = handler;
  }

  onProviderSettingsTest(handler: ProviderSettingsTestHandler): void {
    this.onProviderSettingsTestHandler = handler;
  }

  onMcpOAuthStart(handler: McpOAuthStartHandler): void {
    this.onMcpOAuthStartHandler = handler;
  }
}

let shared: HarnessHub | null = null;
/** Process-wide hub: the Effect route and the gateway share it. */
export function sharedHarnessHub(): HarnessHub {
  if (!shared) shared = new HarnessHub();
  return shared;
}
