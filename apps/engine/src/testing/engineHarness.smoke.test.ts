// FILE: src/testing/engineHarness.smoke.test.ts
// Purpose: Smoke test for setupEngineHarness — proves the full engine flow:
// real agent loop (AI-SDK streamText over HTTP) -> in-process fake-LLM server
// (serving apps/engine/fixtures via tc=) -> real git workspace. The M2
// verification backbone (plan import order step 2).
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setupEngineHarness, type EngineHarness } from "./engineHarness.ts";

describe("engine harness (smoke)", () => {
  let harness: EngineHarness;

  beforeAll(async () => {
    harness = await setupEngineHarness({
      seedFiles: {
        "README.md": "# hello\n",
        "lib/main.dart": "void main() {}\n",
      },
    });
  }, 30_000);

  afterAll(async () => {
    await harness?.dispose();
  });

  it("runs a real agent turn against the fake LLM and streams text", async () => {
    const deltas: string[] = [];
    const result = await harness.runTurn("tc=build-plan", {
      onTextDelta: (delta) => deltas.push(delta),
    });

    expect(result.text).toContain("hello world Flutter app");
    expect(result.text).toContain("flutter create");
    expect(deltas.join("")).toBe(result.text);
    expect(deltas.length).toBeGreaterThan(1);
    expect(result.usage.totalTokens).toBeGreaterThan(0);
  }, 30_000);

  it("appends turns to the agent's in-memory history", async () => {
    expect(harness.agent.conversation.length).toBe(2);
    await harness.runTurn("[increment]");
    expect(harness.agent.conversation).toHaveLength(4);
    const last = harness.agent.conversation[harness.agent.conversation.length - 1];
    expect(last.role).toBe("assistant");
    expect(last.content).toMatch(/counter=\d+/);
  }, 30_000);

  it("exposes the seeded workspace as a real git repo", () => {
    expect(harness.workspaceFileExists("README.md")).toBe(true);
    expect(harness.readWorkspaceFile("lib/main.dart")).toBe("void main() {}\n");
    expect(harness.gitLog()).toHaveLength(1);
    expect(harness.gitLog()[0]).toMatch(/chore: initial commit$/);
    expect(harness.getWorkspaceFiles().map((f) => f.relativePath)).toEqual([
      "README.md",
      "lib/main.dart",
    ]);
  });

  it("captures [dump] request payloads for assertions", async () => {
    await harness.runTurn("[dump]");
    const dump = harness.getServerDump();
    const parsed = dump.parsed as {
      body: { model: string; messages: Array<{ role: string }> };
    };
    expect(parsed.body.model).toBe("test-model");
    expect(parsed.body.messages[parsed.body.messages.length - 1].role).toBe("user");
    expect(harness.getServerDumpText()).toContain('"model": "test-model"');
  }, 30_000);

  it("rejects a second setup before the active harness is disposed", async () => {
    await expect(setupEngineHarness()).rejects.toThrow(
      "Second engine harness setup in one process",
    );
  });

  it("dispose closes the server and removes the temp workspace", async () => {
    const workspaceDir = harness.workspaceDir;
    await harness.dispose();
    const { existsSync } = await import("node:fs");
    expect(existsSync(workspaceDir)).toBe(false);
  });
});