import { describe, it, expect } from "vitest";
import { recoverTextToolCalls, stripRecoveredToolCalls } from "./textToolCallRecovery.ts";

describe("recoverTextToolCalls", () => {
  const knownTools = new Set(["list_dir", "read_file", "write_file", "git_status"]);
  const isKnown = (name: string) => knownTools.has(name);

  it("recovers Anthropic-style JSON array of tool_use (the OpenRouter free model bug)", () => {
    const raw = `I'd love to help you build a fitness app! Let me start by understanding what's already in the workspace and then we can brainstorm the specifics together.

[{"type":"tool_use","id":"call_7044c910a1c7483fa6c7de70","name":"list_dir","input":{"path":"app"}},{"type":"tool_use","id":"call_7044c910a1c7483fa6c7de70","name":"list_dir","input":{"path":"src"}},{"type":"tool_use","id":"call_7044c910a1c7483fa6c7de70","name":"read_file","input":{"path":"package.json"}},{"type":"tool_use","id":"call_7044c910a1c7483fa6c7de70","name":"read_file","input":{"path":"app.json"}}]`;

    const recovered = recoverTextToolCalls(raw, isKnown);
    expect(recovered).toHaveLength(4);
    expect(recovered[0]).toEqual({
      id: "call_7044c910a1c7483fa6c7de70",
      name: "list_dir",
      args: { path: "app" },
    });
    expect(recovered[1]?.name).toBe("list_dir");
    expect(recovered[1]?.args).toEqual({ path: "src" });
    // Unique ID generation when identical IDs are serialized
    expect(recovered[1]?.id).toBe("call_7044c910a1c7483fa6c7de70-0");
    expect(recovered[2]?.name).toBe("read_file");
    expect(recovered[2]?.args).toEqual({ path: "package.json" });
    expect(recovered[3]?.name).toBe("read_file");
    expect(recovered[3]?.args).toEqual({ path: "app.json" });
  });

  it("recovers Anthropic-style single JSON object tool_use", () => {
    const raw = `Checking repository...
{"type":"tool_use","id":"call_abc123","name":"git_status","input":{}}`;

    const recovered = recoverTextToolCalls(raw, isKnown);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toEqual({
      id: "call_abc123",
      name: "git_status",
      args: {},
    });
  });

  it("recovers OpenAI-style tool calls and stringified arguments", () => {
    const raw = `[{"name":"read_file","arguments":"{\\"path\\":\\"src/App.tsx\\"}"}]`;

    const recovered = recoverTextToolCalls(raw, isKnown);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.name).toBe("read_file");
    expect(recovered[0]?.args).toEqual({ path: "src/App.tsx" });
  });

  it("recovers tool calls inside markdown code fences", () => {
    const raw = `Here are the tools:
\`\`\`json
[
  {
    "type": "tool_use",
    "id": "call_1",
    "name": "list_dir",
    "input": { "path": "." }
  }
]
\`\`\``;

    const recovered = recoverTextToolCalls(raw, isKnown);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.name).toBe("list_dir");
    expect(recovered[0]?.args).toEqual({ path: "." });
  });

  it("ignores unknown tools so unhandled text stays visible for debugging", () => {
    const raw = `[{"type":"tool_use","id":"call_1","name":"unknown_magic_tool","input":{}}]`;
    const recovered = recoverTextToolCalls(raw, isKnown);
    expect(recovered).toHaveLength(0);
  });

  it("strips recovered tool calls cleanly from assistant text", () => {
    const raw = `I'd love to help you build a fitness app!

[{"type":"tool_use","id":"call_7044c910a1c7483fa6c7de70","name":"list_dir","input":{"path":"app"}}]`;

    const cleaned = stripRecoveredToolCalls(raw);
    expect(cleaned).toBe("I'd love to help you build a fitness app!");
  });

  it("strips code fences containing tool calls", () => {
    const raw = `Let me check that.

\`\`\`json
[{"type":"tool_use","name":"list_dir","input":{"path":"app"}}]
\`\`\`

I will report back soon.`;

    const cleaned = stripRecoveredToolCalls(raw);
    expect(cleaned).toBe("Let me check that.\n\nI will report back soon.");
  });
});
