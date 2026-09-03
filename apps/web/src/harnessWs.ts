// FILE: harnessWs.ts
// Purpose: Lean browser client for the harness WebSocket endpoint
// (subscribe/ping/heartbeat + prompt/consent answers). Feeds harnessStore.
// Separate from the legacy Effect RPC wsTransport — this speaks only typed
// HarnessEvent envelopes.

import type { HarnessEvent } from "@caide/contracts";
import { harnessStore } from "./harnessStore";

export interface HarnessWsOptions {
  url: string;
  sessionId: string;
  onEvent?: (event: HarnessEvent) => void;
  heartbeatMs?: number;
  maxBackoffMs?: number;
}

function isHarnessEvent(value: unknown): value is HarnessEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

export function connectHarnessWs(options: HarnessWsOptions): HarnessWsHandle {
  const heartbeatMs = options.heartbeatMs ?? 15_000;
  const maxBackoffMs = options.maxBackoffMs ?? 10_000;
  let ws: WebSocket | null = null;
  let closed = false;
  let backoffMs = 500;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const cleanupSocket = () => {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      try {
        ws.close();
      } catch {
        // already closed
      }
      ws = null;
    }
  };

  const scheduleReconnect = () => {
    if (closed) return;
    reconnectTimer = setTimeout(
      () => {
        backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
        open();
      },
      backoffMs,
    );
  };

  const open = () => {
    if (closed) return;
    cleanupSocket();
    const socket = new WebSocket(options.url);
    ws = socket;

    socket.onopen = () => {
      backoffMs = 500;
      socket.send(JSON.stringify({ type: "subscribe", sessionId: options.sessionId }));
      heartbeat = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "ping" }));
        }
      }, heartbeatMs);
    };

    socket.onmessage = (message) => {
      try {
        const event: unknown = JSON.parse(String(message.data));
        if (!isHarnessEvent(event)) return;
        if ((event as { type: string }).type === "pong") return;
        harnessStore.handleEvent(event);
        options.onEvent?.(event);
      } catch {
        // ignore malformed server message
      }
    };

    socket.onclose = () => {
      cleanupSocket();
      scheduleReconnect();
    };
    socket.onerror = () => {
      try {
        socket.close();
      } catch {
        // close triggers reconnect
      }
    };
  };

  open();

  return {
    disconnect: () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      cleanupSocket();
    },
    send: (message: Record<string, unknown>) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    },
  };
}

export interface HarnessWsHandle {
  disconnect: () => void;
  send: (message: Record<string, unknown>) => void;
}

export function answerUiPrompt(
  send: (message: Record<string, unknown>) => void,
  requestId: string,
  answers: Record<string, string> | null,
): void {
  send({ type: "prompt_answer", requestId, answers });
}

export function answerConsent(
  send: (message: Record<string, unknown>) => void,
  requestId: string,
  decision: "accept-once" | "accept-always" | "decline",
): void {
  send({ type: "consent_answer", requestId, decision });
}
