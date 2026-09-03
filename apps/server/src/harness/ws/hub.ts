// FILE: hub.ts
// Purpose: Transport-agnostic harness session hub: client registry,
// inbound message dispatch, typed broadcasts, and reconnect replay.
// The raw-ws server (tests, standalone embedding) and the Effect route
// (production, same upgrade pipeline as RPC/device-frame) both drive it.
// One shared instance serves the server; gateway.attachWs binds a hub.

import type { HarnessEvent } from "@caide/contracts";
import { readHarnessEvents } from "../turn/eventLog.ts";

export interface ClientInboundMessage {
  type: "subscribe" | "steer" | "cancel" | "checkpoint_response" | "ping" | "prompt_answer" | "consent_answer" | "settings_sync" | "blueprint_response" | "turn_start" | "provider_settings_get" | "provider_settings_set" | "provider_settings_test";
  sessionId?: string;
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
  provider?: { id?: string; apiKey?: string; apiBaseUrl?: string; resourceName?: string };
  providerEntry?: { apiKey?: string; apiBaseUrl?: string; resourceName?: string };
  defaults?: { providerId?: string; modelId?: string };
}

export interface TurnStartPayload {
  appPath: string;
  prompt: string;
  mode?: "build" | "ask" | "agent" | "plan";
  framework?: "blank" | "react-native" | "flutter" | "website";
  providerId?: string;
  modelId?: string;
  maxSteps?: number;
  providerSettings?: Record<string, { apiKey?: { value?: string | null } | string | null; apiBaseUrl?: string | null; baseUrl?: string | null; resourceName?: string | null }>;
}

export type SessionCancelHandler = (sessionId: string, reason?: string) => void;
export type SessionSteerHandler = (sessionId: string, prompt: string) => void;
export type CheckpointResponseHandler = (
  sessionId: string,
  checkpointId: string,
  approved: boolean,
  feedback?: string,
) => void;
export type PromptAnswerHandler = (requestId: string, answers: Record<string, string> | null) => void;
export type ConsentAnswerHandler = (
  requestId: string,
  decision: "accept-once" | "accept-always" | "decline",
) => void;
export type SettingsSyncHandler = (sessionId: string, settings: Record<string, unknown>) => void;
export type BlueprintResponseHandler = (
  sessionId: string,
  approved: boolean,
  blueprint?: Record<string, unknown>,
  feedback?: string,
) => void;
export type TurnStartHandler = (sessionId: string, turn: TurnStartPayload) => void;
export type ProviderSettingsGetHandler = (sessionId: string, requestId?: string) => void;
export type ProviderSettingsSetHandler = (
  sessionId: string,
  providerId: string,
  entry: { apiKey?: string; apiBaseUrl?: string; resourceName?: string },
  defaults?: { providerId?: string; modelId?: string },
  requestId?: string,
) => void;
export type ProviderSettingsTestHandler = (
  sessionId: string,
  providerId: string,
  requestId?: string,
) => void;

/** Outbound sender for one connected client (any transport). */
export interface HarnessClientSender {
  sendText: (text: string) => void;
  isOpen: () => boolean;
}

export class HarnessHub {
  private sessionClients = new Map<string, Set<HarnessClientSender>>();
  private onCancelHandler?: SessionCancelHandler;
  private onSteerHandler?: SessionSteerHandler;
  private onCheckpointHandler?: CheckpointResponseHandler;
  private onPromptAnswerHandler?: PromptAnswerHandler;
  private onConsentAnswerHandler?: ConsentAnswerHandler;
  private onSettingsSyncHandler?: SettingsSyncHandler;
  private onBlueprintResponseHandler?: BlueprintResponseHandler;
  private onTurnStartHandler?: TurnStartHandler;
  private onProviderSettingsGetHandler?: ProviderSettingsGetHandler;
  private onProviderSettingsSetHandler?: ProviderSettingsSetHandler;
  private onProviderSettingsTestHandler?: ProviderSettingsTestHandler;

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
      this.onCheckpointHandler?.(msg.sessionId, msg.checkpointId, msg.approved ?? true, msg.feedback);
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
      this.onBlueprintResponseHandler?.(msg.sessionId, msg.approved ?? false, msg.blueprint, msg.feedback);
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
      this.onProviderSettingsTestHandler?.(msg.sessionId, msg.provider.id, msg.requestId);
      return;
    }
  }

  broadcastToSession(sessionId: string, event: HarnessEvent): void {
    const clients = this.sessionClients.get(sessionId);
    if (!clients || clients.size === 0) return;
    const payload = JSON.stringify(event);
    for (const client of clients) {
      if (client.isOpen()) client.sendText(payload);
    }
  }

  /** Send the durable event tail to a (re)subscribing client. */
  async replaySession(sessionId: string, sender: HarnessClientSender): Promise<void> {
    const events = await readHarnessEvents(sessionId);
    for (const event of events) {
      if (!sender.isOpen()) return;
      const clients = this.sessionClients.get(sessionId);
      if (!clients?.has(sender)) return;
      sender.sendText(JSON.stringify(event));
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
}

let shared: HarnessHub | null = null;
/** Process-wide hub: the Effect route and the gateway share it. */
export function sharedHarnessHub(): HarnessHub {
  if (!shared) shared = new HarnessHub();
  return shared;
}
