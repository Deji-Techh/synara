// FILE: gateway.ts
// Purpose: M3h — server-side turn gateway. Owns one CaideRunner plus a
// per-session Inbox map, and binds a HarnessHub to them:
// subscribe (handled by the server) → startHarnessTurn on first client steer
// or explicit start; steer → inbox.steer (picked up at the next loop step);
// cancel → runner.cancel. All turn events fan out to session subscribers.
// The HTTP upgrade mount lands with the server bootstrap; everything else
// here is live and tested.

import type { HarnessEvent } from "@caide/contracts";
import { resolveProviderDefaultModel } from "../../dyad/providers/index.ts";
import { Inbox } from "../inbox/index.ts";
import { HarnessHub } from "../ws/hub.ts";
import { attachUiBridge, withdrawSessionPrompts } from "../ws/uiBridge.ts";
import { approveBlueprint, type AppBlueprint } from "../../dyad/plan/blueprintStore.ts";
import { sharedProviderSecrets } from "../../dyad/providers/secrets.ts";
import { PROVIDERS, validateProviderSettings } from "../../dyad/providers/providers.ts";
import { testProviderConnection } from "../../dyad/providers/testConnection.ts";
import type { SettingsLike } from "../../dyad/providers/index.ts";
import type { ConsentRequestFn } from "../../dyad/tools/permissions.ts";
import type { McpConsentRequestFn } from "../../dyad/mcp/mcpConsent.ts";
import { CaideRunner, type StartTurnInput } from "./runner.ts";
import { appendHarnessEvent } from "./eventLog.ts";
import { clearSessionApp, getSessionApp, noteSessionApp } from "./sessionStores.ts";
import { listVersions, restoreVersion } from "../../dyad/vcs/versions.ts";

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
  runtimeMode?: StartTurnInput["runtimeMode"];
}

/**
 * Transcript mirror: projects harness turn events into the thread transcript
 * (the same projection the legacy engine writes) so harness chats read like
 * normal chats — user bubble + assistant text, hero dismissed. Rich harness
 * cards (tools, todos, consent) stay in the dock transcript; the mirror only
 * carries user/assistant text. Registered by the composition that owns
 * threads (harnessCompat); null by default, in which case turns stay
 * harness-transcript-only.
 */
export interface TranscriptMirror {
  mirrorHarnessTurnEvent(event: HarnessEvent): void;
}

let transcriptMirror: TranscriptMirror | null = null;

export function setTranscriptMirror(mirror: TranscriptMirror | null): void {
  transcriptMirror = mirror;
}

export function getTranscriptMirror(): TranscriptMirror | null {
  return transcriptMirror;
}

export class TurnGateway {
  private runner = new CaideRunner();
  private inboxes = new Map<string, Inbox>();
  private ws: HarnessHub | null = null;
  private uiDetach: (() => void) | null = null;
  private requestConsent: ConsentRequestFn | null = null;
  private requestMcpConsent: McpConsentRequestFn | null = null;

