// FILE: dispatchSmoke.test.ts
// Purpose: Item (b) smoke — CAIDE_DISPATCH_SYSTEM_PROMPT override precedence
// through a real CaideRunner turn (fake LLM, no provider calls): the streamed
// loop must receive exactly the override as its system message, and the turn
// must still complete end to end on a low-token prompt.

import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../loop/loop.ts";
import type { LLMAdapter } from "../loop/loop.ts";
import { CaideRunner } from "./runner.ts";

const SETTINGS = { providerSettings: { openai: { apiKey: "sk-test" } } };

function capturingLlm(seen: { messages: ChatMessage[] | null }, token: string): LLMAdapter {
  return {
    async *stream(messages: ChatMessage[]) {
      seen.messages = messages;
      yield { type: "token", content: token } as never;
    },
  };
}

function withEnv(env: Record<string, string | undefined>, fn: () => Promise<void>): Promise<void> {
  const prevPrimary = process.env.CAIDE_DISPATCH_SYSTEM_PROMPT;
  const prevAlias = process.env.DYAD_DEFAULT_SYSTEM_PROMPT;
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return fn().finally(() => {
    if (prevPrimary === undefined) delete process.env.CAIDE_DISPATCH_SYSTEM_PROMPT;
    else process.env.CAIDE_DISPATCH_SYSTEM_PROMPT = prevPrimary;
    if (prevAlias === undefined) delete process.env.DYAD_DEFAULT_SYSTEM_PROMPT;
    else process.env.DYAD_DEFAULT_SYSTEM_PROMPT = prevAlias;
  });
}

async function runSmokeTurn(seen: { messages: ChatMessage[] | null }): Promise<CaideRunner> {
  const runner = new CaideRunner();
  await runner.startTurn({
    sessionId: `s-smoke-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    appPath: "/tmp/caide-test-app",
    prompt: "hi",
    mode: "ask",
    framework: "website",
    settings: SETTINGS,
    llmOverride: capturingLlm(seen, "SMOKE-OK"),
    onEvent: () => {},
  });
  return runner;
}

describe("dispatch system prompt smoke (item b)", () => {
  it("streams to completion on a low-token override prompt", async () => {
    const seen: { messages: ChatMessage[] | null } = { messages: null };
    const runner = await withEnv(
      {
        CAIDE_DISPATCH_SYSTEM_PROMPT: "Reply with exactly: SMOKE-OK",
        DYAD_DEFAULT_SYSTEM_PROMPT: undefined,
      },
      () => runSmokeTurn(seen),
    );
    expect(runner.getStatus()).toBe("completed");
    expect(seen.messages?.[0]).toMatchObject({
      role: "system",
      content: "Reply with exactly: SMOKE-OK",
    });
  });

  it("prefers the primary var when both are set", async () => {
    const seen: { messages: ChatMessage[] | null } = { messages: null };
    await withEnv(
      { CAIDE_DISPATCH_SYSTEM_PROMPT: "primary wins", DYAD_DEFAULT_SYSTEM_PROMPT: "alias loses" },
      () => runSmokeTurn(seen),
    );
    expect(seen.messages?.[0]).toMatchObject({ role: "system", content: "primary wins" });
  });

  it("honors the alias alone, and the assembled default when unset", async () => {
    const aliasSeen: { messages: ChatMessage[] | null } = { messages: null };
    await withEnv(
      { CAIDE_DISPATCH_SYSTEM_PROMPT: undefined, DYAD_DEFAULT_SYSTEM_PROMPT: "alias only" },
      () => runSmokeTurn(aliasSeen),
    );
    expect(aliasSeen.messages?.[0]).toMatchObject({ role: "system", content: "alias only" });

    const defaultSeen: { messages: ChatMessage[] | null } = { messages: null };
    await withEnv(
      { CAIDE_DISPATCH_SYSTEM_PROMPT: undefined, DYAD_DEFAULT_SYSTEM_PROMPT: undefined },
      () => runSmokeTurn(defaultSeen),
    );
    const content = String(
      (defaultSeen.messages?.[0] as { content?: unknown } | null)?.content ?? "",
    );
    // Assembled default: long, framework-aware, mode-aware prompt.
    expect(content.length).toBeGreaterThan(500);
    expect(content.toLowerCase()).toContain("website");
  });
});
