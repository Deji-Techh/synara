// FILE: runner.test.ts
// Purpose: M3 gate — real turn lifecycle: prompt assembly, loop streaming,
// failure + cancel paths (fake LLM; no provider calls).

import { describe, expect, it } from "vitest";
import type { HarnessEvent } from "@caide/contracts";
import type { LLMAdapter } from "../loop/loop.ts";
import { CaideRunner } from "./runner.ts";

function fakeLlm(chunks: Array<{ type: "token"; content: string }>): LLMAdapter {
  return {
    async *stream() {
      for (const c of chunks) yield c as never;
    },
  };
}

describe("caide runner turns (m3)", () => {
  it("streams a token-only turn to completion with framework prompt", async () => {
    const events: HarnessEvent[] = [];
    const runner = new CaideRunner();
    const turnId = await runner.startTurn({
      sessionId: "s-run",
      appPath: "/tmp/caide-test-app",
      prompt: "hi",
      mode: "ask",
      framework: "website",
      settings: { providerSettings: { openai: { apiKey: "sk-test" } } },
      llmOverride: fakeLlm([{ type: "token", content: "hello" }]),
      onEvent: (e) => events.push(e),
    });
    expect(typeof turnId).toBe("string");
    expect(runner.getStatus()).toBe("completed");
    expect(events[0]).toMatchObject({ type: "turn_start", prompt: "hi" });
    expect(events).toContainEqual(expect.objectContaining({ type: "token", content: "hello" }));
    expect(events.at(-1)).toMatchObject({ type: "turn_end", status: "completed" });
  });

  it("fails structured without throwing when no provider key exists", async () => {
    const events: HarnessEvent[] = [];
    const runner = new CaideRunner();
    await runner.startTurn({
      sessionId: "s-nokey",
      appPath: "/tmp/caide-test-app",
      prompt: "hi",
      settings: { providerSettings: {} },
      onEvent: (e) => events.push(e),
    });
    expect(runner.getStatus()).toBe("failed");
    expect(events).toContainEqual(
      expect.objectContaining({ type: "error", code: "TURN_FAILED" }),
    );
    expect(events.at(-1)).toMatchObject({ type: "turn_end", status: "failed" });
  });

  it("cancels a parked turn", async () => {
    const events: HarnessEvent[] = [];
    const runner = new CaideRunner();
    const started = runner.startTurn({
      sessionId: "s-cancel",
      appPath: "/tmp/caide-test-app",
      prompt: "hi",
      settings: { providerSettings: { openai: { apiKey: "sk-test" } } },
      llmOverride: {
        async *stream(_messages: never, opts?: { signal?: AbortSignal }) {
          await new Promise<void>((resolve) => {
            const timer = setInterval(() => {
              if (opts?.signal?.aborted) {
                clearInterval(timer);
                resolve();
              }
            }, 5);
          });
        },
      } as LLMAdapter,
      onEvent: (e) => events.push(e),
    });
    await new Promise((r) => setTimeout(r, 30));
    runner.cancel("s-cancel");
    await started;
    expect(runner.getStatus()).toBe("cancelled");
    expect(events.at(-1)).toMatchObject({ type: "turn_end", status: "cancelled" });
  });
});
