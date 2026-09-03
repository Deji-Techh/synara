// FILE: server.ts
// Purpose: Raw-ws HarnessWebSocketServer — thin adapter over HarnessHub for
// tests and standalone embedding. Production traffic rides the Effect route
// (harnessRouteLayer) on the same upgrade pipeline as RPC/device-frame.

import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import { HarnessHub, type HarnessClientSender } from "./hub.ts";

export type {
  ClientInboundMessage,
  TurnStartPayload,
  SessionCancelHandler,
  SessionSteerHandler,
  CheckpointResponseHandler,
  PromptAnswerHandler,
  ConsentAnswerHandler,
  SettingsSyncHandler,
  BlueprintResponseHandler,
  TurnStartHandler,
  ProviderSettingsGetHandler,
  ProviderSettingsSetHandler,
  ProviderSettingsTestHandler,
} from "./hub.ts";

export class HarnessWebSocketServer {
  private wss: WebSocketServer;
  private hub: HarnessHub;

  constructor(hub?: HarnessHub) {
    this.hub = hub ?? new HarnessHub();
    this.wss = new WebSocketServer({ noServer: true });
    this.setupWss();
  }

  /** The underlying hub (gateway binds here in embedded use). */
  getHub(): HarnessHub {
    return this.hub;
  }

  private setupWss(): void {
    this.wss.on("connection", (ws: WebSocket) => {
      let release: (() => void) | null = null;
      const sender: HarnessClientSender = {
        sendText: (text: string) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(text);
        },
        isOpen: () => ws.readyState === WebSocket.OPEN,
      };

      ws.on("message", (raw: string) => {
        // Subscribe registers (ack + replay live in the hub); everything
        // else routes through hub dispatch exactly once.
        try {
          const msg = JSON.parse(raw.toString()) as { type?: string; sessionId?: string };
          if (msg.type === "subscribe" && msg.sessionId) {
            release?.();
            release = this.hub.addClient(msg.sessionId, sender);
            return;
          }
        } catch {
          // fall through to hub dispatch (handles malformed safely)
        }
        this.hub.handleText(sender, raw.toString());
      });

      ws.on("close", () => {
        release?.();
        release = null;
      });
    });
  }

  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.wss.emit("connection", ws, req);
    });
  }

  broadcastToSession(
    sessionId: string,
    event: Parameters<HarnessHub["broadcastToSession"]>[1],
  ): void {
    this.hub.broadcastToSession(sessionId, event);
  }

  onCancel(handler: Parameters<HarnessHub["onCancel"]>[0]): void {
    this.hub.onCancel(handler);
  }

  onSteer(handler: Parameters<HarnessHub["onSteer"]>[0]): void {
    this.hub.onSteer(handler);
  }

  onCheckpointResponse(handler: Parameters<HarnessHub["onCheckpointResponse"]>[0]): void {
    this.hub.onCheckpointResponse(handler);
  }

  onPromptAnswer(handler: Parameters<HarnessHub["onPromptAnswer"]>[0]): void {
    this.hub.onPromptAnswer(handler);
  }

  onConsentAnswer(handler: Parameters<HarnessHub["onConsentAnswer"]>[0]): void {
    this.hub.onConsentAnswer(handler);
  }

  onSettingsSync(handler: Parameters<HarnessHub["onSettingsSync"]>[0]): void {
    this.hub.onSettingsSync(handler);
  }

  onBlueprintResponse(handler: Parameters<HarnessHub["onBlueprintResponse"]>[0]): void {
    this.hub.onBlueprintResponse(handler);
  }

  onTurnStart(handler: Parameters<HarnessHub["onTurnStart"]>[0]): void {
    this.hub.onTurnStart(handler);
  }

  onProviderSettingsGet(handler: Parameters<HarnessHub["onProviderSettingsGet"]>[0]): void {
    this.hub.onProviderSettingsGet(handler);
  }

  onProviderSettingsSet(handler: Parameters<HarnessHub["onProviderSettingsSet"]>[0]): void {
    this.hub.onProviderSettingsSet(handler);
  }

  onProviderSettingsTest(handler: Parameters<HarnessHub["onProviderSettingsTest"]>[0]): void {
    this.hub.onProviderSettingsTest(handler);
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.wss.close(() => resolve()));
  }
}
