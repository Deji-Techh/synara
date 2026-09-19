// FILE: hub.test.ts
// Purpose: Hub fan-out hardening — one broken sender never kills delivery
// to siblings, dead senders are pruned, stats account every broadcast.

import { describe, expect, it } from "vitest";
import { HarnessHub, type HarnessClientSender } from "./hub.ts";

function sender(
  open = true,
  onSend?: (text: string) => void,
): HarnessClientSender & { sent: string[] } {
  const sent: string[] = [];
  return {
    sent,
    sendText: (text: string) => {
      sent.push(text);
      onSend?.(text);
    },
    isOpen: () => open,
  };
}

const tokenEvent = (sessionId: string, content: string) => ({
  type: "token" as const,
  sessionId,
  content,
});

describe("harness hub fan-out", () => {
  it("isolates a throwing sender and prunes dead clients, with stats", () => {
    const hub = new HarnessHub();
    const good = sender(true);
    const bad = sender(true, (text) => {
      // Fail on live broadcasts only — the subscribed ack must go through.
      if (!text.includes('"subscribed"')) throw new Error("socket dead");
    });
    const closed = sender(false);
    const unsubGood = hub.addClient("s", good);
    const unsubBad = hub.addClient("s", bad);
    const unsubClosed = hub.addClient("s", closed);
    // addClient sends subscribed acks — clear them to isolate the broadcast.
    good.sent.length = 0;
    bad.sent.length = 0;

    hub.broadcastToSession("s", tokenEvent("s", "hi"));

    expect(good.sent).toHaveLength(1);
    expect(JSON.parse(good.sent[0]).content).toBe("hi");
    const stats = hub.getBroadcastStats();
    expect(stats.broadcasts).toBe(1);
    expect(stats.deliveries).toBe(1);
    expect(stats.sendErrors).toBe(1);
    expect(stats.prunedDeadClients).toBe(1);

    // Broken + dead senders are gone; the good client still receives.
    hub.broadcastToSession("s", tokenEvent("s", "again"));
    expect(good.sent).toHaveLength(2);
    expect(hub.getBroadcastStats().broadcasts).toBe(2);

    unsubGood();
    unsubBad();
    unsubClosed();
  });

  it("no-ops broadcast with no subscribers", () => {
    const hub = new HarnessHub();
    expect(() => hub.broadcastToSession("missing", tokenEvent("missing", "x"))).not.toThrow();
    expect(hub.getBroadcastStats()).toMatchObject({ broadcasts: 0, deliveries: 0 });
  });

  it("routes mcp_oauth_start to the registered handler with parsed fields", () => {
    const hub = new HarnessHub();
    const seen: unknown[] = [];
    hub.onMcpOAuthStart((sessionId, input) => {
      seen.push({ sessionId, ...input });
    });
    const s = sender(true);
    hub.handleText(
      s,
      JSON.stringify({
        type: "mcp_oauth_start",
        sessionId: "settings",
        requestId: "r1",
        serverId: "mcp-1",
        serverUrl: "https://mcp.example.com/mcp",
        scope: "tools",
      }),
    );
    expect(seen).toEqual([
      {
        sessionId: "settings",
        serverId: "mcp-1",
        serverUrl: "https://mcp.example.com/mcp",
        scope: "tools",
        requestId: "r1",
      },
    ]);
    // Missing serverUrl is ignored (no crash, no call).
    hub.handleText(
      s,
      JSON.stringify({ type: "mcp_oauth_start", sessionId: "settings", serverId: "mcp-1" }),
    );
    expect(seen).toHaveLength(1);
  });
});
