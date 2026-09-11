// FILE: dispatchSystemPrompt.test.ts
// Purpose: Override precedence for the dispatch system prompt env hatch:
// primary > alias > assembled default; blanks count as unset.

import { describe, expect, it } from "vitest";
import {
  applyDispatchSystemPromptOverride,
  resolveDispatchSystemPromptOverride,
} from "./dispatchSystemPrompt.ts";

describe("resolveDispatchSystemPromptOverride", () => {
  it("returns null when neither var is set", () => {
    expect(resolveDispatchSystemPromptOverride({})).toBeNull();
  });

  it("prefers the primary var over the alias", () => {
    expect(
      resolveDispatchSystemPromptOverride({
        CAIDE_DISPATCH_SYSTEM_PROMPT: "primary prompt",
        DYAD_DEFAULT_SYSTEM_PROMPT: "alias prompt",
      }),
    ).toBe("primary prompt");
  });

  it("falls back to the alias when the primary is unset", () => {
    expect(
      resolveDispatchSystemPromptOverride({ DYAD_DEFAULT_SYSTEM_PROMPT: "alias prompt" }),
    ).toBe("alias prompt");
  });

  it("treats blank values as unset, including whitespace-only primary", () => {
    expect(
      resolveDispatchSystemPromptOverride({
        CAIDE_DISPATCH_SYSTEM_PROMPT: "   ",
        DYAD_DEFAULT_SYSTEM_PROMPT: "alias prompt",
      }),
    ).toBe("alias prompt");
    expect(resolveDispatchSystemPromptOverride({ CAIDE_DISPATCH_SYSTEM_PROMPT: "" })).toBeNull();
  });

  it("trims the override", () => {
    expect(
      resolveDispatchSystemPromptOverride({ CAIDE_DISPATCH_SYSTEM_PROMPT: "  hi  " }),
    ).toBe("hi");
  });
});

describe("applyDispatchSystemPromptOverride", () => {
  it("replaces the assembled prompt when set", () => {
    expect(applyDispatchSystemPromptOverride("assembled", { CAIDE_DISPATCH_SYSTEM_PROMPT: "x" })).toBe(
      "x",
    );
  });

  it("passes the assembled prompt through when unset", () => {
    expect(applyDispatchSystemPromptOverride("assembled", {})).toBe("assembled");
  });
});
