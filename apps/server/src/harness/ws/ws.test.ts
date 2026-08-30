import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as http from "node:http";
import { WebSocket } from "ws";
import { HarnessWebSocketServer } from "./server.ts";
import type { HarnessEvent } from "@caide/contracts";

describe("Milestone M12 — WebSocket Server, Typed Events, and SIGTERM Cancel", () => {
  let server: http.Server;
  let wsServer: HarnessWebSocketServer;
  let port: number;

  beforeEach(async () => {
    server = http.createServer();
    wsServer = new HarnessWebSocketServer();

    server.on("upgrade", (req, socket, head) => {
      wsServer.handleUpgrade(req, socket, head);
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as any;
        port = addr.port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await wsServer.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("handles client subscribe and broadcasts typed HarnessEvent to subscribers", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve) => ws.on("open", () => resolve()));

    const receivedEvents: HarnessEvent[] = [];
    ws.on("message", (data) => {
      const parsed = JSON.parse(data.toString());
      if (parsed.type !== "subscribed") {
        receivedEvents.push(parsed);
      }
    });

    // Subscribe to session-ws-1
    ws.send(JSON.stringify({ type: "subscribe", sessionId: "session-ws-1" }));
    await new Promise((r) => setTimeout(r, 30));

    // Broadcast stage event
    wsServer.broadcastToSession("session-ws-1", {
      type: "stage",
      sessionId: "session-ws-1",
      from: "idle",
      to: "planning",
    });

    // Broadcast token event
    wsServer.broadcastToSession("session-ws-1", {
      type: "token",
      sessionId: "session-ws-1",
      content: "Hello from harness!",
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(receivedEvents.length).toBe(2);
    expect(receivedEvents[0].type).toBe("stage");
    expect((receivedEvents[0] as any).to).toBe("planning");
    expect(receivedEvents[1].type).toBe("token");
    expect((receivedEvents[1] as any).content).toBe("Hello from harness!");

    ws.close();
  });

  it("dispatches client cancel message to onCancel handler (SIGTERM channel)", async () => {
    let cancelledSessionId: string | null = null;
    let cancelReason: string | undefined;

    wsServer.onCancel((sessionId, reason) => {
      cancelledSessionId = sessionId;
      cancelReason = reason;
    });

    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve) => ws.on("open", () => resolve()));

    ws.send(JSON.stringify({ type: "cancel", sessionId: "session-cancel-123" }));
    await new Promise((r) => setTimeout(r, 40));

    expect(cancelledSessionId).toBe("session-cancel-123");
    expect(cancelReason).toContain("User cancelled from web client");

    ws.close();
  });

  it("dispatches steer message to onSteer handler", async () => {
    let steeredSessionId: string | null = null;
    let steeredPrompt: string | null = null;

    wsServer.onSteer((sessionId, prompt) => {
      steeredSessionId = sessionId;
      steeredPrompt = prompt;
    });

    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve) => ws.on("open", () => resolve()));

    ws.send(
      JSON.stringify({
        type: "steer",
        sessionId: "session-steer-456",
        prompt: "Use TypeScript strict mode",
      }),
    );
    await new Promise((r) => setTimeout(r, 40));

    expect(steeredSessionId).toBe("session-steer-456");
    expect(steeredPrompt).toBe("Use TypeScript strict mode");

    ws.close();
  });
});
