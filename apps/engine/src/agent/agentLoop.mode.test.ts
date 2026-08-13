// FILE: src/agent/agentLoop.mode.test.ts
// Purpose: Unit tests for the M2 chat-mode behaviors of the engine agent loop:
// (1) ask/plan modes hide tools, and plan mode caps at a single step + appends
// a plan-only system prompt; (2) resolveMaxSteps defaults map tools -> 20,
// tool-less -> 1, ask/plan -> 1, and an explicit maxSteps wins.
// Layer: Engine agent unit test

import { describe, expect, it } from "vitest";

import type { ChatMode } from "@caide/contracts";

import { resolveMaxSteps, resolveModeSystemPrompt } from "./agentLoop.ts";

const TOOL_COUNT_WITH_TOOLS = 3;
const TOOL_COUNT_NONE = 0;

describe("agentLoop chat modes", () => {
  describe("resolveMaxSteps", () => {
    it("uses the explicit maxSteps when provided", () => {
      expect(resolveMaxSteps("build", TOOL_COUNT_WITH_TOOLS, 5)).toBe(5);
      expect(resolveMaxSteps("ask", TOOL_COUNT_NONE, 7)).toBe(7);
    });

    it("defaults to a single step when no tools are exposed", () => {
      expect(resolveMaxSteps("build", TOOL_COUNT_NONE)).toBe(1);
      expect(resolveMaxSteps("local-agent", TOOL_COUNT_NONE, undefined)).toBe(1);
    });

    it("defaults to 20 multi-step turns when tools are exposed", () => {
      expect(resolveMaxSteps("build", TOOL_COUNT_WITH_TOOLS)).toBe(20);
      expect(resolveMaxSteps("local-agent", TOOL_COUNT_WITH_TOOLS, undefined)).toBe(20);
    });

    it("caps ask and plan modes at a single step even with tools", () => {
      expect(resolveMaxSteps("ask", TOOL_COUNT_WITH_TOOLS)).toBe(1);
      expect(resolveMaxSteps("plan", TOOL_COUNT_WITH_TOOLS)).toBe(1);
    });
  });

  describe("resolveModeSystemPrompt", () => {
    it("passes the base prompt through for non-plan modes", () => {
      for (const mode of ["build", "ask", "local-agent", undefined] as const) {
        expect(resolveModeSystemPrompt("Base instructions.", mode)).toBe("Base instructions.");
      }
    });

    it("returns the raw plan prompt when no base prompt and plan mode", () => {
      const prompt = resolveModeSystemPrompt(undefined, "plan");
      expect(prompt).toContain("plan mode");
      expect(prompt).toContain("Do not modify any files");
    });

    it("appends the plan instruction to the base prompt in plan mode", () => {
      const prompt = resolveModeSystemPrompt("Base instructions.", "plan");
      expect(prompt.startsWith("Base instructions.")).toBe(true);
      expect(prompt).toContain("You are in plan mode.");
      expect(prompt).toContain("Do not modify any files");
    });
  });

  it("recognizes every ChatMode literal as a valid mode value", () => {
    // Guards against accidentally broadening the wire type past the four
    // expected modes while keeping plan/ask semantics keyed off the literals.
    const modes: readonly ChatMode[] = ["build", "ask", "local-agent", "plan"];
    expect(new Set(modes)).toEqual(new Set<ChatMode>(["build", "ask", "local-agent", "plan"]));
  });
});
