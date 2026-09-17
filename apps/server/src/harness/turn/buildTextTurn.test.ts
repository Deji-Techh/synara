// FILE: buildTextTurn.test.ts
// Purpose: 008-m9b gate — build text turn: direct apply, dry-run repair,
// unclosed-write continuation, and empty-response handling. Scripted fake
// LLM; temp workspace; no provider calls.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { HarnessEvent } from "@caide/contracts";
import type { ChatMessage } from "../session/buildChain.ts";
import type { LLMAdapter } from "../loop/loop.ts";
import { runBuildTextTurn } from "./buildTextTurn.ts";

function workspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-buildtext-"));
  fs.writeFileSync(path.join(dir, "app.ts"), "line one\nline two\nline three\n");
  return dir;
}

/** Scripted adapter: each stream() call emits the next queued text as one token. */
function scriptedLlm(texts: string[], seenMessages: ChatMessage[][] = []): LLMAdapter {
  const queue = [...texts];
  return {
    async *stream(messages) {
      seenMessages.push(messages);
      const text = queue.shift() ?? "";
      if (text) yield { type: "token", content: text };
    },
  };
}

function harness() {
  const events: HarnessEvent[] = [];
  return {
    events,
    onEvent: (e: HarnessEvent): void => {
      events.push(e);
    },
  };
}

const baseMessages = (extra: ChatMessage[]): Promise<ChatMessage[]> =>
  Promise.resolve([{ role: "user", content: "build a thing" }, ...extra]);

describe("runBuildTextTurn (donor build path)", () => {
  it("streams text with no tools and applies write tags directly", async () => {
    const dir = workspace();
    const { events, onEvent } = harness();
    const result = await runBuildTextTurn({
      sessionId: "s-bt-apply",
      turnId: "t-1",
      appPath: dir,
      framework: "website",
      llm: scriptedLlm([
        'Intro text\n<dyad-write path="src/a.ts">export const a = 1;</dyad-write>\nDone',
      ]),
      buildMessages: baseMessages,
      onEvent,
    });
    expect(result.applied?.writtenFiles).toContain("src/a.ts");
    expect(fs.readFileSync(path.join(dir, "src/a.ts"), "utf8")).toBe("export const a = 1;");
    expect(events).toContainEqual(
      expect.objectContaining({ type: "artifact_updated", path: "src/a.ts" }),
    );
    expect(events.filter((e) => e.type === "token").length).toBeGreaterThan(0);
  });

  it("repairs a bad search-replace via the fix loop, then applies", async () => {
    const dir = workspace();
    const { events, onEvent } = harness();
    const seen: ChatMessage[][] = [];
    const result = await runBuildTextTurn({
      sessionId: "s-bt-repair",
      turnId: "t-2",
      appPath: dir,
      llm: scriptedLlm(
        [
          '<dyad-search-replace path="app.ts"><<<<<<< SEARCH\nabsent line\n=======\ny\n>>>>>>> REPLACE</dyad-search-replace>',
          '<dyad-write path="app.ts">fixed\n</dyad-write>',
        ],
        seen,
      ),
      buildMessages: baseMessages,
      onEvent,
    });
    expect(seen.length).toBe(2);
    // Second pass carries the fix prompt after the accumulated response.
    const secondPass = JSON.stringify(seen[1]);
    expect(secondPass).toContain("dyad-search-replace");
    expect(secondPass).toContain("read the latest version");
    expect(result.applied?.writtenFiles).toContain("app.ts");
    expect(fs.readFileSync(path.join(dir, "app.ts"), "utf8")).toBe("fixed");
    expect(events.map((e) => e.type)).toContain("token");
  });

  it("continues an unclosed write tag before applying", async () => {
    const dir = workspace();
    const { onEvent } = harness();
    const seen: ChatMessage[][] = [];
    const result = await runBuildTextTurn({
      sessionId: "s-bt-cont",
      turnId: "t-3",
      appPath: dir,
      llm: scriptedLlm(
        ['<dyad-write path="half.ts">const half = 1;', "\nconst done = 2;</dyad-write>"],
        seen,
      ),
      buildMessages: baseMessages,
      onEvent,
    });
    expect(seen.length).toBe(2);
    expect(JSON.stringify(seen[1])).toContain("Continue exactly where you left off");
    expect(result.applied?.writtenFiles).toContain("half.ts");
    expect(fs.readFileSync(path.join(dir, "half.ts"), "utf8")).toContain("const done = 2;");
  });

  it("reports an empty model response instead of completing silently", async () => {
    const dir = workspace();
    const { events, onEvent } = harness();
    const result = await runBuildTextTurn({
      sessionId: "s-bt-empty",
      turnId: "t-4",
      appPath: dir,
      llm: scriptedLlm([""]),
      buildMessages: baseMessages,
      onEvent,
    });
    expect(result.applied).toBeNull();
    expect(events).toContainEqual(
      expect.objectContaining({ type: "error", code: "BUILD_EMPTY_RESPONSE" }),
    );
  });

  it("stops cleanly when aborted mid-stream", async () => {
    const dir = workspace();
    const { onEvent } = harness();
    const controller = new AbortController();
    controller.abort("cancelled");
    const result = await runBuildTextTurn({
      sessionId: "s-bt-abort",
      turnId: "t-5",
      appPath: dir,
      signal: controller.signal,
      llm: scriptedLlm(['<dyad-write path="x.ts">x</dyad-write>']),
      buildMessages: baseMessages,
      onEvent,
    });
    expect(result.applied).toBeNull();
    expect(fs.existsSync(path.join(dir, "x.ts"))).toBe(false);
  });
});
