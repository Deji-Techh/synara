// FILE: chatMode.test.ts
// Purpose: Mode resolution precedence + legacy normalization.

import { describe, expect, it } from "vitest";
import {
  getInitialChatModeForNewChat,
  normalizeStoredChatMode,
  resolveChatModeForTurn,
} from "./chatMode.ts";

describe("dyad chat mode resolution", () => {
  it("normalizes known modes and legacy local-agent, rejects unknown", () => {
    expect(normalizeStoredChatMode("build")).toBe("build");
    expect(normalizeStoredChatMode("ask")).toBe("ask");
    expect(normalizeStoredChatMode("agent")).toBe("agent");
    expect(normalizeStoredChatMode("plan")).toBe("plan");
    expect(normalizeStoredChatMode("local-agent")).toBe("agent");
    expect(normalizeStoredChatMode("agent-old")).toBeNull();
    expect(normalizeStoredChatMode(undefined)).toBeNull();
    expect(normalizeStoredChatMode("")).toBeNull();
  });

  it("prefers requested over stored over default", () => {
    expect(resolveChatModeForTurn({ requestedChatMode: "plan", storedChatMode: "ask" })).toEqual({
      mode: "plan",
      source: "requested",
    });
    expect(resolveChatModeForTurn({ storedChatMode: "ask" })).toEqual({
      mode: "ask",
      source: "stored",
    });
    expect(resolveChatModeForTurn({ requestedChatMode: "bogus", storedChatMode: "bogus" })).toEqual(
      {
        mode: "agent",
        source: "default",
      },
    );
    expect(resolveChatModeForTurn({ storedChatMode: "bogus", defaultMode: "plan" })).toEqual({
      mode: "plan",
      source: "default",
    });
  });

  it("passes through the initial chat mode", () => {
    expect(getInitialChatModeForNewChat("plan")).toBe("plan");
    expect(getInitialChatModeForNewChat()).toBeNull();
  });
});
