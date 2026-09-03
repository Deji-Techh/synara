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

export class TurnGateway {
  private runner = new CaideRunner();
  private inboxes = new Map<string, Inbox>();
  private ws: HarnessWebSocketServer | null = null;
  private uiDetach: (() => void) | null = null;

  /** Attach a WS server: bridge UI transports + steer/cancel bindings. */
  attachWs(server: HarnessWebSocketServer): void {
    this.ws = server;
    const bridge = attachUiBridge(server);
    void bridge;
    this.uiDetach = bridge.detach;
    server.onSteer((sessionId, prompt) => {
      this.getInbox(sessionId).steer(prompt);
    });
    server.onCancel((sessionId, reason) => {
      this.runner.cancel(sessionId, reason ?? "cancelled");
    });
  }

  detachWs(): void {
    this.uiDetach?.();
    this.uiDetach = null;
    this.ws = null;
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
    const inbox = this.getInbox(request.sessionId);
    const broadcast = (event: HarnessEvent): void => {
      extra?.onEvent?.(event);
      this.ws?.broadcastToSession(request.sessionId, event);
    };
    return this.runner.startTurn({
      ...request,
      inbox,
      onEvent: broadcast,
      ...extra,
      // extra.onEvent already invoked above; keep broadcast as the sink.
      onEvent: broadcast,
    });
  }

  cancelTurn(sessionId: string, cause?: string): void {
    this.runner.cancel(sessionId, cause);
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
