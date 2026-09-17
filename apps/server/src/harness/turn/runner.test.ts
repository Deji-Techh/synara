// FILE: runner.test.ts
// Purpose: M3 gate — real turn lifecycle: prompt assembly, loop streaming,
// failure + cancel paths (fake LLM; no provider calls).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import type { HarnessEvent } from "@caide/contracts";
import {
  captureTurnEnd,
  captureTurnStart,
  clearTurnProvenance,
} from "../../dyad/vcs/gitProvenance.ts";
import type { LLMAdapter } from "../loop/loop.ts";
import {
  assembleCompactedMessages,
  BUILD_MODE_STEP_BUDGET,
  CaideRunner,
  nextFailoverTarget,
  resolveModeBudget,
} from "./runner.ts";
import { ProviderApiError } from "../provider/apiAdapter.ts";
import {
  approveBlueprint,
  clearBlueprint,
  getBlueprint,
  isBlueprintApproved,
  setBlueprintRequired,
} from "../../dyad/plan/blueprintStore.ts";

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

  describe("008-m7 donor budgets + end-envelope fidelity", () => {
    it("resolves donor step budgets: build 20, agent settings ?? 100, explicit wins", () => {
      expect(BUILD_MODE_STEP_BUDGET).toBe(20);
      expect(resolveModeBudget("build", undefined, undefined)).toBe(20);
      expect(resolveModeBudget("build", 5, undefined)).toBe(5);
      expect(resolveModeBudget("agent", undefined, undefined)).toBe(100);
      expect(resolveModeBudget("agent", undefined, 50)).toBe(50);
      expect(resolveModeBudget("ask", undefined, undefined)).toBe(100);
      expect(resolveModeBudget("plan", undefined, 200)).toBe(200);
      expect(resolveModeBudget("local-agent", 7, 50)).toBe(7);
    });

    it("completed turn_end carries contextWindow without inventing usage/files", async () => {
      const events: HarnessEvent[] = [];
      const runner = new CaideRunner();
      await runner.startTurn({
        sessionId: `s-envelope-${Date.now()}`,
        appPath: "/tmp/caide-test-app",
        prompt: "hi",
        mode: "ask",
        framework: "website",
        settings: { providerSettings: { openai: { apiKey: "sk-test" } } },
        llmOverride: fakeLlm([{ type: "token", content: "hello" }]),
        onEvent: (e) => events.push(e),
      });
      const end = events.at(-1);
      expect(end).toMatchObject({ type: "turn_end", status: "completed" });
      expect((end as { contextWindow?: unknown }).contextWindow).toEqual(expect.any(Number));
      expect(end).not.toHaveProperty("wasCancelled");
      expect(end).not.toHaveProperty("pausePromptQueue");
      expect(end).not.toHaveProperty("updatedFiles");
    });

    it("step-limit exhaustion pauses the prompt queue on turn_end (donor parity)", async () => {
      const events: HarnessEvent[] = [];
      const runner = new CaideRunner();
      await runner.startTurn({
        sessionId: `s-steplimit-${Date.now()}`,
        appPath: "/tmp/caide-test-app",
        prompt: "hi",
        mode: "ask",
        framework: "website",
        maxSteps: 1,
        settings: { providerSettings: { openai: { apiKey: "sk-test" } } },
        llmOverride: {
          async *stream() {
            yield {
              type: "tool_call",
              toolCall: { id: "c-x", name: "definitely_not_a_real_tool_xyz", args: {} },
            } as never;
          },
        } as LLMAdapter,
        onEvent: (e) => events.push(e),
      });
      expect(events).toContainEqual(expect.objectContaining({ type: "error", code: "STEP_LIMIT" }));
      expect(events.at(-1)).toMatchObject({
        type: "turn_end",
        status: "completed",
        pausePromptQueue: true,
      });
    });
  });

  describe("008-m9b build text path gate", () => {
    const tagText = '<dyad-write path="built.ts">export const built = true;</dyad-write>';

    it("build + autoApproveChanges streams text with no tools and applies tags", async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-buildgate-"));
      const events: HarnessEvent[] = [];
      const runner = new CaideRunner();
      await runner.startTurn({
        sessionId: `s-buildtext-${Date.now()}`,
        appPath: dir,
        prompt: "build it",
        mode: "build",
        framework: "website",
        settings: {
          providerSettings: { openai: { apiKey: "sk-test" } },
          autoApproveChanges: true,
        },
        llmOverride: fakeLlm([{ type: "token", content: tagText }]),
        onEvent: (e) => events.push(e),
      });
      expect(runner.getStatus()).toBe("completed");
      expect(fs.readFileSync(path.join(dir, "built.ts"), "utf8")).toBe(
        "export const built = true;",
      );
      // Donor parity: zero native tool calls on the text path.
      expect(events.some((e) => e.type === "tool_call")).toBe(false);
      expect(events.at(-1)).toMatchObject({
        type: "turn_end",
        status: "completed",
        updatedFiles: ["built.ts"],
      });
    });

    it("build without the flag parks a proposal (headless: dismissed, nothing applied)", async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-buildgate-"));
      const events: HarnessEvent[] = [];
      const runner = new CaideRunner();
      await runner.startTurn({
        sessionId: `s-buildnative-${Date.now()}`,
        appPath: dir,
        prompt: "build it",
        mode: "build",
        framework: "website",
        settings: { providerSettings: { openai: { apiKey: "sk-test" } } },
        llmOverride: fakeLlm([{ type: "token", content: tagText }]),
        onEvent: (e) => events.push(e),
      });
      expect(runner.getStatus()).toBe("completed");
      // Proposal path: zero native tool calls; no transport in tests, so the
      // card dismisses immediately instead of parking the turn.
      expect(events.some((e) => e.type === "tool_call")).toBe(false);
      expect(fs.existsSync(path.join(dir, "built.ts"))).toBe(false);
      expect(events.at(-1)).toMatchObject({ type: "turn_end", status: "completed" });
    });
  });

  describe("008 post-turn agent checkpoint chain", () => {
    type ScriptChunk =
      | { type: "token"; content: string }
      | { type: "tool_call"; toolCall: { id: string; name: string; args: unknown } };

    /** Stateful scripted adapter counting its stream calls. */
    function scriptedLlm(chunks: ScriptChunk[], counter: { count: number }): LLMAdapter {
      const queue = [...chunks];
      return {
        async *stream() {
          counter.count++;
          const chunk = queue.shift();
          if (chunk) yield chunk as never;
          else yield { type: "token", content: "pass complete, no changes needed." } as never;
        },
      };
    }

    const writeCall = (
      id: string,
      filePath: string,
    ): Extract<ScriptChunk, { type: "tool_call" }> => ({
      type: "tool_call",
      toolCall: { id, name: "write_file", args: { path: filePath, content: "x" } },
    });

    it("runs design passes with retry-once after a substantive agent turn", async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-agentchain-"));
      const events: HarnessEvent[] = [];
      const counter = { count: 0 };
      const runner = new CaideRunner();
      await runner.startTurn({
        sessionId: `s-agentchain-${Date.now()}`,
        appPath: dir,
        prompt: "build the screens",
        mode: "agent",
        framework: "website",
        settings: { providerSettings: { openai: { apiKey: "sk-test" } } },
        llmOverride: scriptedLlm(
          [writeCall("c1", "a.ts"), writeCall("c2", "b.ts"), { type: "token", content: "done" }],
          counter,
        ),
        onEvent: (e) => events.push(e),
      });
      expect(runner.getStatus()).toBe("completed");
      // Main (2 writes + text) + 5 core passes × (attempt + retry) — every
      // pass adds no files, so each retries exactly once (donor contract).
      expect(counter.count).toBe(3 + 5 * 2);
      expect(fs.existsSync(path.join(dir, "a.ts"))).toBe(true);
      expect(fs.existsSync(path.join(dir, "b.ts"))).toBe(true);
      expect(events.at(-1)).toMatchObject({
        type: "turn_end",
        status: "completed",
        updatedFiles: ["a.ts", "b.ts"],
      });
    });

    it("skips the chain for insubstantial agent turns", async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-agentchain-"));
      const counter = { count: 0 };
      const runner = new CaideRunner();
      await runner.startTurn({
        sessionId: `s-agentchain1-${Date.now()}`,
        appPath: dir,
        prompt: "build the screens",
        mode: "agent",
        framework: "website",
        settings: { providerSettings: { openai: { apiKey: "sk-test" } } },
        llmOverride: scriptedLlm([writeCall("c1", "solo.ts")], counter),
        onEvent: () => {},
      });
      expect(runner.getStatus()).toBe("completed");
      // Write step + text tail only: 1 edited file < 2, no chain.
      expect(counter.count).toBe(2);
      expect(fs.existsSync(path.join(dir, "solo.ts"))).toBe(true);
    });
  });

  it("appends a project run log per turn (self-improve telemetry)", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-runlog-"));
    const runner = new CaideRunner();
    await runner.startTurn({
      sessionId: `s-runlog-${Date.now()}`,
      appPath: dir,
      prompt: "hi",
      mode: "ask",
      framework: "website",
      settings: { providerSettings: { openai: { apiKey: "sk-test" } } },
      llmOverride: fakeLlm([{ type: "token", content: "hello" }]),
    });
    const logFile = path.join(dir, ".caide", "telemetry", "project-runs.jsonl");
    const lines = fs.readFileSync(logFile, "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry).toMatchObject({ framework: "website", skills: [] });
    expect(typeof entry.timestamp).toBe("number");
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
    expect(events).toContainEqual(expect.objectContaining({ type: "error", code: "TURN_FAILED" }));
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
    expect(events.at(-1)).toMatchObject({
      type: "turn_end",
      status: "cancelled",
      wasCancelled: true,
    });
  });

  it("drops the session blueprint on cancel (donor delete-on-cancel)", async () => {
    const sid = `s-bpcancel-${Date.now()}`;
    setBlueprintRequired(sid);
    approveBlueprint(sid, {
      appName: "X",
      userPrompt: "u",
      designDirection: "d",
      primaryColor: "#fff",
      visuals: [],
    });
    expect(isBlueprintApproved(sid)).toBe(true);
    const runner = new CaideRunner();
    const started = runner.startTurn({
      sessionId: sid,
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
      onEvent: () => {},
    });
    await new Promise((r) => setTimeout(r, 30));
    runner.cancel(sid);
    await started;
    // Stale approval must not survive: a retried turn re-arms from the marker.
    expect(isBlueprintApproved(sid)).toBe(false);
    expect(getBlueprint(sid)).toBeNull();
    clearBlueprint(sid);
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
              throw new ProviderApiError({
                status: 503,
                code: "HTTP_503",
                message: "down",
                retryable: true,
              });
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
    const retryable = new ProviderApiError({
      status: 503,
      code: "HTTP_503",
      message: "down",
      retryable: true,
    });
    const fatal = new ProviderApiError({
      status: 401,
      code: "HTTP_401",
      message: "no",
      retryable: false,
    });
    const base = { sessionId: "s", appPath: "/tmp/x", prompt: "hi" };
    expect(nextFailoverTarget(base, new Error("boom"))).toBeNull();
    expect(nextFailoverTarget(base, fatal)).toBeNull();
    // No fallbacks configured in a fresh session store.
    expect(nextFailoverTarget(base, retryable)).toBeNull();
  });

  it("announces the taste planner fallback on empty planner slots (item 4)", async () => {
    const { applySettingsSync, clearSessionStores } = await import("./sessionStores.ts");
    const sid = `s-taste-${Date.now()}`;
    applySettingsSync(sid, {
      agentRouting: {
        mode: "per-step",
        steps: { scout: {}, builder: {}, planner: {} },
        fallbacks: [],
      },
    });
    const events: HarnessEvent[] = [];
    const runner = new CaideRunner();
    try {
      // The taste adapter bypasses llmOverride (it builds a real adapter for
      // the picked model), so the turn itself fails on the fake key — but the
      // announcement must fire first, synchronously at adapter build.
      await runner.startTurn({
        sessionId: sid,
        appPath: "/tmp/caide-test-app",
        prompt: "plan the home screen",
        mode: "plan",
        settings: { providerSettings: { openai: { apiKey: "sk-test" } } },
        llmOverride: fakeLlm([{ type: "token", content: "planning" }]),
        onEvent: (e) => events.push(e),
      });
      expect(
        events.some(
          (e) =>
            e.type === "token" && (e as { content?: string }).content?.includes("highest-taste"),
        ),
      ).toBe(true);
      expect(events.at(-1)?.type).toBe("turn_end");
    } finally {
      clearSessionStores(sid);
    }
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
    // History now precedes (chain projection): the resume notice rides on
    // the NEW prompt message, not the first history row.
    const newPromptMsg = seen[0].filter((m) => m.role === "user").pop();
    expect(String((newPromptMsg as { content: unknown })?.content)).toMatch(/interrupted/);
  });

  it("seeds turns with the project's AI_RULES.md", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-rules-"));
    fs.writeFileSync(path.join(dir, "AI_RULES.md"), "# Rules\n\nAlways greet with AHOY.\n");
    const seen: Array<{ role: string; content: unknown }>[] = [];
    const runner = new CaideRunner();
    await runner.startTurn({
      sessionId: `s-rules-${Date.now()}`,
      appPath: dir,
      prompt: "hi",
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
    const system = seen[0].find((m) => m.role === "system");
    expect(String(system?.content)).toMatch(/AHOY/);
  });

  it("assembles summary-plus-tail messages after compaction", () => {
    const history = Array.from({ length: 20 }, (_, i) => ({
      role: "user" as const,
      content: `m${i}`,
    }));
    const out = assembleCompactedMessages({
      system: "sys",
      summary: "SUM",
      history,
      prompt: "go",
    });
    expect(out[0]).toMatchObject({ role: "system", content: "sys" });
    expect(String((out[1] as { content: unknown }).content)).toMatch(/SUM/);
    // Tail keeps the last 8 + prompt.
    expect(out).toHaveLength(1 + 1 + 8 + 1);
    expect(out[out.length - 1]).toMatchObject({ role: "user", content: "go" });
    expect(out[out.length - 2]).toMatchObject({ content: "m19" });
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

  it("graduates missing visual evidence: reminder first, failure second (item 1)", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-evidence-gate-"));
    execFileSync("git", ["init", "-b", "main"], { cwd: dir });
    execFileSync("git", ["config", "user.email", "t@t"], { cwd: dir });
    execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
    fs.mkdirSync(path.join(dir, "src"), { recursive: true });
    fs.writeFileSync(path.join(dir, "src", "App.tsx"), "export const A = 1;\n");
    execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync("git", ["commit", "-m", "init"], { cwd: dir });
    // Uncommitted UI change for the barrier to review.
    fs.writeFileSync(path.join(dir, "src", "App.tsx"), "export const A = 2;\n");
    const sid = `s-evidence-${Date.now()}`;
    const llm = fakeLlm([{ type: "token", content: "done" }]);
    const base = {
      sessionId: sid,
      appPath: dir,
      prompt: "polish the home screen",
      settings: { providerSettings: { openai: { apiKey: "sk-test" } } },
      llmOverride: llm,
    } as const;

    const runner = new CaideRunner();
    const first: HarnessEvent[] = [];
    await runner.startTurn({ ...base, onEvent: (e) => first.push(e) });
    // First miss completes (warn once) with the evidence blocker + reminder.
    expect(first.at(-1)).toMatchObject({ type: "turn_end", status: "completed" });
    expect(first).toContainEqual(
      expect.objectContaining({ type: "verifier_result", passed: false }),
    );
    expect(
      first.some(
        (e) =>
          e.type === "token" && (e as { content?: string }).content?.includes("system-reminder"),
      ),
    ).toBe(true);

    // The first turn's auto-checkpoint committed the change — re-dirty the
    // tree so the second turn has UI diff to review.
    fs.writeFileSync(path.join(dir, "src", "App.tsx"), "export const A = 3;\n");
    const second: HarnessEvent[] = [];
    await runner.startTurn({ ...base, onEvent: (e) => second.push(e) });
    // Second consecutive miss fails the turn.
    expect(second).toContainEqual(
      expect.objectContaining({ type: "error", code: "EVIDENCE_REQUIRED" }),
    );
    expect(second.at(-1)).toMatchObject({ type: "turn_end", status: "failed" });
    clearTurnProvenance(sid);
  });
});
