import { describe, expect, it } from "vitest";

import {
  RUNTIME_MODE_PRESENTATION,
  normalizeRuntimeModeForProvider,
  providerModelSupportsAutoRuntimeMode,
  providerSupportsAutoRuntimeMode,
} from "./runtimeMode";

describe("runtime mode provider support", () => {
  it("offers AI-reviewed auto mode to Codex and Claude Code", () => {
    expect(providerSupportsAutoRuntimeMode("openai")).toBe(true);
    expect(providerSupportsAutoRuntimeMode("anthropic")).toBe(true);
  });

  it("falls back to supervised mode for providers without auto review", () => {
    expect(normalizeRuntimeModeForProvider("auto", "openai")).toBe("approval-required");
    expect(normalizeRuntimeModeForProvider("full-access", "openai")).toBe("full-access");
  });

  it("describes Auto as approval review rather than unrestricted access", () => {
    expect(RUNTIME_MODE_PRESENTATION.auto).toEqual({
      label: "Approve for me",
      description: "Only ask for actions detected as potentially unsafe",
    });
  });

  it("uses Claude's explicit model and CLI capability signals", () => {
    expect(
      providerModelSupportsAutoRuntimeMode(
        "anthropic",
        { slug: "claude-test", name: "Claude Test", supportsAutoMode: false },
        null,
      ),
    ).toBe(false);
    expect(
      providerModelSupportsAutoRuntimeMode(
        "anthropic",
        { slug: "claude-test", name: "Claude Test", supportsAutoMode: true },
        {
          provider: "anthropic",
          status: "ready",
          available: true,
          authStatus: "authenticated",
          supportsAutoRuntimeMode: false,
          checkedAt: new Date(0).toISOString(),
        },
      ),
    ).toBe(false);
  });

  it("hides Auto when the installed Codex CLI lacks native review support", () => {
    expect(
      providerModelSupportsAutoRuntimeMode("openai", undefined, {
        provider: "openai",
        status: "ready",
        available: true,
        authStatus: "authenticated",
        supportsAutoRuntimeMode: false,
        checkedAt: new Date(0).toISOString(),
      }),
    ).toBe(false);
  });

  it("hides Auto until exact CLI and Claude model capability are known", () => {
    expect(providerModelSupportsAutoRuntimeMode("openai", undefined, null)).toBe(false);
    expect(
      providerModelSupportsAutoRuntimeMode(
        "anthropic",
        { slug: "claude-test", name: "Claude Test" },
        {
          provider: "anthropic",
          status: "ready",
          available: true,
          authStatus: "authenticated",
          supportsAutoRuntimeMode: true,
          checkedAt: new Date(0).toISOString(),
        },
      ),
    ).toBe(false);
  });
});
