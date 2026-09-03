import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import type { HarnessEvent } from "@caide/contracts";

export interface ClientInboundMessage {
  type: "subscribe" | "steer" | "cancel" | "checkpoint_response" | "ping" | "prompt_answer" | "consent_answer" | "settings_sync" | "blueprint_response";
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

export class HarnessWebSocketServer {
  private wss: WebSocketServer;
  private sessionClients = new Map<string, Set<WebSocket>>();
  private onCancelHandler?: SessionCancelHandler;
  private onSteerHandler?: SessionSteerHandler;
  private onCheckpointHandler?: CheckpointResponseHandler;
  private onPromptAnswerHandler?: PromptAnswerHandler;
  private onConsentAnswerHandler?: ConsentAnswerHandler;
  private onSettingsSyncHandler?: SettingsSyncHandler;
  private onBlueprintResponseHandler?: BlueprintResponseHandler;

  constructor() {
    this.wss = new WebSocketServer({ noServer: true });
    this.setupWss();
  }

  private setupWss(): void {
    this.wss.on("connection", (ws: WebSocket) => {
      let currentSessionId: string | null = null;

      ws.on("message", (raw: string) => {
        try {
          const msg = JSON.parse(raw.toString()) as ClientInboundMessage;

          if (msg.type === "ping") {
            ws.send(JSON.stringify({ type: "pong", time: Date.now() }));
            return;
          }

          if (msg.type === "subscribe" && msg.sessionId) {
            currentSessionId = msg.sessionId;
            let clients = this.sessionClients.get(msg.sessionId);
            if (!clients) {
              clients = new Set();
              this.sessionClients.set(msg.sessionId, clients);
            }
            clients.add(ws);
            ws.send(JSON.stringify({ type: "subscribed", sessionId: msg.sessionId }));
            return;
          }

          if (msg.type === "steer" && msg.sessionId && msg.prompt) {
            if (this.onSteerHandler) {
              this.onSteerHandler(msg.sessionId, msg.prompt);
            }
            return;
          }

          if (msg.type === "cancel" && msg.sessionId) {
            if (this.onCancelHandler) {
              this.onCancelHandler(msg.sessionId, "User cancelled from web client");
            }
            return;
          }

          if (msg.type === "checkpoint_response" && msg.sessionId && msg.checkpointId) {
            if (this.onCheckpointHandler) {
              this.onCheckpointHandler(
                msg.sessionId,
                msg.checkpointId,
                msg.approved ?? true,
                msg.feedback,
              );
            }
            return;
          }

          if (msg.type === "prompt_answer" && msg.requestId) {
            if (this.onPromptAnswerHandler) {
              this.onPromptAnswerHandler(msg.requestId, msg.answers ?? null);
            }
            return;
          }

          if (msg.type === "consent_answer" && msg.requestId) {
            if (this.onConsentAnswerHandler) {
              this.onConsentAnswerHandler(msg.requestId, msg.decision ?? "decline");
            }
            return;
          }

          if (msg.type === "settings_sync" && msg.sessionId) {
            if (this.onSettingsSyncHandler) {
              this.onSettingsSyncHandler(msg.sessionId, msg.settings ?? {});
            }
            return;
          }

          if (msg.type === "blueprint_response" && msg.sessionId) {
            if (this.onBlueprintResponseHandler) {
              this.onBlueprintResponseHandler(
                msg.sessionId,
                msg.approved ?? false,
                msg.blueprint,
                msg.feedback,
              );
            }
            return;
          }
        } catch {
          // ignore malformed client message
        }
      });

      ws.on("close", () => {
        if (currentSessionId) {
          const clients = this.sessionClients.get(currentSessionId);
          if (clients) {
            clients.delete(ws);
            if (clients.size === 0) {
              this.sessionClients.delete(currentSessionId);
            }
          }
        }
      });
    });
  }

  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.wss.emit("connection", ws, req);
    });
  }

  broadcastToSession(sessionId: string, event: HarnessEvent): void {
    const clients = this.sessionClients.get(sessionId);
    if (!clients || clients.size === 0) return;

    const payload = JSON.stringify(event);
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
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

  close(): Promise<void> {
    return new Promise((resolve) => this.wss.close(() => resolve()));
  }
}
