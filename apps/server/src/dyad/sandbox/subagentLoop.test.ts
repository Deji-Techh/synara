// FILE: subagentLoop.test.ts
// Purpose: Subagent loop + spawn settle paths with a fake LLM (no provider).

import { describe, expect, it } from "vitest";
import type { LLMAdapter } from "../../harness/loop/loop.ts";
import { defineTool } from "../../harness/tools/defineTool.ts";
import { z } from "zod";
import {
  clearTaskRegistries,
  formatSubagentStatus,
} from "./taskRegistry.ts";
import { runSubagentLoop, spawnSubagentTask } from "./subagentLoop.ts";

function fakeLlm(chunks: Array<{ type: "token"; content: string } | { type: "tool_call"; toolCall: { id: string; name: string; args: unknown } }>): LLMAdapter {
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
      llm: fakeLlm([{ type: "token", content: "Hel" }, { type: "token", content: "lo" }]),
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
    const result = await runSubagentLoop({
      appPath: "/tmp/caide-test-app",
      sessionId: "s-sub2",
      system: "sys",
      task: "do it",
      tools: [echoTool, spawn],
      llm: fakeLlm([
        { type: "tool_call", toolCall: { id: "c1", name: "spawn_subagent", args: {} } },
        { type: "token", content: "done" },
      ]),
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
});
