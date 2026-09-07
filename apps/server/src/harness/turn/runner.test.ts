// FILE: runner.test.ts
// Purpose: M3 gate — real turn lifecycle: prompt assembly, loop streaming,
// failure + cancel paths (fake LLM; no provider calls).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import type { HarnessEvent } from "@caide/contracts";
import { captureTurnEnd, captureTurnStart, clearTurnProvenance } from "../../dyad/vcs/gitProvenance.ts";
import type { LLMAdapter } from "../loop/loop.ts";
import { CaideRunner, nextFailoverTarget } from "./runner.ts";
import { ProviderApiError } from "../provider/apiAdapter.ts";

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

  it("fails over to the next provider after a retryable setup error", async () => {
    const { applySettingsSync, clearSessionStores } = await import("./sessionStores.ts");
    const sid = `s-failover-${Date.now()}`;
    applySettingsSync(sid, {
      agentRouting: {
        mode: "single",
        steps: { scout: {}, builder: {}, planner: {} },
        fallbacks: [{ providerId: "openai", modelId: "fallback-model" }],
      },
    });
    let calls = 0;
    const events: HarnessEvent[] = [];
    const runner = new CaideRunner();
    try {
      await runner.startTurn({
        sessionId: sid,
        appPath: "/tmp/caide-test-app",
        prompt: "hi",
        mode: "ask",
        settings: { providerSettings: { openai: { apiKey: "sk-test" } } },
        llmOverride: {
          // Calls 1-2: persistent outage (exhausts the loop's step retry,
          // then triggers turn-level failover). Call 3 (failover attempt):
          // provider back.
          async *stream() {
            calls += 1;
            if (calls <= 2) {
              throw new ProviderApiError({ status: 503, code: "HTTP_503", message: "down", retryable: true });
            }
            yield { type: "token", content: "recovered" } as never;
          },
        },
        onEvent: (e) => events.push(e),
      });
      expect(calls).toBe(3);
      expect(runner.getStatus()).toBe("completed");
      expect(events).toContainEqual(
        expect.objectContaining({ type: "error", code: "PROVIDER_FAILOVER" }),
      );
      expect(events.at(-1)).toMatchObject({ type: "turn_end", status: "completed" });
    } finally {
      clearSessionStores(sid);
    }
  });

  it("picks failover targets only for retryable provider errors", () => {
    const retryable = new ProviderApiError({ status: 503, code: "HTTP_503", message: "down", retryable: true });
    const fatal = new ProviderApiError({ status: 401, code: "HTTP_401", message: "no", retryable: false });
    const base = { sessionId: "s", appPath: "/tmp/x", prompt: "hi" };
    expect(nextFailoverTarget(base, new Error("boom"))).toBeNull();
    expect(nextFailoverTarget(base, fatal)).toBeNull();
    // No fallbacks configured in a fresh session store.
    expect(nextFailoverTarget(base, retryable)).toBeNull();
  });

  it("injects the previous turn's git provenance into the prompt", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-runprov-"));
    execFileSync("git", ["init", "-b", "main"], { cwd: dir });
    execFileSync("git", ["config", "user.email", "t@t"], { cwd: dir });
    execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
    fs.writeFileSync(path.join(dir, "a.txt"), "v1\n");
    execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync("git", ["commit", "-m", "init"], { cwd: dir });
    const sid = `s-prov-${Date.now()}`;
    clearTurnProvenance(sid);
    // Fake a previous turn that committed.
    await captureTurnStart(sid, dir);
    fs.writeFileSync(path.join(dir, "a.txt"), "v2\n");
    execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync("git", ["commit", "-m", "second"], { cwd: dir });
    await captureTurnEnd(sid, dir);

    const seenMessages: Array<{ role: string; content: unknown }>[] = [];
    const runner = new CaideRunner();
    await runner.startTurn({
      sessionId: sid,
      appPath: dir,
      prompt: "continue",
      mode: "ask",
      settings: { providerSettings: { openai: { apiKey: "sk-test" } } },
      llmOverride: {
        async *stream(messages: Array<{ role: string; content: unknown }>) {
          seenMessages.push(messages);
          yield { type: "token", content: "ok" } as never;
        },
      },
    });
    expect(runner.getStatus()).toBe("completed");
    const userMsg = seenMessages[0].find((m) => m.role === "user");
    expect(String(userMsg?.content)).toMatch(/continue/);
    expect(String(userMsg?.content)).toMatch(/created commit/);
    clearTurnProvenance(sid);
  });

  it("auto-checkpoints dirty trees after completed turns", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-runckpt-"));
    execFileSync("git", ["init", "-b", "main"], { cwd: dir });
    execFileSync("git", ["config", "user.email", "t@t"], { cwd: dir });
    execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
    fs.writeFileSync(path.join(dir, "a.txt"), "v1\n");
    execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync("git", ["commit", "-m", "init"], { cwd: dir });
    fs.writeFileSync(path.join(dir, "a.txt"), "v2\n");
    const runner = new CaideRunner();
    await runner.startTurn({
      sessionId: `s-ckpt-${Date.now()}`,
      appPath: dir,
      prompt: "polish copy",
      mode: "agent",
      settings: { providerSettings: { openai: { apiKey: "sk-test" } } },
      llmOverride: {
        async *stream() {
          yield { type: "token", content: "ok" } as never;
        },
      },
    });
    expect(runner.getStatus()).toBe("completed");
    const log = fs.readFileSync(path.join(dir, ".caide", "versions.jsonl"), "utf-8");
    expect(log).toContain("Checkpoint: polish copy");
  });

  it("resumes interrupted turns with a continuation notice", async () => {
    const { SessionStorage } = await import("../session/storage.ts");
    const storage = new SessionStorage();
    const sid = `s-resume-${Date.now()}`;
    await storage.append(sid, "harness/event", {
      type: "turn_start",
      sessionId: sid,
      turnId: "t-old",
      prompt: "old work",
    });
    await storage.flush(sid);
    const seen: Array<{ role: string; content: unknown }>[] = [];
    const runner = new CaideRunner();
    await runner.startTurn({
      sessionId: sid,
      appPath: "/tmp/caide-test-app",
      prompt: "new work",
      mode: "ask",
      settings: { providerSettings: { openai: { apiKey: "sk-test" } } },
      llmOverride: {
        async *stream(messages: Array<{ role: string; content: unknown }>) {
          seen.push(messages);
          yield { type: "token", content: "ok" } as never;
        },
      },
    });
    expect(runner.getStatus()).toBe("completed");
    const userMsg = seen[0].find((m) => m.role === "user");
    expect(String(userMsg?.content)).toMatch(/interrupted/);
  });

  it("clamps non-positive step budgets to the default instead of starving the LLM", async () => {
    for (const maxSteps of [0, -5]) {
      const events: HarnessEvent[] = [];
      let llmCalls = 0;
      const runner = new CaideRunner();
      await runner.startTurn({
        sessionId: `s-clamp-${maxSteps}`,
        appPath: "/tmp/caide-test-app",
        prompt: "hi",
        mode: "ask",
        maxSteps,
        settings: { providerSettings: { openai: { apiKey: "sk-test" } } },
        llmOverride: {
          async *stream() {
            llmCalls += 1;
            yield { type: "token", content: "hello" } as never;
          },
        },
        onEvent: (e) => events.push(e),
      });
      expect(runner.getStatus()).toBe("completed");
      expect(llmCalls).toBe(1);
      expect(events.at(-1)).toMatchObject({ type: "turn_end", status: "completed" });
    }
  });
});
