import { describe, it, expect, vi } from "vitest";
import {
  runLoop,
  estimateMessagesTokens,
  repairToolPairing,
  DEFAULT_MAX_TOOL_CALL_STEPS,
  type LLMAdapter,
  type ToolDefinition,
  type ChatMessage,
  formatStructuredToolError,
} from "./loop.ts";
import { withRetry, isRecoverableError } from "./retry.ts";
import { Inbox } from "../inbox/index.ts";
import type { HarnessEvent } from "@caide/contracts";

describe("Milestone M3 — Stateless Loop, Retry, Events, and Inbox", () => {
  it("runs steps with a fake LLM and emits events in strict chronological order", async () => {
    let callCount = 0;
    const fakeLlm: LLMAdapter = {
      async *stream(messages) {
        callCount += 1;
        if (callCount <= 3) {
          yield { type: "token", content: `Thinking about step ${callCount}... ` };
          yield {
            type: "tool_call",
            toolCall: {
              id: `call-${callCount}`,
              name: "read_file",
              args: { path: `file${callCount}.ts` },
            },
          };
        } else {
          yield { type: "token", content: "All steps complete! Final answer." };
        }
      },
    };

    const mockTool: ToolDefinition = {
      name: "read_file",
      description: "Reads file contents",
      execute: async (args: any) => `content of ${args.path}`,
    };

    const emittedEvents: HarnessEvent[] = [];
    const loop = runLoop({
      sessionId: "session-loop-1",
      maxSteps: 10,
      llm: fakeLlm,
      tools: [mockTool],
      buildMessages: () => [{ role: "user", content: "Build feature" }],
      onEvent: (ev) => emittedEvents.push(ev),
    });

    const collectedFromGen: HarnessEvent[] = [];
    for await (const event of loop) {
      collectedFromGen.push(event);
    }

    expect(collectedFromGen.length).toBeGreaterThan(5);
    expect(collectedFromGen).toEqual(emittedEvents);

    // Verify stage, token, and tool_call progression
    const stages = emittedEvents.filter((e) => e.type === "stage");
    expect(stages.length).toBe(4);
    expect(stages[0].from).toBe("idle");
    expect(stages[0].to).toBe("step-0");

    const toolStarts = emittedEvents.filter(
      (e) => e.type === "tool_call" && (e as any).status === "started",
    );
    const toolCompletes = emittedEvents.filter(
      (e) => e.type === "tool_call" && (e as any).status === "completed",
    );
    expect(toolStarts.length).toBe(3);
    expect(toolCompletes.length).toBe(3);
  });

  it("stops immediately and cleanly when signal.abort() is triggered mid-execution", async () => {
    const abortController = new AbortController();

    const fakeLlm: LLMAdapter = {
      async *stream() {
        yield { type: "token", content: "Beginning generation..." };
        // Abort right after first token
        abortController.abort("Client requested stop");
        yield { type: "token", content: "This should be discarded after abort" };
      },
    };

    const emittedEvents: HarnessEvent[] = [];
    const loop = runLoop({
      sessionId: "session-abort",
      maxSteps: 5,
      signal: abortController.signal,
      llm: fakeLlm,
      buildMessages: () => [{ role: "user", content: "Long task" }],
      onEvent: (ev) => emittedEvents.push(ev),
    });

    for await (const _ of loop) {
      // drain
    }

    // Should stop cleanly after abort
    expect(
      emittedEvents.some((e) => e.type === "token" && (e as any).content.includes("Beginning")),
    ).toBe(true);
    expect(emittedEvents.filter((e) => e.type === "stage").length).toBe(1);
  });
  it("formats structured tool errors back to model rather than throwing raw unformatted stack traces", async () => {
    let stepCounter = 0;
    const fakeLlm: LLMAdapter = {
      async *stream() {
        if (stepCounter === 0) {
          stepCounter += 1;
          yield {
            type: "tool_call",
            toolCall: {
              id: "call-err-1",
              name: "write_file",
              args: { path: "/nonexistent/path.ts" },
            },
          };
        } else {
          yield { type: "token", content: "Handled error gracefully." };
        }
      },
    };

    const failingTool: ToolDefinition = {
      name: "write_file",
      description: "Writes a file",
      execute: async () => {
        throw new Error("ENOENT: no such file or directory, open '/nonexistent/path.ts'");
      },
    };

    const emittedEvents: HarnessEvent[] = [];
    const loop = runLoop({
      sessionId: "session-tool-error",
      maxSteps: 3,
      llm: fakeLlm,
      tools: [failingTool],
      buildMessages: () => [{ role: "user", content: "Write file" }],
      onEvent: (ev) => emittedEvents.push(ev),
    });

    for await (const _ of loop) {
      // drain
    }

    const failedToolEvents = emittedEvents.filter(
      (e) => e.type === "tool_call" && (e as any).status === "failed",
    );
    expect(failedToolEvents.length).toBe(1);
    const failurePayload = (failedToolEvents[0] as any).result;

    expect(failurePayload).toMatchObject({
      type: "ToolExecutionError",
      tool: "write_file",
      message: expect.stringContaining("ENOENT"),
      likelyCause: expect.stringContaining("Target file or resource path does not exist"),
      suggestedFix: expect.stringContaining("Verify the path"),
    });
  });

  it("withRetry retries on recoverable errors with backoff and fails after 3 attempts on persistent failures", async () => {
    let attempts = 0;
    const retryFn = vi.fn(async () => {
      attempts += 1;
      const err = new Error("429 Too Many Requests");
      (err as any).status = 429;
      throw err;
    });

    await expect(
      withRetry(retryFn, {
        maxAttempts: 3,
        initialDelayMs: 10,
        backoffFactor: 2,
      }),
    ).rejects.toThrow("429 Too Many Requests");

    expect(attempts).toBe(3);
    expect(retryFn).toHaveBeenCalledTimes(3);

    // Fast success on attempt 2
    let attemptCount = 0;
    const transientFn = vi.fn(async () => {
      attemptCount += 1;
      if (attemptCount === 1) {
        const err = new Error("ECONNRESET");
        (err as any).code = "ECONNRESET";
        throw err;
      }
      return "SUCCESS_DATA";
    });

    const result = await withRetry(transientFn, {
      maxAttempts: 3,
      initialDelayMs: 10,
    });
    expect(result).toBe("SUCCESS_DATA");
    expect(attemptCount).toBe(2);
  });

  it("applies inbox steer() instructions injected during a running turn at the next step boundary", async () => {
    const inbox = new Inbox();
    let stepCount = 0;
    let receivedMessagesAtStep1: any[] = [];

    const fakeLlm: LLMAdapter = {
      async *stream(messages) {
        stepCount += 1;
        if (stepCount === 1) {
          // Steer the model before step 2 executes
          inbox.steer("Please make sure to use TypeScript strict types!");
          yield {
            type: "tool_call",
            toolCall: { id: "c1", name: "step1Tool", args: {} },
          };
        } else {
          receivedMessagesAtStep1 = messages;
          yield { type: "token", content: "Incorporated user steering." };
        }
      },
    };

    const mockTool: ToolDefinition = {
      name: "step1Tool",
      description: "test tool",
      execute: async () => "ok",
    };

    const loop = runLoop({
      sessionId: "session-inbox-steer",
      maxSteps: 3,
      inbox,
      llm: fakeLlm,
      tools: [mockTool],
      buildMessages: () => [{ role: "user", content: "Original request" }],
    });

    for await (const _ of loop) {
      // drain
    }

    expect(stepCount).toBe(2);
    // Verify that the second step received the steering instruction injected during step 1
    const steerMessage = receivedMessagesAtStep1.find(
      (m) => typeof m.content === "string" && m.content.includes("TypeScript strict types"),
    );
    expect(steerMessage).toBeDefined();
    expect(steerMessage.content).toContain("[User Steering Instruction]");
  });

  it("applies the prepareStep hook to step messages before the LLM call", async () => {
    const seen: Array<{ step: number; count: number }> = [];
    const fakeLlm: LLMAdapter = {
      async *stream(messages) {
        seen.push({ step: seen.length, count: messages.length });
        yield { type: "token", content: "done" };
      },
    };
    const loop = runLoop({
      sessionId: "session-prepare-step",
      maxSteps: 1,
      llm: fakeLlm,
      buildMessages: () => [{ role: "user", content: "hi" }],
      prepareStep: ({ step, messages }) => [
        ...messages,
        { role: "user", content: `[injected at step ${step}]` },
      ],
    });
    for await (const _ of loop) {
      // drain
    }
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ step: 0, count: 2 });
  });

  it("ends the turn after a stopAfterTool executes (remaining calls still run)", async () => {
    let llmCalls = 0;
    const fakeLlm: LLMAdapter = {
      async *stream() {
        llmCalls += 1;
        yield {
          type: "tool_call",
          toolCall: { id: `c${llmCalls}`, name: "write_plan", args: {} },
        };
      },
    };
    const executed: string[] = [];
    const planTool: ToolDefinition = {
      name: "write_plan",
      description: "writes a plan",
      execute: async () => {
        executed.push("write_plan");
        return "plan written";
      },
    };
    const emitted: HarnessEvent[] = [];
    const loop = runLoop({
      sessionId: "session-stop-after-tool",
      maxSteps: 10,
      llm: fakeLlm,
      tools: [planTool],
      buildMessages: () => [{ role: "user", content: "plan this" }],
      stopAfterTool: ["write_plan"],
      onEvent: (ev) => emitted.push(ev),
    });
    for await (const _ of loop) {
      // drain
    }
    // One LLM step only (no follow-up generation), tool executed + completed.
    expect(llmCalls).toBe(1);
    expect(executed).toEqual(["write_plan"]);
    expect(
      emitted.filter((e) => e.type === "tool_call" && (e as { status: string }).status === "completed"),
    ).toHaveLength(1);
    expect(emitted.filter((e) => e.type === "stage")).toHaveLength(1);
  });

  it("selects the LLM adapter per step and tracks read-only state", async () => {
    const seen: Array<{ step: number; lastStepAllReadOnly: boolean; hasMutatedThisTurn: boolean }> = [];
    const used: string[] = [];
    const mkAdapter = (name: string): LLMAdapter => ({
      async *stream() {
        used.push(name);
        if (used.length === 1) {
          yield { type: "tool_call", toolCall: { id: "c1", name: "read_file", args: {} } };
        } else {
          yield { type: "token", content: "done" };
        }
      },
    });
    const main = mkAdapter("main");
    const scout = mkAdapter("scout");
    const readTool: ToolDefinition = { name: "read_file", description: "r", readOnly: true, execute: async () => "x" };
    const loop = runLoop({
      sessionId: "session-select-llm",
      maxSteps: 3,
      llm: main,
      tools: [readTool],
      buildMessages: () => [{ role: "user", content: "hi" }],
      selectLlm: (sel) => {
        seen.push(sel);
        return sel.step === 0 ? scout : main;
      },
    });
    for await (const _ of loop) {
      // drain
    }
    // Step 0 used the scout adapter; step 1 observed the read-only step 0.
    expect(used).toEqual(["scout", "main"]);
    expect(seen[0]).toMatchObject({ step: 0, lastStepAllReadOnly: true, hasMutatedThisTurn: false });
    expect(seen[1]).toMatchObject({ step: 1, lastStepAllReadOnly: true, hasMutatedThisTurn: false });
  });

  it("repairs orphaned tool blocks and estimates context", () => {
    const paired: ChatMessage[] = [
      { role: "assistant", content: [{ type: "tool_use", id: "a", name: "read_file", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "a", content: "x" }] },
    ];
    expect(repairToolPairing(paired)).toHaveLength(2);
    const orphanUse: ChatMessage[] = [
      { role: "assistant", content: [{ type: "tool_use", id: "a", name: "read_file", input: {} }] },
    ];
    const repaired = repairToolPairing(orphanUse);
    expect(repaired).toHaveLength(1);
    expect(repaired[0].content).toEqual([]);
    const orphanResult: ChatMessage[] = [
      { role: "user", content: [{ type: "tool_result", tool_use_id: "zzz", content: "x" }] },
    ];
    expect(repairToolPairing(orphanResult)[0].content).toEqual([]);
    const text: ChatMessage[] = [{ role: "user", content: "hi" }];
    expect(repairToolPairing(text)).toEqual(text);
    expect(estimateMessagesTokens(text)).toBe(1);
    expect(DEFAULT_MAX_TOOL_CALL_STEPS).toBe(100);
  });

  it("retries a terminated stream once with a continuation notice", async () => {
    let calls = 0;
    const flaky: LLMAdapter = {
      async *stream(messages) {
        calls += 1;
        if (calls === 1) {
          yield { type: "token", content: "partial" };
          throw new Error("connection reset");
        }
        const last = messages[messages.length - 1];
        expect(last.role).toBe("user");
        expect(String((last as { content: unknown }).content)).toMatch(/cut off/);
        yield { type: "token", content: "continued" };
      },
    };
    const events: HarnessEvent[] = [];
    const loop = runLoop({
      sessionId: "session-retry",
      maxSteps: 2,
      llm: flaky,
      buildMessages: () => [{ role: "user", content: "hi" }],
      onEvent: (ev) => events.push(ev),
    });
    const tokens: string[] = [];
    for await (const event of loop) {
      if (event.type === "token") tokens.push(event.content);
    }
    expect(calls).toBe(2);
    expect(tokens).toEqual(["partial", "continued"]);
    expect(events.some((e) => e.type === "error" && (e as { code: string }).code === "STEP_RETRY")).toBe(true);
  });

  it("gives up after retries are exhausted", async () => {
    const dead: LLMAdapter = {
      async *stream() {
        yield { type: "token", content: "x" };
        throw new Error("always down");
      },
    };
    const loop = runLoop({
      sessionId: "session-retry-exhaust",
      maxSteps: 2,
      maxStepRetries: 1,
      llm: dead,
      buildMessages: () => [{ role: "user", content: "hi" }],
    });
    await expect((async () => {
      for await (const _ of loop) {
        // drain
      }
    })()).rejects.toThrow("always down");
  });

  it("derives compaction thresholds from model windows", async () => {
    const { getCompactionThreshold } = await import("./loop.ts");
    expect(getCompactionThreshold(200_000)).toBe(175_000);
    expect(getCompactionThreshold(1_000_000)).toBe(250_000);
    expect(getCompactionThreshold(0)).toBe(100_000);
    expect(getCompactionThreshold(NaN)).toBe(100_000);
  });

  it("fires a compaction signal once past 70% of budget", async () => {
    const big = "x".repeat(4000);
    const events: HarnessEvent[] = [];
    const loop = runLoop({
      sessionId: "session-compact",
      maxSteps: 3,
      contextBudgetTokens: 100,
      llm: {
        async *stream() {
          yield { type: "token", content: "ok" };
        },
      },
      buildMessages: () => [{ role: "user", content: big }],
      onEvent: (ev) => events.push(ev),
    });
    for await (const _ of loop) {
      // drain
    }
    const signals = events.filter((e) => e.type === "compaction");
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ reason: "estimated-context" });
  });

  it("recovers text-serialized <function=> calls into real tool executions", async () => {
    let steps = 0;
    const fakeLlm: LLMAdapter = {
      async *stream() {
        steps += 1;
        if (steps === 1) {
          yield {
            type: "token",
            content:
              'Writing the profile screen.\n<function=write_file><parameter=content>hello</parameter><parameter=path>app/profile.tsx</parameter></function>',
          };
        } else {
          yield { type: "token", content: "Done." };
        }
      },
    };
    const executed: Array<{ name: string; args: unknown }> = [];
    const writeTool: ToolDefinition = {
      name: "write_file",
      description: "writes",
      execute: async (args: any) => {
        executed.push({ name: "write_file", args });
        return { ok: true };
      },
    };
    const events: HarnessEvent[] = [];
    const loop = runLoop({
      sessionId: "session-recovery",
      maxSteps: 5,
      llm: fakeLlm,
      tools: [writeTool],
      buildMessages: () => [{ role: "user", content: "write it" }],
      onEvent: (ev) => events.push(ev),
    });
    for await (const _ of loop) {
      // drain
    }
    expect(executed).toEqual([
      { name: "write_file", args: { content: "hello", path: "app/profile.tsx" } },
    ]);
    const statuses = events
      .filter((e) => e.type === "tool_call")
      .map((e) => (e as any).status);
    expect(statuses).toEqual(["started", "completed"]);
  });

  it("skips recovery when native calls exist and ignores unknown tools", async () => {
    let steps = 0;
    const fakeLlm: LLMAdapter = {
      async *stream() {
        steps += 1;
        if (steps === 1) {
          yield { type: "token", content: " aquick note " };
          yield {
            type: "tool_call",
            toolCall: { id: "c1", name: "read_file", args: { path: "a.ts" } },
          };
        } else if (steps === 2) {
          yield {
            type: "token",
            content: "<function=definitely_not_a_tool><parameter=x>y</parameter></function>",
          };
        } else {
          yield { type: "token", content: "Done." };
        }
      },
    };
    const executed: string[] = [];
    const tools: ToolDefinition[] = [
      {
        name: "read_file",
        description: "reads",
        readOnly: true,
        execute: async () => {
          executed.push("read_file");
          return "content";
        },
      },
      {
        name: "write_file",
        description: "writes",
        execute: async () => {
          executed.push("write_file");
          return { ok: true };
        },
      },
    ];
    const events: HarnessEvent[] = [];
    const loop = runLoop({
      sessionId: "session-recovery-skip",
      maxSteps: 5,
      llm: fakeLlm,
      tools,
      buildMessages: () => [{ role: "user", content: "go" }],
      onEvent: (ev) => events.push(ev),
    });
    for await (const _ of loop) {
      // drain
    }
    // Native call ran; the unknown text call produced no tool events.
    expect(executed).toEqual(["read_file"]);
    expect(
      events.filter((e) => e.type === "tool_call" && (e as any).name === "definitely_not_a_tool"),
    ).toHaveLength(0);
  });

  it("resolves donor tool aliases to registry tools instead of failing", async () => {    const executed: string[] = [];
    let calls = 0;
    const fakeLlm: LLMAdapter = {
      async *stream() {
        calls += 1;
        if (calls === 1) {
          yield {
            type: "tool_call",
            toolCall: { id: "c-alias", name: "list_files", args: { path: "." } },
          };
        } else {
          yield { type: "token", content: "done" };
        }
      },
    };
    const tools: ToolDefinition[] = [
      {
        name: "list_dir",
        description: "lists",
        execute: async () => {
          executed.push("list_dir");
          return ["a.ts"];
        },
      },
    ];
    const events: HarnessEvent[] = [];
    const loop = runLoop({
      sessionId: "session-alias",
      maxSteps: 5,
      llm: fakeLlm,
      tools,
      buildMessages: () => [{ role: "user", content: "go" }],
      onEvent: (ev) => events.push(ev),
    });
    for await (const _ of loop) {
      // drain
    }
    expect(executed).toEqual(["list_dir"]);
    const completed = events.filter(
      (e) => e.type === "tool_call" && (e as any).status === "completed",
    );
    expect(completed).toHaveLength(1);
    expect((completed[0] as any).name).toBe("list_dir");
  });

  it("feeds step results back so later steps see tool outputs and errors", async () => {
    const seenByStep: unknown[][] = [];
    let calls = 0;
    const fakeLlm: LLMAdapter = {
      async *stream(messages) {
        calls += 1;
        seenByStep.push(JSON.parse(JSON.stringify(messages)));
        if (calls === 1) {
          yield {
            type: "tool_call",
            toolCall: { id: "c-fb", name: "read_file", args: { path: "a.ts" } },
          };
        } else if (calls === 2) {
          yield {
            type: "tool_call",
            toolCall: { id: "c-err", name: "nope_missing", args: {} },
          };
        } else {
          yield { type: "token", content: "done" };
        }
      },
    };
    const tools: ToolDefinition[] = [
      {
        name: "read_file",
        description: "reads",
        execute: async () => "FILE-CONTENTS-123",
      },
    ];
    const loop = runLoop({
      sessionId: "session-feedback",
      maxSteps: 5,
      llm: fakeLlm,
      tools,
      buildMessages: () => [{ role: "user", content: "go" }],
      onEvent: () => {},
    });
    for await (const _ of loop) {
      // drain
    }
    expect(calls).toBe(3);
    // Step 2 sees step 1's success result.
    const step2 = JSON.stringify(seenByStep[1]);
    expect(step2).toContain("FILE-CONTENTS-123");
    expect(step2).toContain("tool_result");
    // Step 3 sees step 2's unknown-tool failure.
    const step3 = JSON.stringify(seenByStep[2]);
    expect(step3).toContain("Unknown tool");
    expect(step3).toContain("is_error");
  });
});
