// FILE: gateway.ts
// Purpose: M3h — server-side turn gateway. Owns one CaideRunner plus a
// per-session Inbox map, and binds a HarnessWebSocketServer to them:
// subscribe (handled by the server) → startHarnessTurn on first client steer
// or explicit start; steer → inbox.steer (picked up at the next loop step);
// cancel → runner.cancel. All turn events fan out to session subscribers.
// The HTTP upgrade mount lands with the server bootstrap; everything else
// here is live and tested.

import type { HarnessEvent } from "@caide/contracts";
import { Inbox } from "../inbox/index.ts";
import { HarnessWebSocketServer } from "../ws/server.ts";
import { attachUiBridge } from "../ws/uiBridge.ts";
import { approveBlueprint, type AppBlueprint } from "../../dyad/plan/blueprintStore.ts";
import { sharedProviderSecrets } from "../../dyad/providers/secrets.ts";
import { testProviderConnection } from "../../dyad/providers/testConnection.ts";
import type { SettingsLike } from "../../dyad/providers/index.ts";
import type { ConsentRequestFn } from "../../dyad/tools/permissions.ts";
import type { McpConsentRequestFn } from "../../dyad/mcp/mcpConsent.ts";
import { CaideRunner, type StartTurnInput } from "./runner.ts";

export interface GatewayTurnRequest {
  sessionId: string;
  appPath: string;
  prompt: string;
  mode?: StartTurnInput["mode"];
  framework?: StartTurnInput["framework"];
  settings?: StartTurnInput["settings"];
  providerId?: string;
  modelId?: string;
  maxSteps?: number;
}

export class TurnGateway {  private runner = new CaideRunner();
  private inboxes = new Map<string, Inbox>();
  private ws: HarnessWebSocketServer | null = null;
  private uiDetach: (() => void) | null = null;
  private requestConsent: ConsentRequestFn | null = null;
  private requestMcpConsent: McpConsentRequestFn | null = null;

  /** Attach a WS server: bridge UI transports + steer/cancel bindings. */
  attachWs(server: HarnessWebSocketServer): void {
    this.ws = server;
    const bridge = attachUiBridge(server);
    this.requestConsent = bridge.requestConsent;
    this.requestMcpConsent = bridge.requestMcpConsent;
    this.uiDetach = bridge.detach;
    server.onTurnStart((sessionId, turn) => {
      void this.startTurn({
        sessionId,
        appPath: turn.appPath,
        prompt: turn.prompt,
        mode: turn.mode,
        framework: turn.framework,
        providerId: turn.providerId,
        modelId: turn.modelId,
        maxSteps: turn.maxSteps,
        settings: turn.providerSettings ? { providerSettings: turn.providerSettings } : undefined,
      }).catch(() => {});
    });
    server.onSteer((sessionId, prompt) => {
      this.getInbox(sessionId).steer(prompt);
    });
    server.onProviderSettingsGet((sessionId, requestId) => {
      this.sendProviderState(server, sessionId, requestId);
    });
    server.onProviderSettingsSet((sessionId, providerId, entry, defaults, requestId) => {
      const secrets = sharedProviderSecrets();
      secrets.setProvider(providerId, entry);
      if (defaults && (defaults.providerId !== undefined || defaults.modelId !== undefined)) {
        secrets.setDefaults(defaults.providerId, defaults.modelId);
      }
      this.sendProviderState(server, sessionId, requestId);
    });
    server.onProviderSettingsTest((sessionId, providerId, requestId) => {
      void (async () => {
        const secrets = sharedProviderSecrets();
        const stored = secrets.read().providers[providerId] ?? {};
        const result = await testProviderConnection({
          providerId,
          apiKey: stored.apiKey,
          baseUrl: stored.apiBaseUrl,
        }).catch((err) => ({
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        }));
        this.sendProviderState(server, sessionId, requestId, { [providerId]: result });
      })();
    });
    server.onCancel((sessionId, reason) => {
      this.runner.cancel(sessionId, reason ?? "cancelled");
    });
    server.onBlueprintResponse((sessionId, approved, blueprint, feedback) => {
      if (approved) {
        const stored = approveBlueprint(sessionId, (blueprint ?? undefined) as AppBlueprint | undefined);
        const name = stored?.appName ?? "the app";
        this.getInbox(sessionId).steer(
          `The app blueprint for "${name}" has been approved. Proceed with implementation using it to guide file creation, design tokens, and visual assets.`,
        );
      } else {
        this.getInbox(sessionId).steer(
          `The user requested changes to the app blueprint: ${feedback?.trim() || "no details given"}. Update the blueprint with write_app_blueprint and wait for approval again.`,
        );
      }
    });
  }

