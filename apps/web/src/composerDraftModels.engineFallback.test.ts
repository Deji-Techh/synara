// FILE: composerDraftModels.engineFallback.test.ts
// Purpose: Pins the provider-scoped final fallback for composer model
//          resolution — an engine-bound thread must never inherit Groq's
//          default (the "picked MiMo but saw Llama" bug), and unlisted Zen
//          picks survive while discovery is still loading.

import { describe, expect, it } from "vitest";

import { deriveEffectiveComposerModelState } from "./composerDraftModels";

function makeModelSelection(provider: "engine" | "opencodeZen", model: string) {
  return { provider, model } as const;
}

const EMPTY_CUSTOM_MODELS = {
  engine: [],
  groq: [],
  opencodeZen: [],
  opencodeGo: [],
} as never;

describe("deriveEffectiveComposerModelState engine fallback", () => {
  it("never leaks Groq's default model onto an engine-bound thread without options", () => {
    const state = deriveEffectiveComposerModelState({
      draft: { modelSelectionByProvider: {}, activeProvider: "engine" },
      selectedProvider: "engine",
      threadModelSelection: makeModelSelection("engine", "default"),
      projectModelSelection: null,
      customModelsByProvider: EMPTY_CUSTOM_MODELS,
    });

    expect(state.selectedModel).toBe("default");
    expect(state.selectedModel).not.toBe("llama-3.3-70b-versatile");
  });

  it("keeps an OpenCode Zen pick that is not in the loaded option list", () => {
    const state = deriveEffectiveComposerModelState({
      draft: {
        modelSelectionByProvider: {
          opencodeZen: makeModelSelection("opencodeZen", "mimo-v2.5-free"),
        },
        activeProvider: "opencodeZen",
      },
      selectedProvider: "opencodeZen",
      threadModelSelection: null,
      projectModelSelection: null,
      customModelsByProvider: EMPTY_CUSTOM_MODELS,
    });

    expect(state.selectedModel).toBe("mimo-v2.5-free");
  });
});
