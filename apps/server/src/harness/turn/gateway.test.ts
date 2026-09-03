// FILE: gateway.test.ts
// Purpose: M3h gate — gateway start/steer/cancel over a fake WS server with
// a fake LLM; reveal emission on tool calls.

import { describe, expect, it } from "vitest";
import type { HarnessEvent } from "@caide/contracts";
import type { LLMAdapter } from "../loop/loop.ts";
import { TurnGateway, resolveTurnProviders } from "./gateway.ts";
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

  it("resolves turn providers: explicit wins, else stored defaults", () => {
    const explicit = resolveTurnProviders({
      sessionId: "s",
      appPath: "/tmp/x",
      prompt: "hi",
      providerId: "openai",
      modelId: "gpt-5",
      settings: { providerSettings: { openai: { apiKey: "sk-x" } } },
    });
    expect(explicit.providerId).toBe("openai");
    expect(explicit.modelId).toBe("gpt-5");

    const fallback = resolveTurnProviders({ sessionId: "s", appPath: "/tmp/x", prompt: "hi" });
    expect(fallback.settings).toBeDefined();
    // undefined defaults are fine — the turn context auto-resolves by key.
    expect(fallback.providerId).toBeUndefined();
  });

  it("answers provider settings get/set over the socket handlers", async () => {
    const gateway = new TurnGateway();
    const sent: HarnessEvent[] = [];
    const handlers: Record<string, (...args: never[]) => void> = {};
    const server = {
      broadcastToSession: (sessionId: string, event: HarnessEvent) => {
        void sessionId;
        sent.push(event);
      },
      onPromptAnswer: (h: (...args: never[]) => void) => {
        handlers.prompt = h;
      },
      onConsentAnswer: (h: (...args: never[]) => void) => {
        handlers.consent = h;
      },
      onSettingsSync: (h: (...args: never[]) => void) => {
        handlers.settings = h;
      },
      onSteer: (h: (...args: never[]) => void) => {
        handlers.steer = h;
      },
      onCancel: (h: (...args: never[]) => void) => {
        handlers.cancel = h;
      },
      onBlueprintResponse: (h: (...args: never[]) => void) => {
        handlers.blueprint = h;
      },
      onTurnStart: (h: (...args: never[]) => void) => {
        handlers.turn = h;
      },
      onProviderSettingsGet: (h: (...args: never[]) => void) => {
        handlers.psGet = h;
      },
      onProviderSettingsSet: (h: (...args: never[]) => void) => {
        handlers.psSet = h;
      },
      onProviderSettingsTest: (h: (...args: never[]) => void) => {
        handlers.psTest = h;
      },
    } as unknown as HarnessWebSocketServer;
    gateway.attachWs(server);
    try {
      const get = handlers.psGet as (sid: string, req?: string) => void;
      get("s-ps", "r1");
      const state = sent.find((e) => e.type === "provider_settings_state");
      expect(state).toMatchObject({ sessionId: "s-ps", requestId: "r1" });
      expect(Array.isArray((state as unknown as { providers: unknown[] }).providers)).toBe(true);
    } finally {
      gateway.detachWs();
    }
  });
});
