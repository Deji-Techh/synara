// FILE: src/agent/tools/fileTools.integration.test.ts
// Purpose: Proves the M3 tool system end to end: the real agent loop (AI-SDK
// streamText over HTTP, multi-step via stopWhen) calls the real write_file /
// read_file / list_files tools, the fake-LLM streams a tool call with explicit
// JSON args, the tool executes against the real workspace, and the model gets
// the result back. Uses ONLY local fake services — no flutter binary needed.
// Layer: Engine integration test
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setupEngineHarness, type EngineHarness } from "../../testing/engineHarness.ts";
import { fileTools } from "./fileTools.ts";

describe("agent tool chain (file tools)", () => {
  let harness: EngineHarness;

  beforeAll(async () => {
    harness = await setupEngineHarness({
      tools: fileTools,
      seedFiles: {
        "lib/main.dart": "void main() {}\n",
      },
    });
  }, 30_000);

  afterAll(async () => {
    await harness?.dispose();
  });

  it("executes a tool call from the model and feeds the result back", async () => {
    const toolCalls: Array<{ name: string; args: unknown }> = [];
    const result = await harness.runTurn(
      '[call_tool=write_file:{"path":"lib/counter.dart","content":"int add(int a, int b) => a + b;\\n"}]',
      { onToolCall: (call: { name: string; args: unknown }) => toolCalls.push(call) },
    );

    // The model called write_file; the loop executed it and then the model
    // produced its final answer (the fake LLM's canned message).
    expect(toolCalls).toEqual([
      {
        name: "write_file",
        args: { path: "lib/counter.dart", content: "int add(int a, int b) => a + b;\n" },
      },
    ]);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.name).toBe("write_file");

    // The tool executed against the real workspace.
    expect(harness.readWorkspaceFile("lib/counter.dart")).toBe("int add(int a, int b) => a + b;\n");

    // The model's final answer came after the tool result was fed back.
    expect(result.text).toContain("hello world from the caide engine fake LLM");
  }, 30_000);

  it("chains multiple tool calls in one turn", async () => {
    const result = await harness.runTurn(
      [
        '[call_tool=write_file:{"path":"notes.md","content":"# Notes\\n"}]',
        '[call_tool=read_file:{"path":"notes.md"}]',
      ].join(" "),
    );

    expect(result.toolCalls.map((call) => call.name)).toEqual(["write_file", "read_file"]);
    expect(harness.readWorkspaceFile("notes.md")).toBe("# Notes\n");
  }, 30_000);

  it("reports list_files output to the model", async () => {
    const result = await harness.runTurn('[call_tool=list_files:{"path":"lib"}]');

    expect(result.toolCalls.map((call) => call.name)).toEqual(["list_files"]);
    // The final answer includes the tool's listing (fed back into context).
    expect(result.text).toContain("hello world from the caide engine fake LLM");
  }, 30_000);
});
