import { ThreadId, type OrchestrationSession } from "@caide/contracts";
import { describe, expect, it } from "vitest";

import { deriveTurnStartModelSelection, deriveTurnStartSession } from "./turnStartSession.ts";

const THREAD_ID = ThreadId.makeUnsafe("thread-turn-start-session");
const REQUESTED_AT = "2026-07-21T00:00:00.000Z";

function makeSession(status: OrchestrationSession["status"]): OrchestrationSession {
  return {
    threadId: THREAD_ID,
    status,
    providerName: "openai",
    runtimeMode: "approval-required",
    activeTurnId: null,
    lastError: status === "error" ? "runtime exploded" : null,
    updatedAt: "2026-07-20T00:00:00.000Z",
  };
}

function derive(currentSession: OrchestrationSession | null) {
  return deriveTurnStartSession({
    threadId: THREAD_ID,
    currentSession,
    providerName: "openai",
    requestedRuntimeMode: "full-access",
    requestedAt: REQUESTED_AT,
  });
}

describe("deriveTurnStartSession", () => {
  it("keeps an established provider when a later turn requests another provider", () => {
    expect(
      deriveTurnStartModelSelection({
        currentModelSelection: { provider: "openai", model: "gpt-5-codex" },
        requestedModelSelection: { provider: "openai", model: "openai/gpt-5" },
        canAdoptRequestedProvider: false,
      }),
    ).toEqual({ provider: "openai", model: "gpt-5-codex" });
  });

  it("allows an empty thread to adopt its first requested provider", () => {
    expect(
      deriveTurnStartModelSelection({
        currentModelSelection: { provider: "openai", model: "gpt-5-codex" },
        requestedModelSelection: { provider: "openai", model: "openai/gpt-5" },
        canAdoptRequestedProvider: true,
      }),
    ).toEqual({ provider: "openai", model: "openai/gpt-5" });
  });

  it("creates a starting session when no session exists", () => {
    expect(derive(null)).toEqual({
      threadId: THREAD_ID,
      status: "starting",
      providerName: "openai",
      runtimeMode: "full-access",
      activeTurnId: null,
      lastError: null,
      updatedAt: REQUESTED_AT,
    });
  });

  it("preserves established provider settings when restarting an idle session", () => {
    expect(derive(makeSession("ready"))).toMatchObject({
      status: "starting",
      providerName: "openai",
      runtimeMode: "approval-required",
      activeTurnId: null,
      lastError: null,
    });
  });

  it.each(["starting", "running"] as const)("does not replace a %s session", (status) => {
    expect(derive(makeSession(status))).toBeNull();
  });

  it("clears terminal error details when a new turn starts", () => {
    expect(derive(makeSession("error"))).toMatchObject({
      status: "starting",
      activeTurnId: null,
      lastError: null,
    });
  });
});
