import { describe, it, expect, vi } from "vitest";
import {
  runLoop,
  type LLMAdapter,
  type ToolDefinition,
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
});
