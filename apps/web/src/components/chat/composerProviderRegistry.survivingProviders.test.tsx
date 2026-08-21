// @vitest-environment jsdom
// FILE: composerProviderRegistry.survivingProviders.test.tsx
// Purpose: Pins composer registry coverage for every surviving provider kind.
// A missing registry entry crashed the whole chat surface ("Cannot read
// properties of undefined (reading 'getState')") the moment its model was
// selected — this guards opencodeGo (and the rest) against regressions.

import { ThreadId } from "@caide/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  getComposerProviderState,
  renderProviderTraitsMenuContent,
  renderProviderTraitsPicker,
} from "./composerProviderRegistry";

describe("surviving provider registry coverage", () => {
  const threadId = ThreadId.makeUnsafe("registry-coverage-thread");

  it("resolves composer state for every surviving provider without throwing", () => {
    for (const provider of ["engine", "groq", "opencodeZen", "opencodeGo"] as const) {
      expect(() =>
        getComposerProviderState({
          provider,
          model: provider === "engine" ? "default" : "probe-model",
          runtimeModel: undefined,
          prompt: "",
          modelOptions: undefined,
        }),
      ).not.toThrow();
    }
  });

  it("renders traits surfaces for opencodeGo without throwing", () => {
    expect(() =>
      renderProviderTraitsMenuContent({
        provider: "opencodeGo",
        threadId,
        model: "kimi-k3",
        runtimeModel: undefined,
        runtimeModels: [],
        runtimeAgents: [],
        modelOptions: undefined,
        prompt: "",
        onPromptChange: vi.fn(),
      }),
    ).not.toThrow();

    expect(() =>
      renderProviderTraitsPicker({
        provider: "opencodeGo",
        threadId,
        model: "kimi-k3",
        runtimeModel: undefined,
        runtimeModels: [],
        runtimeAgents: [],
        modelOptions: undefined,
        prompt: "",
        open: false,
        onPromptChange: vi.fn(),
      }),
    ).not.toThrow();
  });
});