  /**
   * Steer a live turn, or launch a fresh turn when none is running. Steers
   * into a dead inbox go nowhere (plan continue-gates and blueprint
   * approvals arrive after their turn ended) — the approval then looks
   * accepted while the agent never replies.
   */
  private steerOrLaunch(server: HarnessHub, sessionId: string, prompt: string): void {
    if (this.runner.hasLiveTurn(sessionId)) {
      this.getInbox(sessionId).steer(prompt);
      // Persist steers: the live loop consumes them in-turn, but later turns
      // would otherwise never see approvals/follow-ups (turn amnesia).
      void appendHarnessEvent({ type: "steer", sessionId, prompt }).catch(() => undefined);
      return;
    }
    const appPath = getSessionApp(sessionId);
    if (!appPath) {
      try {
        server.broadcastToSession(sessionId, {
          type: "error",
          sessionId,
          code: "STEER_WITHOUT_TURN",
          message: "Nothing is running to continue — send a new message to start.",
          recoverable: true,
        });
      } catch {
        // socket dead; nothing to settle
      }
      return;
    }
    void this.startTurn({ sessionId, appPath, prompt }).catch((err) => {
      try {
        server.broadcastToSession(sessionId, {
          type: "error",
          sessionId,
          code: "TURN_START_FAILED",
          message: err instanceof Error ? err.message : String(err),
          recoverable: true,
        });
      } catch {
        // last resort: socket itself is dead
      }
    });
  }
  /** Attach a WS server: bridge UI transports + steer/cancel bindings. */
  attachWs(server: HarnessHub): void {
    this.ws = server;
    const bridge = attachUiBridge(server);
    this.requestConsent = bridge.requestConsent;
    this.requestMcpConsent = bridge.requestMcpConsent;
    this.uiDetach = bridge.detach;
    server.onTurnStart((sessionId, turn) => {
      noteSessionApp(sessionId, turn.appPath);
      void this.startTurn({
        sessionId,
        appPath: turn.appPath,
        prompt: turn.prompt,
        mode: turn.mode,
        framework: turn.framework,
        providerId: turn.providerId,
        modelId: turn.modelId,
        maxSteps: turn.maxSteps,
        ...(turn.runtimeMode ? { runtimeMode: turn.runtimeMode } : {}),
        settings: turn.providerSettings ? { providerSettings: turn.providerSettings } : undefined,
      }).catch((err) => {
        // Never swallow: a turn that dies before emitting would otherwise
        // leave the client staring at its own echo with zero feedback.
        try {
          server.broadcastToSession(sessionId, {
            type: "error",
            sessionId,
            code: "TURN_START_FAILED",
            message: err instanceof Error ? err.message : String(err),
            recoverable: true,
          });
        } catch {
          // last resort: socket itself is dead
        }
      });
    });
    server.onSteer((sessionId, prompt) => {
      this.steerOrLaunch(server, sessionId, prompt);
    });
    server.onProviderSettingsGet((sessionId, requestId) => {
      this.sendProviderState(server, sessionId, requestId);
    });
    server.onProviderSettingsSet((sessionId, providerId, entry, defaults, requestId) => {
      const secrets = sharedProviderSecrets();
      let validation: { ok: boolean; message: string } | undefined;
      // Empty entries (defaults-only saves) must not clobber stored keys.
      if (entry.apiKey || entry.apiBaseUrl || entry.resourceName) {
        if (!PROVIDERS[providerId]) {
          validation = validateProviderSettings(providerId, entry);
        } else {
          const stored = secrets.read().providers[providerId] ?? {};
          const merged = {
            apiKey: entry.apiKey?.trim() ? entry.apiKey : stored.apiKey,
            apiBaseUrl: entry.apiBaseUrl?.trim() ? entry.apiBaseUrl : stored.apiBaseUrl,
            resourceName: entry.resourceName?.trim() ? entry.resourceName : stored.resourceName,
          };
          validation = validateProviderSettings(providerId, merged);
          secrets.setProvider(providerId, entry);
        }
      }
      if (
        defaults &&
        (defaults.providerId !== undefined ||
          defaults.modelId !== undefined ||
          defaults.imageProviderId !== undefined ||
          defaults.imageModelId !== undefined)
      ) {
        secrets.setDefaults(
          defaults.providerId,
          defaults.modelId,
          defaults.imageProviderId,
          defaults.imageModelId,
        );
      }
      this.sendProviderState(
        server,
        sessionId,
        requestId,
        validation ? { [providerId]: validation } : undefined,
      );
    });
    server.onProviderSettingsTest((sessionId, providerId, requestId, candidate) => {
      void (async () => {
        const secrets = sharedProviderSecrets();
        const stored = secrets.read().providers[providerId] ?? {};
        const apiKey = candidate?.apiKey?.trim() || stored.apiKey;
        const baseUrl =
          candidate?.apiBaseUrl?.trim() || candidate?.baseUrl?.trim() || stored.apiBaseUrl;
        const result = await testProviderConnection({
          providerId,
          apiKey,
          baseUrl,
        }).catch((err) => ({
          ok: false,
          message: err instanceof Error ? err.message : String(err),
        }));
        this.sendProviderState(server, sessionId, requestId, { [providerId]: result });
      })();
    });
    server.onCancel((sessionId, reason) => {
      // Withdraw parked questionnaire/env cards first (captures the live
      // requestIds), then cancel the turn — runner.cancel re-clears as a
      // no-op for non-WS paths.
      withdrawSessionPrompts(server, sessionId);
      this.runner.cancel(sessionId, reason ?? "cancelled");
    });
    server.onVersionsList((sessionId) => {
      void (async () => {
        const appPath = getSessionApp(sessionId);
        if (!appPath) return;
        try {
          const versions = await listVersions(appPath, 30);
          server.broadcastToSession(sessionId, {
            type: "versions_state",
            sessionId,
            versions: versions.map((v) => ({
              hash: v.hash,
              message: v.message,
              createdAt: v.createdAt,
            })),
          });
        } catch {
          // listing never fails the session
        }
      })();
    });
    server.onVersionsRestore((sessionId, hash) => {
      void (async () => {
        const appPath = getSessionApp(sessionId);
        if (!appPath) return;
        try {
          await restoreVersion(appPath, hash);
          const versions = await listVersions(appPath, 30);
          server.broadcastToSession(sessionId, {
            type: "versions_state",
            sessionId,
            versions: versions.map((v) => ({
              hash: v.hash,
              message: v.message,
              createdAt: v.createdAt,
            })),
          });
        } catch (err) {
          server.broadcastToSession(sessionId, {
            type: "error",
            sessionId,
            code: "VERSION_RESTORE_FAILED",
            message: err instanceof Error ? err.message : String(err),
            recoverable: true,
          });
        }
      })();
    });
    server.onBlueprintResponse((sessionId, approved, blueprint, feedback) => {
      if (approved) {
        const stored = approveBlueprint(
          sessionId,
          (blueprint ?? undefined) as AppBlueprint | undefined,
        );
        const name = stored?.appName ?? "the app";
        // Ground the follow-up with the APPROVED CONTENT, not just its name:
        // a fresh turn otherwise sees "blueprint approved" with no idea what
        // was approved (turn amnesia). Cap the JSON so huge visual lists
        // don't flood context.
        const blueprintJson = stored ? JSON.stringify(stored).slice(0, 4000) : "";
        this.steerOrLaunch(
          server,
          sessionId,
          `The app blueprint for "${name}" has been approved. Proceed with implementation using it to guide file creation, design tokens, and visual assets.` +
            (blueprintJson ? `\n\nApproved blueprint:\n${blueprintJson}` : ""),
        );
      } else {
        this.steerOrLaunch(
          server,
          sessionId,
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
  async startTurn(request: GatewayTurnRequest, extra?: Partial<StartTurnInput>): Promise<string> {
    const resolved = resolveTurnProviders(request);
    noteSessionApp(request.sessionId, request.appPath);
    const inbox = this.getInbox(request.sessionId);
    const broadcast = (event: HarnessEvent): void => {
      extra?.onEvent?.(event);
      this.ws?.broadcastToSession(request.sessionId, event);
      // Mirror user/assistant text + tool calls into the thread transcript
      // (normal-chat look with inline Antigravity tool groups). Mirror
      // failures must never break the turn or the socket fan-out.
      if (
        event.type === "turn_start" ||
        event.type === "token" ||
        event.type === "tool_call" ||
        event.type === "error" ||
        event.type === "turn_end"
      ) {
        try {
          transcriptMirror?.mirrorHarnessTurnEvent(event);
        } catch {
          // transcript projection is best-effort
        }
      }
    };
    return this.runner.startTurn({
      ...request,
      providerId: resolved.providerId,
      modelId: resolved.modelId,
      settings: resolved.settings,
      // Session inbox doubles as the duplicate-send target: a second send
      // while the turn runs steers into the live loop instead of forking.
      inbox: this.getInbox(request.sessionId),
      requestConsent: extra?.requestConsent ?? this.requestConsent ?? undefined,
      requestMcpConsent: extra?.requestMcpConsent ?? this.requestMcpConsent ?? undefined,
      onEvent: broadcast,
      ...extra,
      // extra.onEvent already invoked above; keep broadcast as the sink.
      onEvent: broadcast,
    });
  }

  cancelTurn(sessionId: string, cause?: string): void {
    if (this.ws) withdrawSessionPrompts(this.ws, sessionId);
    this.runner.cancel(sessionId, cause);
    // Always settle the UI: a turn that died without its own turn_end leaves
    // the Stop button latched on a dead turn otherwise. An in-flight turn
    // ends itself with its own turn_end right after; both are idempotent
    // client-side (liveTurnId cleared, prompts dropped).
    try {
      this.ws?.broadcastToSession(sessionId, {
        type: "turn_end",
        sessionId,
        turnId: "settled",
        status: "cancelled",
      });
    } catch {
      // socket dead; nothing to settle
    }
  }

  private sendProviderState(
    server: HarnessHub,
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
      ...(view.defaultImageProviderId
        ? { defaultImageProviderId: view.defaultImageProviderId }
        : {}),
      ...(view.defaultImageModelId ? { defaultImageModelId: view.defaultImageModelId } : {}),
      ...(tests ? { tests } : {}),
    });
  }

  dropSession(sessionId: string): void {
    this.inboxes.delete(sessionId);
    this.runner.dropSession(sessionId);
    clearSessionApp(sessionId);
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
  const clean = (value: string | undefined): string | undefined => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
  };
  const providerId = clean(request.providerId) ?? clean(stored.defaultProviderId);
  const rawModel = clean(request.modelId) ?? clean(stored.defaultModelId);
  // Never forward placeholder slugs to a provider endpoint: "auto"/"default"
  // 404 verbatim (e.g. Gemini "models/auto is not found"). Resolve to the
  // provider's concrete default; unknown providers stay undefined and fail
  // loudly at connection time instead of sending a literal placeholder.
  const modelId = providerId
    ? (resolveProviderDefaultModel(providerId, rawModel) ?? undefined)
    : rawModel;
  return {
    providerId,
    modelId,
    settings: request.settings ?? sharedProviderSecrets().toSettings(),
  };
}
