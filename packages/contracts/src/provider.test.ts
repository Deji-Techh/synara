import { describe, expect, it } from "vitest";
import { Schema } from "effect";

import { ProviderSendTurnInput, ProviderSessionStartInput } from "./provider";

const decodeProviderSessionStartInput = Schema.decodeUnknownSync(ProviderSessionStartInput);
const decodeProviderSendTurnInput = Schema.decodeUnknownSync(ProviderSendTurnInput);

describe("ProviderSessionStartInput", () => {
  it("accepts groq-compatible payloads", () => {
    const parsed = decodeProviderSessionStartInput({
      threadId: "thread-1",
      provider: "groq",
      cwd: "/tmp/workspace",
      modelSelection: {
        provider: "groq",
        model: "llama-3.3-70b-versatile",
        options: {
          reasoningEffort: "high",
          fastMode: true,
        },
      },
      runtimeMode: "full-access",
      providerOptions: {
        groq: {
          baseUrl: "https://api.groq.com/v1",
        },
      },
    });
    expect(parsed.runtimeMode).toBe("full-access");
    expect(parsed.modelSelection?.provider).toBe("groq");
    expect(parsed.modelSelection?.model).toBe("llama-3.3-70b-versatile");
    if (parsed.modelSelection?.provider !== "groq") {
      throw new Error("Expected groq modelSelection");
    }
    expect((parsed.modelSelection.options as { reasoningEffort?: string })?.reasoningEffort).toBe(
      "high",
    );
    expect((parsed.modelSelection.options as { fastMode?: boolean })?.fastMode).toBe(true);
    expect(parsed.providerOptions?.groq?.baseUrl).toBe("https://api.groq.com/v1");
  });

  it("rejects payloads without runtime mode", () => {
    expect(() =>
      decodeProviderSessionStartInput({
        threadId: "thread-1",
        provider: "groq",
      }),
    ).toThrow();
  });

  it("accepts opencodeZen runtime knobs", () => {
    const parsed = decodeProviderSessionStartInput({
      threadId: "thread-1",
      provider: "opencodeZen",
      cwd: "/tmp/workspace",
      modelSelection: {
        provider: "opencodeZen",
        model: "deepseek-v4-flash-free",
        options: {
          thinking: true,
          reasoningEffort: "high",
          fastMode: true,
        },
      },
      providerOptions: {
        opencodeZen: {
          baseUrl: "https://api.opencode.zen/v1",
        },
      },
      runtimeMode: "full-access",
    });
    expect(parsed.provider).toBe("opencodeZen");
    expect(parsed.modelSelection?.provider).toBe("opencodeZen");
    expect(parsed.modelSelection?.model).toBe("deepseek-v4-flash-free");
    if (parsed.modelSelection?.provider !== "opencodeZen") {
      throw new Error("Expected opencodeZen modelSelection");
    }
    expect((parsed.modelSelection.options as { thinking?: boolean })?.thinking).toBe(true);
    expect((parsed.modelSelection.options as { reasoningEffort?: string })?.reasoningEffort).toBe(
      "high",
    );
    expect((parsed.modelSelection.options as { fastMode?: boolean })?.fastMode).toBe(true);
    expect(parsed.providerOptions?.opencodeZen?.baseUrl).toBe("https://api.opencode.zen/v1");
    expect(parsed.runtimeMode).toBe("full-access");
  });
});

describe("ProviderSendTurnInput", () => {
  it("accepts groq modelSelection", () => {
    const parsed = decodeProviderSendTurnInput({
      threadId: "thread-1",
      modelSelection: {
        provider: "groq",
        model: "llama-3.3-70b-versatile",
        options: {
          reasoningEffort: "xhigh",
          fastMode: true,
        },
      },
    });

    expect(parsed.modelSelection?.provider).toBe("groq");
    expect(parsed.modelSelection?.model).toBe("llama-3.3-70b-versatile");
    if (parsed.modelSelection?.provider !== "groq") {
      throw new Error("Expected groq modelSelection");
    }
    expect((parsed.modelSelection.options as { reasoningEffort?: string })?.reasoningEffort).toBe(
      "xhigh",
    );
    expect((parsed.modelSelection.options as { fastMode?: boolean })?.fastMode).toBe(true);
  });

  it("accepts opencodeZen modelSelection including thinking", () => {
    const parsed = decodeProviderSendTurnInput({
      threadId: "thread-1",
      modelSelection: {
        provider: "opencodeZen",
        model: "deepseek-v4-flash-free",
        options: {
          reasoningEffort: "high",
          thinking: true,
          fastMode: true,
        },
      },
    });

    expect(parsed.modelSelection?.provider).toBe("opencodeZen");
    if (parsed.modelSelection?.provider !== "opencodeZen") {
      throw new Error("Expected opencodeZen modelSelection");
    }
    expect((parsed.modelSelection.options as { thinking?: boolean })?.thinking).toBe(true);
    expect((parsed.modelSelection.options as { fastMode?: boolean })?.fastMode).toBe(true);
  });

  it("accepts opencodeGo modelSelection including xhigh", () => {
    const parsed = decodeProviderSendTurnInput({
      threadId: "thread-1",
      modelSelection: {
        provider: "opencodeGo",
        model: "deepseek-v4-flash-free",
        options: {
          reasoningEffort: "xhigh",
        },
      },
    });

    expect(parsed.modelSelection?.provider).toBe("opencodeGo");
    if (parsed.modelSelection?.provider !== "opencodeGo") {
      throw new Error("Expected opencodeGo modelSelection");
    }
    expect((parsed.modelSelection.options as { reasoningEffort?: string })?.reasoningEffort).toBe(
      "xhigh",
    );
  });
});
