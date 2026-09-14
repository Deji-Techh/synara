// FILE: subagentLoop.test.ts
// Purpose: Subagent loop + spawn settle paths with a fake LLM (no provider).

import { describe, expect, it } from "vitest";
import type { LLMAdapter } from "../../harness/loop/loop.ts";
import { defineTool } from "../../harness/tools/defineTool.ts";
import { z } from "zod";
import { clearTaskRegistries, formatSubagentStatus } from "./taskRegistry.ts";
import { runSubagentLoop, spawnSubagentTask } from "./subagentLoop.ts";

function fakeLlm(
  chunks: Array<
    | { type: "token"; content: string }
    | { type: "tool_call"; toolCall: { id: string; name: string; args: unknown } }
  >,
): LLMAdapter {
  return {
    async *stream() {
      for (const chunk of chunks) yield chunk as never;
    },
  };
}

const echoTool = defineTool({
  name: "echo_note",
  description: "test echo",
  schema: z.object({ text: z.string() }),
  readOnly: true,
  modifiesState: false,
  execute: async (args) => `noted: ${(args as any).text}`,
});

describe("dyad subagent loop", () => {
  it("collects final text across token-only steps", async () => {
    const result = await runSubagentLoop({
      appPath: "/tmp/caide-test-app",
      sessionId: "s-sub",
      system: "sys",
      task: "do it",
      tools: [echoTool],
      llm: fakeLlm([
        { type: "token", content: "Hel" },
        { type: "token", content: "lo" },
      ]),
    });
    expect(result.finalText).toBe("Hello");
    expect(result.stepCount).toBeGreaterThanOrEqual(1);
  });

  it("excludes control tools and executes the rest with appPath", async () => {
    const spawn = defineTool({
      name: "spawn_subagent",
      description: "must be excluded",
      schema: z.object({}),
      readOnly: true,
      modifiesState: false,
      execute: async () => {
        throw new Error("must never run");
      },
    });
    let calls = 0;
    const onceLlm: LLMAdapter = {
      async *stream() {
        calls += 1;
        if (calls === 1) {
          yield {
            type: "tool_call",
            toolCall: { id: "c1", name: "spawn_subagent", args: {} },
          } as never;
        } else {
          yield { type: "token", content: "done" } as never;
        }
      },
    };
    const result = await runSubagentLoop({
      appPath: "/tmp/caide-test-app",
      sessionId: "s-sub2",
      system: "sys",
      task: "do it",
      tools: [echoTool, spawn],
      llm: onceLlm,
    });
    expect(result.finalText).toContain("done");
  });

  it("spawn settles the registry for status polling", async () => {
    clearTaskRegistries();
    const id = spawnSubagentTask({
      appPath: "/tmp/caide-test-app",
      sessionId: "s-sub3",
      role: "reviewer",
      task: "review",
      tools: [echoTool],
      llm: fakeLlm([{ type: "token", content: "LGTM" }]),
    });
    expect(id).toMatch(/^subagent-/);
    for (let i = 0; i < 50 && formatSubagentStatus(id).includes("still running"); i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(formatSubagentStatus(id)).toContain("LGTM");
    clearTaskRegistries();
  });

  it("explorer persona excludes mutating tools, generic keeps them", async () => {
    const writer = defineTool({
      name: "write_file",
      description: "writes",
      schema: z.object({}),
      readOnly: false,
      modifiesState: true,
      execute: async () => {
        throw new Error("explorer must never write");
      },
    });
    let calls = 0;
    const onceLlm: LLMAdapter = {
      async *stream() {
        calls += 1;
        if (calls === 1) {
          yield {
            type: "tool_call",
            toolCall: { id: "c1", name: "write_file", args: {} },
          } as never;
        } else {
          yield { type: "token", content: "read-only done" } as never;
        }
      },
    };
    const explorerOut = await runSubagentLoop({
      appPath: "/tmp/caide-test-app",
      sessionId: "s-exp",
      system: "sys",
      task: "look",
      tools: [echoTool, writer],
      llm: onceLlm,
      persona: "explorer",
    });
    // write_file is not offered: unknown-tool failure, then the token.
    expect(explorerOut.finalText).toContain("read-only done");
  });

  it("mutating subagent tools need consent posture", async () => {
    const runner = defineTool({
      name: "run_command",
      description: "runs (ask-by-default in the catalog)",
      schema: z.object({}),
      readOnly: false,
      modifiesState: true,
      execute: async () => "ran",
    });
    // No channel and no stored allow → declined every step, which now fails
    // loud as VALIDATION_LOOP instead of looping silently to maxSteps.
    await expect(
      runSubagentLoop({
        appPath: "/tmp/caide-test-app",
        sessionId: "s-noconsent",
        system: "sys",
        task: "run",
        tools: [runner],
        llm: fakeLlm([
          { type: "tool_call", toolCall: { id: "c1", name: "run_command", args: {} } },
          { type: "token", content: "blocked" },
        ]),
      }),
    ).rejects.toThrow(/VALIDATION_LOOP/);
  });
});