  detachWs(): void {
    this.uiDetach?.();
    this.uiDetach = null;
    this.ws = null;
    this.requestConsent = null;
    this.requestMcpConsent = null;
  }

  getInbox(sessionId: string): Inbox {
    let inbox = this.inboxes.get(sessionId);
    if (!inbox) {
      inbox = new Inbox();
      this.inboxes.set(sessionId, inbox);
    }
    return inbox;
  }

  /** Start a turn; every event also broadcasts to WS subscribers. */
  async startTurn(
    request: GatewayTurnRequest,
    extra?: Partial<StartTurnInput>,
  ): Promise<string> {
    const resolved = resolveTurnProviders(request);
    const inbox = this.getInbox(request.sessionId);
    const broadcast = (event: HarnessEvent): void => {
      extra?.onEvent?.(event);
      this.ws?.broadcastToSession(request.sessionId, event);
    };
    return this.runner.startTurn({
      ...request,
      providerId: resolved.providerId,
      modelId: resolved.modelId,
      settings: resolved.settings,
      requestConsent: extra?.requestConsent ?? this.requestConsent ?? undefined,
      requestMcpConsent: extra?.requestMcpConsent ?? this.requestMcpConsent ?? undefined,
      onEvent: broadcast,
      ...extra,
      // extra.onEvent already invoked above; keep broadcast as the sink.
      onEvent: broadcast,
    });
  }

  cancelTurn(sessionId: string, cause?: string): void {
    this.runner.cancel(sessionId, cause);
  }

  private sendProviderState(
    server: HarnessWebSocketServer,
    sessionId: string,
    requestId?: string,
    tests?: Record<string, { ok: boolean; message: string }>,
  ): void {
    const view = sharedProviderSecrets().publicView();
    server.broadcastToSession(sessionId, {
      type: "provider_settings_state",
      sessionId,
      ...(requestId ? { requestId } : {}),
      providers: view.providers,
      ...(view.defaultProviderId ? { defaultProviderId: view.defaultProviderId } : {}),
      ...(view.defaultModelId ? { defaultModelId: view.defaultModelId } : {}),
      ...(tests ? { tests } : {}),
    });
  }

  dropSession(sessionId: string): void {
    this.inboxes.delete(sessionId);
  }

  getStatus(): ReturnType<CaideRunner["getStatus"]> {
    return this.runner.getStatus();
  }
}

let shared: TurnGateway | null = null;
/** Process-wide gateway (server bootstrap owns its lifetime). */
export function sharedTurnGateway(): TurnGateway {
  if (!shared) shared = new TurnGateway();
  return shared;
}

/**
 * Provider resolution for a turn: explicit request wins, else the server's
 * stored provider settings (settings UI), else key-based auto in the turn
 * context. Extracted for tests.
 */
export function resolveTurnProviders(request: GatewayTurnRequest): {
  providerId: string | undefined;
  modelId: string | undefined;
  settings: SettingsLike;
} {
  const stored = sharedProviderSecrets().read();
  return {
    providerId: request.providerId ?? stored.defaultProviderId,
    modelId: request.modelId ?? stored.defaultModelId,
    settings: request.settings ?? sharedProviderSecrets().toSettings(),
  };
}
