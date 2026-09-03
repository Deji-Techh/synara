// FILE: gateway.test.ts
// Purpose: M3h gate — gateway start/steer/cancel over a fake WS server with
// a fake LLM; reveal emission on tool calls.

import { describe, expect, it } from "vitest";
import type { HarnessEvent } from "@caide/contracts";
import type { LLMAdapter } from "../loop/loop.ts";
import { TurnGateway } from "./gateway.ts";
import { HarnessWebSocketServer } from "../ws/server.ts";

function fakeLlm(chunks: Array<{ type: "token"; content: string }>): LLMAdapter {
  return {
    async *stream() {
      for (const c of chunks) yield c as never;
    },
  };
}

function toolLlm(): LLMAdapter {
  let calls = 0;
  return {
    async *stream() {
      calls++;
      if (calls === 1) {
        yield { type: "tool_call", toolCall: { id: "c1", name: "execute_sql", args: { query: "select 1" } } } as never;
      } else {
        yield { type: "token", content: "done" } as never;
      }
    },
  };
}

describe("turn gateway (m3h)", () => {
  it("starts a turn and broadcasts events to subscribers", async () => {
    const gateway = new TurnGateway();
    const seen: HarnessEvent[] = [];
    const server = new HarnessWebSocketServer();
    gateway.attachWs(server);
    try {
      const orig = server.broadcastToSession.bind(server);
      void orig;
      const turnId = await gateway.startTurn(
        {
          sessionId: "s-gw",
          appPath: "/tmp/caide-test-app",
          prompt: "hi",
          mode: "ask",
          settings: { providerSettings: { openai: { apiKey: "sk-test" } } },
        },
        { llmOverride: fakeLlm([{ type: "token", content: "yo" }]), onEvent: (e) => seen.push(e) },
      );
      expect(typeof turnId).toBe("string");
      expect(seen[0]).toMatchObject({ type: "turn_start", prompt: "hi" });
      expect(seen.at(-1)).toMatchObject({ type: "turn_end", status: "completed" });
      expect(gateway.getStatus()).toBe("completed");
    } finally {
      gateway.detachWs();
    }
  });

  it("emits database reveals for DB tool calls", async () => {
    const gateway = new TurnGateway();
    const seen: HarnessEvent[] = [];
    await gateway.startTurn(
      {
        sessionId: "s-reveal",
        appPath: "/tmp/caide-test-app",
        prompt: "query",
        settings: { providerSettings: { openai: { apiKey: "sk-test" } } },
      },
      { llmOverride: toolLlm(), onEvent: (e) => seen.push(e) },
    );
    expect(seen).toContainEqual(
      expect.objectContaining({ type: "ui_reveal", pane: "database", reason: "execute_sql" }),
    );

    const previewSeen: HarnessEvent[] = [];
    await gateway.startTurn(
      {
        sessionId: "s-reveal",
        appPath: "/tmp/caide-test-app",
        prompt: "open it",
        settings: { providerSettings: { openai: { apiKey: "sk-test" } } },
      },
      {
        llmOverride: {
          async *stream() {
            yield { type: "tool_call", toolCall: { id: "c2", name: "open_preview", args: {} } } as never;
          },
        } as LLMAdapter,
        onEvent: (e) => previewSeen.push(e),
      },
    );
    expect(previewSeen).toContainEqual(
      expect.objectContaining({ type: "ui_reveal", pane: "preview", reason: "open_preview" }),
    );
  });

  it("steers and cancels through the gateway", async () => {
    const gateway = new TurnGateway();
    const inbox = gateway.getInbox("s-steer");
    inbox.steer("extra context");
    gateway.cancelTurn("s-steer");
    gateway.dropSession("s-steer");
    expect(gateway.getInbox("s-steer")).not.toBe(inbox);
  });
});
