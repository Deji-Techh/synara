import { describe, expect, it } from "vitest";
import { Schema } from "effect";

import { ProviderSendTurnInput, ProviderSessionStartInput } from "./provider";

const decodeProviderSessionStartInput = Schema.decodeUnknownSync(ProviderSessionStartInput);
const decodeProviderSendTurnInput = Schema.decodeUnknownSync(ProviderSendTurnInput);

describe("ProviderSessionStartInput", () => {
  it("accepts openai-compatible payloads", () => {
    const parsed = decodeProviderSessionStartInput({
      threadId: "thread-1",
      provider: "openai",
      cwd: "/tmp/workspace",
      modelSelection: {
        provider: "openai",
        model: "gpt-5.5",
        options: {
          reasoningEffort: "high",
          fastMode: true,
        },
      },
      runtimeMode: "full-access",
      providerOptions: {
        openai: {
          baseUrl: "https://api.openai.com/v1",
        },
      },
    });
    expect(parsed.runtimeMode).toBe("full-access");
    expect(parsed.modelSelection?.provider).toBe("openai");
    expect(parsed.modelSelection?.model).toBe("gpt-5.5");
    if (parsed.modelSelection?.provider !== "openai") {
      throw new Error("Expected openai modelSelection");
    }
    expect(parsed.modelSelection.options?.reasoningEffort).toBe("high");
    expect(parsed.modelSelection.options?.fastMode).toBe(true);
    expect(parsed.providerOptions?.openai?.baseUrl).toBe("https://api.openai.com/v1");
  });

  it("rejects payloads without runtime mode", () => {
    expect(() =>
      decodeProviderSessionStartInput({
        threadId: "thread-1",
        provider: "openai",
      }),
    ).toThrow();
  });

  it("accepts anthropic runtime knobs", () => {
    const parsed = decodeProviderSessionStartInput({
      threadId: "thread-1",
      provider: "anthropic",
      cwd: "/tmp/workspace",
      modelSelection: {
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        options: {
          thinking: true,
          reasoningEffort: "high",
          fastMode: true,
        },
      },
      providerOptions: {
        anthropic: {
          baseUrl: "https://api.anthropic.com",
        },
      },
      runtimeMode: "full-access",
    });
    expect(parsed.provider).toBe("anthropic");
    expect(parsed.modelSelection?.provider).toBe("anthropic");
    expect(parsed.modelSelection?.model).toBe("claude-sonnet-4-6");
    if (parsed.modelSelection?.provider !== "anthropic") {
      throw new Error("Expected anthropic modelSelection");
    }
    expect(parsed.modelSelection.options?.thinking).toBe(true);
    expect(parsed.modelSelection.options?.reasoningEffort).toBe("high");
    expect(parsed.modelSelection.options?.fastMode).toBe(true);
    expect(parsed.providerOptions?.anthropic?.baseUrl).toBe("https://api.anthropic.com");
    expect(parsed.runtimeMode).toBe("full-access");
  });
});

describe("ProviderSendTurnInput", () => {
  it("accepts openai modelSelection", () => {
    const parsed = decodeProviderSendTurnInput({
      threadId: "thread-1",
      modelSelection: {
        provider: "openai",
        model: "gpt-5.5",
        options: {
          reasoningEffort: "xhigh",
          fastMode: true,
        },
      },
    });

    expect(parsed.modelSelection?.provider).toBe("openai");
    expect(parsed.modelSelection?.model).toBe("gpt-5.5");
    if (parsed.modelSelection?.provider !== "openai") {
      throw new Error("Expected openai modelSelection");
    }
    expect(parsed.modelSelection.options?.reasoningEffort).toBe("xhigh");
    expect(parsed.modelSelection.options?.fastMode).toBe(true);
  });

  it("accepts anthropic modelSelection including thinking", () => {
    const parsed = decodeProviderSendTurnInput({
      threadId: "thread-1",
      modelSelection: {
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        options: {
          reasoningEffort: "high",
          thinking: true,
          fastMode: true,
        },
      },
    });

    expect(parsed.modelSelection?.provider).toBe("anthropic");
    if (parsed.modelSelection?.provider !== "anthropic") {
      throw new Error("Expected anthropic modelSelection");
    }
    expect(parsed.modelSelection.options?.thinking).toBe(true);
    expect(parsed.modelSelection.options?.fastMode).toBe(true);
  });

  it("accepts anthropic modelSelection including xhigh", () => {
    const parsed = decodeProviderSendTurnInput({
      threadId: "thread-1",
      modelSelection: {
        provider: "anthropic",
        model: "claude-opus-4-6",
        options: {
          reasoningEffort: "xhigh",
        },
      },
    });

    expect(parsed.modelSelection?.provider).toBe("anthropic");
    if (parsed.modelSelection?.provider !== "anthropic") {
      throw new Error("Expected anthropic modelSelection");
    }
    expect(parsed.modelSelection.options?.reasoningEffort).toBe("xhigh");
  });
});
