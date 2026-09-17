import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../session/buildChain.ts";
import {
  buildQuestionnaireReflectionMessage,
  ensureToolResultOrdering,
  isQuestionnaireFormatError,
} from "./prepareStep.ts";

const use = (id: string): ChatMessage => ({
  role: "assistant",
  content: [{ type: "tool_use", id, name: "read_file", input: {} }],
});

const at = (messages: ChatMessage[], index: number): ChatMessage => {
  const message = messages[index];
  if (!message) throw new Error(`message index ${index} out of bounds`);
  return message;
};

const result = (id: string): ChatMessage => ({
  role: "user",
  content: [{ type: "tool_result", tool_use_id: id, content: "ok" }],
});

const text = (content: string): ChatMessage => ({ role: "user", content });

describe("ensureToolResultOrdering (donor prepareStep parity)", () => {
  it("returns the input untouched when pairing is already valid", () => {
    const messages = [use("a"), result("a"), text("done")];
    expect(ensureToolResultOrdering(messages)).toBe(messages);
  });

  it("moves a misplaced user message past its pending tool_result", () => {
    const stray: ChatMessage = text("steer while waiting");
    const messages = [use("a"), stray, result("a")];
    const fixed = ensureToolResultOrdering(messages);
    expect(fixed).not.toBe(messages);
    expect(fixed).toEqual([at(messages, 0), at(messages, 2), at(messages, 1)]);
  });

  it("moves string-content steers past multi-tool resolution", () => {
    const messages = [use("a"), use("b"), text("steer"), result("a"), result("b")];
    const fixed = ensureToolResultOrdering(messages);
    expect(fixed.map((m) => m.content)).toEqual([
      at(messages, 0).content,
      at(messages, 1).content,
      at(messages, 3).content,
      at(messages, 4).content,
      at(messages, 2).content,
    ]);
  });

  it("leaves resolver messages in place", () => {
    const messages = [use("a"), result("a"), use("b"), result("b")];
    expect(ensureToolResultOrdering(messages)).toBe(messages);
  });

  it("does not cross an assistant boundary looking for resolution", () => {
    const stray = text("steer");
    const messages = [use("a"), stray, use("b"), result("b")];
    const fixed = ensureToolResultOrdering(messages);
    // No safe position before the next assistant turn: untouched.
    expect(fixed).toBe(messages);
  });

  it("handles empty input", () => {
    const messages: ChatMessage[] = [];
    expect(ensureToolResultOrdering(messages)).toBe(messages);
  });
});

describe("questionnaire reflection (donor onStepFinish parity)", () => {
  it("builds the plan-mode message (re-call the tool)", () => {
    const message = buildQuestionnaireReflectionMessage("questions: too many", true);
    expect(message).toContain("Your planning_questionnaire tool call had a format error.");
    expect(message).toContain("The error was: questions: too many");
    expect(message).toContain("re-call planning_questionnaire with correct arguments");
  });

  it("builds the non-plan message (skip ahead)", () => {
    const message = buildQuestionnaireReflectionMessage("bad options", false);
    expect(message).toContain("Your planning_questionnaire tool call had a format error.");
    expect(message).toContain("Skip the questionnaire step and proceed directly");
  });

  it("detects format errors only for the questionnaire tool", () => {
    expect(isQuestionnaireFormatError("planning_questionnaire", new Error("ZodError: bad"))).toBe(
      "ZodError: bad",
    );
    expect(isQuestionnaireFormatError("read_file", new Error("ZodError: bad"))).toBeNull();
    expect(isQuestionnaireFormatError("planning_questionnaire", new Error(""))).toBeNull();
  });

  it("never reflects consent declines", () => {
    expect(
      isQuestionnaireFormatError(
        "planning_questionnaire",
        new Error("Tool call declined: planning_questionnaire"),
      ),
    ).toBeNull();
  });
});
