import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import type { HarnessEvent } from "@caide/contracts";

export interface ClientInboundMessage {
  type: "subscribe" | "steer" | "cancel" | "checkpoint_response" | "ping";
  sessionId?: string;
  token?: string;
  prompt?: string;
  checkpointId?: string;
  approved?: boolean;
  feedback?: string;
}

export type SessionCancelHandler = (sessionId: string, reason?: string) => void;
export type SessionSteerHandler = (sessionId: string, prompt: string) => void;
export type CheckpointResponseHandler = (
  sessionId: string,
  checkpointId: string,
  approved: boolean,
  feedback?: string,
) => void;

export class HarnessWebSocketServer {
  private wss: WebSocketServer;
  private sessionClients = new Map<string, Set<WebSocket>>();
  private onCancelHandler?: SessionCancelHandler;
  private onSteerHandler?: SessionSteerHandler;
  private onCheckpointHandler?: CheckpointResponseHandler;

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

  close(): Promise<void> {
    return new Promise((resolve) => this.wss.close(() => resolve()));
  }
}
