// FILE: harnessStore.test.ts
// Purpose: Store reactivity contract — every commit must replace the state
// root reference. Mutators edit sessions in place, so without a new root
// React's useState subscribers receive an identical reference and bail out,
// freezing the harness UI (no echo, no tokens, no errors) while the store
// itself fills correctly. Regression test for the silent dead-send.

import { describe, expect, it } from "vitest";
import { harnessStore } from "./harnessStore";

describe("harnessStore reactivity", () => {
  it("replaces the state root on appendUserMessage", () => {
    const before = harnessStore.getState();
    harnessStore.appendUserMessage("s-re", "m1", "hey");
    expect(harnessStore.getState()).not.toBe(before);
    expect(harnessStore.getState().sessions["s-re"]?.timeline).toHaveLength(1);
  });

  it("replaces the state root on token/error events", () => {
    harnessStore.clearSession("s-re2");
    const before = harnessStore.getState();
    harnessStore.handleEvent({ type: "token", sessionId: "s-re2", content: "hi" });
    const afterToken = harnessStore.getState();
    expect(afterToken).not.toBe(before);
    harnessStore.handleEvent({
      type: "error",
      sessionId: "s-re2",
      code: "TURN_FAILED",
      message: "boom",
      recoverable: true,
    });
    expect(harnessStore.getState()).not.toBe(afterToken);
    expect(harnessStore.getState().sessions["s-re2"]?.errors).toHaveLength(1);
  });

  it("notifies subscribers on every commit", () => {
    let calls = 0;
    const unsub = harnessStore.subscribe(() => {
      calls += 1;
    });
    try {
      harnessStore.appendUserMessage("s-re3", "m1", "hey");
      harnessStore.handleEvent({ type: "token", sessionId: "s-re3", content: "yo" });
      expect(calls).toBe(2);
    } finally {
      unsub();
    }
  });

  it("tracks live turns from turn_start to turn_end", () => {
    harnessStore.clearSession("s-live");
    expect(harnessStore.getState().sessions["s-live"]?.liveTurnId).toBeUndefined();
    harnessStore.handleEvent({
      type: "turn_start",
      sessionId: "s-live",
      turnId: "turn-7",
      prompt: "hey",
    });
    expect(harnessStore.getState().sessions["s-live"]?.liveTurnId).toBe("turn-7");
    // Usage-less end still clears (cancelled/aborted turns carry no usage).
    harnessStore.handleEvent({
      type: "turn_end",
      sessionId: "s-live",
      turnId: "turn-7",
      status: "cancelled",
    });
    expect(harnessStore.getState().sessions["s-live"]?.liveTurnId).toBeUndefined();
  });
});
