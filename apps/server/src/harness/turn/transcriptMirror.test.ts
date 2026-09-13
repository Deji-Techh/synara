// FILE: transcriptMirror.test.ts
// Purpose: Harness→transcript mirror — user/assistant rows appear, stream,
// and complete; replays never duplicate; unknown threads are ignored.

import { describe, expect, it, vi } from "vitest";
import { createTranscriptMirror } from "./transcriptMirror.ts";

function setup() {
  const threads: any[] = [{ id: "t-1", title: "New Chat", messages: [], updatedAt: "" }];
  const published: Array<{ threadId: string; msg: any }> = [];
  const saves: number[] = [];
  const { mirrorHarnessTurnEvent } = createTranscriptMirror({
    findThread: (id) => threads.find((t) => t.id === id),
    publishMessage: (threadId, msg) => published.push({ threadId, msg }),
    save: () => saves.push(1),
  });
  return { threads, published, saves, mirrorHarnessTurnEvent };
}

describe("transcriptMirror", () => {
  it("appends user + streaming assistant rows on turn_start", () => {
    const { threads, published, mirrorHarnessTurnEvent } = setup();
    mirrorHarnessTurnEvent({
      type: "turn_start",
      sessionId: "t-1",
      turnId: "turn-9",
      prompt: "hey there, this is a longer greeting",
    });
    expect(threads[0].messages).toHaveLength(2);
    expect(threads[0].messages[0]).toMatchObject({
      role: "user",
      text: "hey there, this is a longer greeting",
    });
    expect(threads[0].messages[1]).toMatchObject({
      role: "assistant",
      text: "",
      streaming: true,
    });
    // No title write: titles belong to the AI-naming chain (skeleton →
    // generated → Chat N). A raw slice would pose as a manual rename and
    // suppress AI naming.
    expect(threads[0].title).toBe("New Chat");
    expect(published).toHaveLength(2);
  });

  it("streams token deltas and finalizes on turn_end", async () => {
    const { threads, mirrorHarnessTurnEvent } = setup();
    mirrorHarnessTurnEvent({
      type: "turn_start",
      sessionId: "t-1",
      turnId: "turn-9",
      prompt: "hey",
    });
    mirrorHarnessTurnEvent({ type: "token", sessionId: "t-1", content: "Hello " });
    mirrorHarnessTurnEvent({ type: "token", sessionId: "t-1", content: "world" });
    const assistant = threads[0].messages[1];
    expect(assistant.text).toBe("Hello world");
    // Throttled publish fires shortly after.
    await new Promise((r) => setTimeout(r, 150));
    mirrorHarnessTurnEvent({
      type: "turn_end",
      sessionId: "t-1",
      turnId: "turn-9",
      status: "completed",
    });
    expect(assistant.streaming).toBe(false);
    expect(assistant.text).toBe("Hello world");
  });

  it("ignores replays (same turn_start twice) and unknown threads", () => {
    const { threads, published, mirrorHarnessTurnEvent } = setup();
    const start = { type: "turn_start", sessionId: "t-1", turnId: "turn-9", prompt: "hey" };
    mirrorHarnessTurnEvent(start);
    mirrorHarnessTurnEvent(start);
    expect(threads[0].messages).toHaveLength(2);
    mirrorHarnessTurnEvent({
      type: "turn_start",
      sessionId: "nope",
      turnId: "turn-1",
      prompt: "hey",
    });
    mirrorHarnessTurnEvent({ type: "token", sessionId: "nope", content: "x" });
    expect(published).toHaveLength(2);
  });

  it("a failing mirror never throws", () => {
    const { mirrorHarnessTurnEvent } = setup();
    expect(() => mirrorHarnessTurnEvent(null)).not.toThrow();
    expect(() => mirrorHarnessTurnEvent({})).not.toThrow();
    expect(() => mirrorHarnessTurnEvent({ type: "token" })).not.toThrow();
  });

  it("turn_end without a prior turn_start still settles the newest streaming row", () => {
    const { threads, mirrorHarnessTurnEvent } = setup();
    // Simulate a missed turn_start (restart mid-turn): rows exist, no open entry.
    threads[0].messages.push({
      id: "msg-harness-asst-turn-old",
      role: "assistant",
      text: "partial…",
      turnId: "turn-old",
      streaming: true,
    });
    mirrorHarnessTurnEvent({
      type: "turn_end",
      sessionId: "t-1",
      turnId: "turn-old",
      status: "cancelled",
    });
    expect(threads[0].messages[0].streaming).toBe(false);
    expect(threads[0].messages[0].text).toBe("partial…");
  });

  it("appends error events to the open assistant row", () => {
    const { threads, mirrorHarnessTurnEvent } = setup();
    mirrorHarnessTurnEvent({
      type: "turn_start",
      sessionId: "t-1",
      turnId: "turn-9",
      prompt: "hey",
    });
    mirrorHarnessTurnEvent({ type: "token", sessionId: "t-1", content: "Working. " });
    mirrorHarnessTurnEvent({
      type: "error",
      sessionId: "t-1",
      code: "TURN_FAILED",
      message: "boom happened here",
      recoverable: true,
    });
    expect(threads[0].messages[1].text).toContain("Working.");
    expect(threads[0].messages[1].text).toContain("Error: boom happened here");
    // Errors with no open turn are ignored (dock card still shows them).
    mirrorHarnessTurnEvent({
      type: "error",
      sessionId: "t-unknown",
      code: "X",
      message: "y",
      recoverable: true,
    });
  });

  it("projects tool calls as caide-tool tags that close on completion", () => {
    const { threads, mirrorHarnessTurnEvent } = setup();
    mirrorHarnessTurnEvent({
      type: "turn_start",
      sessionId: "t-1",
      turnId: "turn-9",
      prompt: "hey",
    });
    mirrorHarnessTurnEvent({
      type: "tool_call",
      sessionId: "t-1",
      id: "c1",
      name: "read_file",
      args: { path: "src/App.tsx" },
      status: "started",
    });
    const assistant = threads[0].messages[1];
    // Open tag renders as a running group item (complete = closing tag seen).
    expect(assistant.text).toContain('<caide-tool name="read_file"');
    expect(assistant.text).toContain('path="src/App.tsx"');
    expect(assistant.text).not.toContain("</caide-tool>");
    mirrorHarnessTurnEvent({
      type: "tool_call",
      sessionId: "t-1",
      id: "c1",
      name: "read_file",
      args: { path: "src/App.tsx" },
      status: "completed",
      result: "file contents here",
    });
    expect(assistant.text).toContain('status="complete"');
    expect(assistant.text).toContain("file contents here");
    expect(assistant.text).toContain("</caide-tool>");
  });

  it("skips interactive and approval tools (their cards are the surface)", () => {
    const { threads, mirrorHarnessTurnEvent } = setup();
    mirrorHarnessTurnEvent({
      type: "turn_start",
      sessionId: "t-1",
      turnId: "turn-9",
      prompt: "hey",
    });
    for (const name of [
      "planning_questionnaire",
      "ask_env_vars",
      "write_plan",
      "write_app_blueprint",
    ]) {
      mirrorHarnessTurnEvent({
        type: "tool_call",
        sessionId: "t-1",
        id: `c-${name}`,
        name,
        args: {},
        status: "started",
      });
    }
    expect(threads[0].messages[1].text).toBe("");
  });

  it("closes dangling tool tags on turn_end", () => {
    const { threads, mirrorHarnessTurnEvent } = setup();
    mirrorHarnessTurnEvent({
      type: "turn_start",
      sessionId: "t-1",
      turnId: "turn-9",
      prompt: "hey",
    });
    mirrorHarnessTurnEvent({
      type: "tool_call",
      sessionId: "t-1",
      id: "c1",
      name: "run_command",
      args: {},
      status: "started",
    });
    mirrorHarnessTurnEvent({
      type: "turn_end",
      sessionId: "t-1",
      turnId: "turn-9",
      status: "cancelled",
    });
    const text: string = threads[0].messages[1].text;
    expect(text).toContain("</caide-tool>");
    expect(threads[0].messages[1].streaming).toBe(false);
  });
});
