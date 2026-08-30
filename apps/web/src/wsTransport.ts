import type { HarnessEvent } from "@caide/contracts";

export type EventListener = (event: HarnessEvent) => void;
export type ConnectionStateListener = (connected: boolean) => void;

export class WsTransport {
  private ws: WebSocket | null = null;
  private url: string;
  private listeners = new Map<string, Set<EventListener>>();
  private stateListeners = new Set<ConnectionStateListener>();
  private reconnectAttempt = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private isExplicitlyClosed = false;

  constructor(url: string) {
    this.url = url;
  }

  connect(): void {
    this.isExplicitlyClosed = false;
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.reconnectAttempt = 0;
        this.notifyState(true);
        this.startHeartbeat();

        // Resubscribe to all active sessions on reconnect
        for (const sessionId of this.listeners.keys()) {
          this.send({ type: "subscribe", sessionId });
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed.type === "pong" || parsed.type === "subscribed") return;

          const harnessEvent = parsed as HarnessEvent;
          const sessionId = harnessEvent.sessionId;
          if (sessionId) {
            const sessionListeners = this.listeners.get(sessionId);
            if (sessionListeners) {
              for (const listener of sessionListeners) {
                listener(harnessEvent);
              }
            }
          }
        } catch {
          // ignore malformed message
        }
      };

      this.ws.onclose = () => {
        this.stopHeartbeat();
        this.notifyState(false);
        if (!this.isExplicitlyClosed) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempt), 10_000);
    this.reconnectAttempt += 1;
    setTimeout(() => {
      if (!this.isExplicitlyClosed) {
        this.connect();
      }
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingTimer = setInterval(() => {
      this.send({ type: "ping" });
    }, 15_000);
  }

  private stopHeartbeat(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private notifyState(connected: boolean): void {
    for (const l of this.stateListeners) {
      l(connected);
    }
  }

  onConnectionChange(listener: ConnectionStateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.ws?.readyState === WebSocket.OPEN);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  subscribe(sessionId: string, listener: EventListener): () => void {
    let sessionListeners = this.listeners.get(sessionId);
    if (!sessionListeners) {
      sessionListeners = new Set();
      this.listeners.set(sessionId, sessionListeners);
      this.send({ type: "subscribe", sessionId });
    }
    sessionListeners.add(listener);

    return () => {
      const set = this.listeners.get(sessionId);
      if (set) {
        set.delete(listener);
        if (set.size === 0) {
          this.listeners.delete(sessionId);
        }
      }
    };
  }

  steer(sessionId: string, prompt: string): void {
    this.send({ type: "steer", sessionId, prompt });
  }

  cancel(sessionId: string): void {
    this.send({ type: "cancel", sessionId });
  }

  respondToCheckpoint(
    sessionId: string,
    checkpointId: string,
    approved: boolean,
    feedback?: string,
  ): void {
    this.send({
      type: "checkpoint_response",
      sessionId,
      checkpointId,
      approved,
      feedback,
    });
  }

  send(payload: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  disconnect(): void {
    this.isExplicitlyClosed = true;
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
