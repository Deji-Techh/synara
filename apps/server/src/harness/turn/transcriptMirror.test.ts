// FILE: transcriptMirror.test.ts
// Purpose: Harness→transcript mirror — user/assistant rows appear, stream,
// and complete; replays never duplicate; unknown threads are ignored.

import { describe, expect, it, vi } from "vitest";
import { createTranscriptMirror } from "./transcriptMirror.ts";

function setup() {
  const threads: any[] = [
    { id: "t-1", title: "New Chat", messages: [], updatedAt: "" },
  ];
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
    expect(threads[0].messages[0]).toMatchObject({ role: "user", text: "hey there, this is a longer greeting" });
    expect(threads[0].messages[1]).toMatchObject({
      role: "assistant",
      text: "",
      streaming: true,
    });
    // Legacy behavior: first message titles an untitled thread.
    expect(threads[0].title).toBe("hey there, this is a longer greeting".slice(0, 36).trim());
    expect(published).toHaveLength(2);
  });

  it("streams token deltas and finalizes on turn_end", async () => {
    const { threads, mirrorHarnessTurnEvent } = setup();
    mirrorHarnessTurnEvent({ type: "turn_start", sessionId: "t-1", turnId: "turn-9", prompt: "hey" });
    mirrorHarnessTurnEvent({ type: "token", sessionId: "t-1", content: "Hello " });
    mirrorHarnessTurnEvent({ type: "token", sessionId: "t-1", content: "world" });
    const assistant = threads[0].messages[1];
    expect(assistant.text).toBe("Hello world");
    // Throttled publish fires shortly after.
    await new Promise((r) => setTimeout(r, 150));
    mirrorHarnessTurnEvent({ type: "turn_end", sessionId: "t-1", turnId: "turn-9", status: "completed" });
    expect(assistant.streaming).toBe(false);
    expect(assistant.text).toBe("Hello world");
  });

  it("ignores replays (same turn_start twice) and unknown threads", () => {
    const { threads, published, mirrorHarnessTurnEvent } = setup();
    const start = { type: "turn_start", sessionId: "t-1", turnId: "turn-9", prompt: "hey" };
    mirrorHarnessTurnEvent(start);
    mirrorHarnessTurnEvent(start);
    expect(threads[0].messages).toHaveLength(2);
    mirrorHarnessTurnEvent({ type: "turn_start", sessionId: "nope", turnId: "turn-1", prompt: "hey" });
    mirrorHarnessTurnEvent({ type: "token", sessionId: "nope", content: "x" });
    expect(published).toHaveLength(2);
  });

  it("a failing mirror never throws", () => {
    const { mirrorHarnessTurnEvent } = setup();
    expect(() => mirrorHarnessTurnEvent(null)).not.toThrow();
    expect(() => mirrorHarnessTurnEvent({})).not.toThrow();
    expect(() => mirrorHarnessTurnEvent({ type: "token" })).not.toThrow();
  });
});
