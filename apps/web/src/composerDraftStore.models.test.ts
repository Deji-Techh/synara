import { ThreadId, type ModelSelection } from "@caide/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import {
  deriveEffectiveComposerModelState,
  resolvePreferredComposerModelSelection,
  useComposerDraftStore,
} from "./composerDraftStore";
import {
  modelSelection,
  providerModelOptions,
  resetComposerDraftStore,
} from "./composerDraftStoreTestFixtures";
import { getCustomModelsByProvider } from "./appSettings";

describe("resolvePreferredComposerModelSelection", () => {
  it("prefers the active draft provider selection over thread and project defaults", () => {
    expect(
      resolvePreferredComposerModelSelection({
        draft: {
          modelSelectionByProvider: {
            anthropic: modelSelection("anthropic", "claude-opus-4-6", {
              reasoningEffort: "max",
            }),
          },
          activeProvider: "anthropic",
        },
        threadModelSelection: modelSelection("openai", "gpt-5"),
        projectModelSelection: modelSelection("openai", "gpt-5.4"),
      }),
    ).toEqual(
      modelSelection("anthropic", "claude-opus-4-6", {
        reasoningEffort: "max",
      }),
    );
  });

  it("can prefer xAI draft selections", () => {
    expect(
      resolvePreferredComposerModelSelection({
        draft: {
          modelSelectionByProvider: {
            xai: modelSelection("xai", "grok-4"),
          },
          activeProvider: "xai",
        },
        threadModelSelection: modelSelection("openai", "gpt-5"),
        projectModelSelection: modelSelection("openai", "gpt-5.4"),
      }),
    ).toEqual(modelSelection("xai", "grok-4"));
  });

  it("uses only the active provider selection for terminal-first promotion", () => {
    const routerSelection = modelSelection("openrouter", "cursor-auto", {
      reasoningEffort: "high",
    });
    expect(
      resolvePreferredComposerModelSelection({
        draft: {
          modelSelectionByProvider: {
            openai: modelSelection("openai", "gpt-5.6-sol", { reasoningEffort: "ultra" }),
            openrouter: routerSelection,
          },
          activeProvider: "openrouter",
        },
        threadModelSelection: null,
        projectModelSelection: null,
      }),
    ).toEqual(routerSelection);
  });
});

describe("composerDraftStore modelSelection", () => {
  const threadId = ThreadId.makeUnsafe("thread-model-options");

  beforeEach(() => {
    resetComposerDraftStore();
  });

  it("stores a model selection in the draft", () => {
    const store = useComposerDraftStore.getState();
    store.setModelSelection(
      threadId,
      modelSelection("openai", "gpt-5.3-codex", {
        reasoningEffort: "xhigh",
        fastMode: true,
      }),
    );

    expect(
      useComposerDraftStore.getState().draftsByThreadId[threadId]?.modelSelectionByProvider.openai,
    ).toEqual(
      modelSelection("openai", "gpt-5.3-codex", {
        reasoningEffort: "xhigh",
        fastMode: true,
      }),
    );
  });

  it.each(["max", "ultra"])(
    "retains runtime-discovered OpenAI %s effort in thread and sticky selections",
    (reasoningEffort) => {
      const store = useComposerDraftStore.getState();
      const selection = modelSelection("openai", "gpt-5.6-sol", { reasoningEffort });

      store.setModelSelection(threadId, selection);
      store.setStickyModelSelection(selection);

      const state = useComposerDraftStore.getState();
      expect(state.draftsByThreadId[threadId]?.modelSelectionByProvider.openai).toEqual(selection);
      expect(state.stickyModelSelectionByProvider.openai).toEqual(selection);
    },
  );

  it("drops malformed OpenAI reasoning efforts while preserving other options", () => {
    const store = useComposerDraftStore.getState();

    store.setProviderModelOptions(
      threadId,
      "openai",
      { reasoningEffort: "   ", fastMode: true },
      { model: "gpt-5.6-sol" },
    );

    expect(
      useComposerDraftStore.getState().draftsByThreadId[threadId]?.modelSelectionByProvider.openai,
    ).toEqual(modelSelection("openai", "gpt-5.6-sol", { fastMode: true }));
  });

  it("keeps default-only model selections on the draft", () => {
    const store = useComposerDraftStore.getState();
    store.setModelSelection(threadId, modelSelection("openai", "gpt-5.4"));

    expect(
      useComposerDraftStore.getState().draftsByThreadId[threadId]?.modelSelectionByProvider.openai,
    ).toEqual(modelSelection("openai", "gpt-5.4"));
  });

  it("stores xAI selections instead of dropping them during normalization", () => {
    const store = useComposerDraftStore.getState();

    store.setModelSelection(threadId, modelSelection("xai", "grok-4"));
    store.setStickyModelSelection(modelSelection("xai", "grok-4"));

    const state = useComposerDraftStore.getState();
    expect(state.draftsByThreadId[threadId]?.modelSelectionByProvider.xai).toEqual(
      modelSelection("xai", "grok-4"),
    );
    expect(state.draftsByThreadId[threadId]?.activeProvider).toBe("xai");
    expect(state.stickyModelSelectionByProvider.xai).toEqual(modelSelection("xai", "grok-4"));
    expect(state.stickyActiveProvider).toBe("xai");
  });

  it("stores Google base models and effort options separately", () => {
    const store = useComposerDraftStore.getState();
    const selection = modelSelection("google", "gemini-3-pro", {
      reasoningEffort: "high",
    });

    store.setModelSelection(threadId, selection);
    store.setStickyModelSelection(selection);

    const state = useComposerDraftStore.getState();
    expect(state.draftsByThreadId[threadId]?.modelSelectionByProvider.google).toEqual(selection);
    expect(state.draftsByThreadId[threadId]?.activeProvider).toBe("google");
    expect(state.stickyModelSelectionByProvider.google).toEqual(selection);
    expect(state.stickyActiveProvider).toBe("google");
  });

  it("replaces only the targeted provider options on the current model selection", () => {
    const store = useComposerDraftStore.getState();

    store.setModelSelection(
      threadId,
      modelSelection("anthropic", "claude-opus-4-6", {
        reasoningEffort: "max",
        fastMode: true,
      }),
    );
    store.setStickyModelSelection(
      modelSelection("anthropic", "claude-opus-4-6", {
        reasoningEffort: "max",
        fastMode: true,
      }),
    );

    store.setProviderModelOptions(
      threadId,
      "anthropic",
      {
        thinking: false,
      },
      { persistSticky: true },
    );

    expect(
      useComposerDraftStore.getState().draftsByThreadId[threadId]?.modelSelectionByProvider
        .anthropic,
    ).toEqual(
      modelSelection("anthropic", "claude-opus-4-6", {
        thinking: false,
      }),
    );
    expect(useComposerDraftStore.getState().stickyModelSelectionByProvider.anthropic).toEqual(
      modelSelection("anthropic", "claude-opus-4-6", {
        thinking: false,
      }),
    );
  });

  it("keeps explicit default-state overrides on the selection", () => {
    const store = useComposerDraftStore.getState();

    store.setModelSelection(
      threadId,
      modelSelection("anthropic", "claude-opus-4-6", {
        reasoningEffort: "max",
      }),
    );

    store.setProviderModelOptions(threadId, "anthropic", {
      thinking: true,
    });

    expect(
      useComposerDraftStore.getState().draftsByThreadId[threadId]?.modelSelectionByProvider
        .anthropic,
    ).toEqual(
      modelSelection("anthropic", "claude-opus-4-6", {
        thinking: true,
      }),
    );
    expect(useComposerDraftStore.getState().stickyModelSelectionByProvider).toEqual({});
  });

  it("keeps explicit off/default openai overrides on the selection", () => {
    const store = useComposerDraftStore.getState();

    store.setModelSelection(threadId, modelSelection("openai", "gpt-5.4", { fastMode: true }));

    store.setProviderModelOptions(threadId, "openai", {
      reasoningEffort: "high",
      fastMode: false,
    });

    expect(
      useComposerDraftStore.getState().draftsByThreadId[threadId]?.modelSelectionByProvider.openai,
    ).toEqual(
      modelSelection("openai", "gpt-5.4", {
        reasoningEffort: "high",
        fastMode: false,
      }),
    );
  });

  it.each([
    { label: "omitted", options: undefined },
    { label: "disabled", options: { persistSticky: false } as const },
  ])("updates only the draft when sticky persistence is $label", ({ options }) => {
    const store = useComposerDraftStore.getState();

    store.setStickyModelSelection(
      modelSelection("anthropic", "claude-opus-4-6", { reasoningEffort: "max" }),
    );
    store.setModelSelection(
      threadId,
      modelSelection("anthropic", "claude-opus-4-6", { reasoningEffort: "max" }),
    );

    store.setProviderModelOptions(threadId, "anthropic", { thinking: false }, options);

    expect(
      useComposerDraftStore.getState().draftsByThreadId[threadId]?.modelSelectionByProvider
        .anthropic,
    ).toEqual(
      modelSelection("anthropic", "claude-opus-4-6", {
        thinking: false,
      }),
    );
    expect(useComposerDraftStore.getState().stickyModelSelectionByProvider.anthropic).toEqual(
      modelSelection("anthropic", "claude-opus-4-6", { reasoningEffort: "max" }),
    );
  });

  it("does not clear other provider options when setting options for a single provider", () => {
    const store = useComposerDraftStore.getState();

    // Set options for both providers
    store.setModelOptions(
      threadId,
      providerModelOptions({
        openai: { fastMode: true },
        anthropic: { reasoningEffort: "max" },
      }),
    );

    // Now set options for only openai — anthropic should be untouched
    store.setModelOptions(threadId, providerModelOptions({ openai: { reasoningEffort: "xhigh" } }));

    const draft = useComposerDraftStore.getState().draftsByThreadId[threadId];
    expect(draft?.modelSelectionByProvider.openai?.options).toEqual({ reasoningEffort: "xhigh" });
    expect(draft?.modelSelectionByProvider.anthropic?.options).toEqual({ reasoningEffort: "max" });
  });

  it("preserves other provider options when switching the active model selection", () => {
    const store = useComposerDraftStore.getState();

    store.setModelOptions(
      threadId,
      providerModelOptions({
        openai: { fastMode: true },
        anthropic: { reasoningEffort: "max" },
      }),
    );

    store.setModelSelection(threadId, modelSelection("anthropic", "claude-opus-4-6"));

    const draft = useComposerDraftStore.getState().draftsByThreadId[threadId];
    expect(draft?.modelSelectionByProvider.anthropic).toEqual(
      modelSelection("anthropic", "claude-opus-4-6", { reasoningEffort: "max" }),
    );
    expect(draft?.modelSelectionByProvider.openai?.options).toEqual({ fastMode: true });
    expect(draft?.activeProvider).toBe("anthropic");
  });

  it("creates the first sticky snapshot from provider option changes", () => {
    const store = useComposerDraftStore.getState();

    store.setModelSelection(threadId, modelSelection("openai", "gpt-5.4"));

    store.setProviderModelOptions(
      threadId,
      "openai",
      {
        fastMode: true,
      },
      { persistSticky: true },
    );

    expect(useComposerDraftStore.getState().stickyModelSelectionByProvider.openai).toEqual(
      modelSelection("openai", "gpt-5.4", {
        fastMode: true,
      }),
    );
  });

  it("prefers the active OpenCode thread model over a stale draft default when runtime models are available", () => {
    const state = deriveEffectiveComposerModelState({
      draft: {
        modelSelectionByProvider: {
          opencodeGo: modelSelection("opencodeGo", "openai/gpt-5"),
        },
        activeProvider: "opencodeGo",
      },
      selectedProvider: "opencodeGo",
      threadModelSelection: modelSelection("opencodeGo", "opencode/gpt-5-nano"),
      projectModelSelection: null,
      customModelsByProvider: getCustomModelsByProvider({} as any),
      availableModelOptionsByProvider: {
        opencodeGo: [{ slug: "opencode/gpt-5-nano", name: "GPT-5 Nano" }],
      },
    });

    expect(state.selectedModel).toBe("opencode/gpt-5-nano");
  });

  it("preserves the persisted OpenCode thread model when discovery omits it", () => {
    const state = deriveEffectiveComposerModelState({
      draft: {
        modelSelectionByProvider: {},
        activeProvider: "opencodeGo",
      },
      selectedProvider: "opencodeGo",
      threadModelSelection: modelSelection("opencodeGo", "openai/gpt-5.4"),
      projectModelSelection: null,
      customModelsByProvider: getCustomModelsByProvider({} as any),
      availableModelOptionsByProvider: {
        opencodeGo: [
          { slug: "openai/gpt-5-codex", name: "GPT-5-Codex" },
          { slug: "openai/gpt-5.4-mini", name: "GPT-5.4 Mini" },
        ],
      },
    });

    expect(state.selectedModel).toBe("openai/gpt-5.4");
  });

  it("falls back to the first exposed OpenCode runtime model when the draft selection is stale", () => {
    const state = deriveEffectiveComposerModelState({
      draft: {
        modelSelectionByProvider: {
          opencodeGo: modelSelection("opencodeGo", "openai/gpt-5"),
        },
        activeProvider: "opencodeGo",
      },
      selectedProvider: "opencodeGo",
      threadModelSelection: null,
      projectModelSelection: null,
      customModelsByProvider: getCustomModelsByProvider({} as any),
      availableModelOptionsByProvider: {
        opencodeGo: [
          { slug: "opencode/gpt-5-nano", name: "GPT-5 Nano" },
          { slug: "opencode/big-pickle", name: "Big Pickle" },
        ],
      },
    });

    expect(state.selectedModel).toBe("opencode/gpt-5-nano");
  });
});

describe("composerDraftStore setModelSelection", () => {
  const threadId = ThreadId.makeUnsafe("thread-model");

  beforeEach(() => {
    resetComposerDraftStore();
  });

  it("keeps explicit model overrides instead of coercing to null", () => {
    const store = useComposerDraftStore.getState();

    store.setModelSelection(threadId, modelSelection("openai", "gpt-5.3-codex"));

    expect(
      useComposerDraftStore.getState().draftsByThreadId[threadId]?.modelSelectionByProvider.openai,
    ).toEqual(modelSelection("openai", "gpt-5.3-codex"));
  });

  it("preserves newly discovered effort strings in composer state", () => {
    const store = useComposerDraftStore.getState();
    store.setModelSelection(threadId, modelSelection("openai", "future-model"));

    store.setProviderModelOptions(threadId, "openai", { reasoningEffort: "ultra" });

    expect(
      useComposerDraftStore.getState().draftsByThreadId[threadId]?.modelSelectionByProvider.openai,
    ).toEqual(modelSelection("openai", "future-model", { reasoningEffort: "ultra" }));
  });

  it("drops a runtime OpenAI effort when switching models before terminal promotion", () => {
    const store = useComposerDraftStore.getState();
    store.setModelSelectionAndSticky(
      threadId,
      modelSelection("openai", "gpt-5.6-sol", {
        reasoningEffort: "ultra",
        fastMode: true,
      }),
    );

    store.setModelSelectionAndSticky(threadId, modelSelection("openai", "gpt-5.4"));

    const state = useComposerDraftStore.getState();
    const draft = state.draftsByThreadId[threadId];
    const expectedSelection = modelSelection("openai", "gpt-5.4", { fastMode: true });
    expect(draft?.modelSelectionByProvider.openai).toEqual(expectedSelection);
    expect(state.stickyModelSelectionByProvider.openai).toEqual(expectedSelection);
    expect(
      resolvePreferredComposerModelSelection({
        draft,
        threadModelSelection: null,
        projectModelSelection: null,
      }),
    ).toEqual(expectedSelection);
  });

  it("retains a runtime OpenAI effort when reselecting the same model", () => {
    const store = useComposerDraftStore.getState();
    const selection = modelSelection("openai", "gpt-5.6-sol", {
      reasoningEffort: "max",
      fastMode: true,
    });
    store.setModelSelectionAndSticky(threadId, selection);

    store.setModelSelectionAndSticky(threadId, modelSelection("openai", "gpt-5.6-sol"));

    const state = useComposerDraftStore.getState();
    expect(state.draftsByThreadId[threadId]?.modelSelectionByProvider.openai).toEqual(selection);
    expect(state.stickyModelSelectionByProvider.openai).toEqual(selection);
  });

  it("preserves a built-in OpenAI effort supported by both models", () => {
    const store = useComposerDraftStore.getState();
    store.setModelSelectionAndSticky(
      threadId,
      modelSelection("openai", "gpt-5.5", { reasoningEffort: "xhigh", fastMode: true }),
    );

    store.setModelSelectionAndSticky(threadId, modelSelection("openai", "gpt-5.4"));

    const expectedSelection = modelSelection("openai", "gpt-5.4", {
      reasoningEffort: "xhigh",
      fastMode: true,
    });
    const state = useComposerDraftStore.getState();
    expect(state.draftsByThreadId[threadId]?.modelSelectionByProvider.openai).toEqual(
      expectedSelection,
    );
    expect(state.stickyModelSelectionByProvider.openai).toEqual(expectedSelection);
  });

  it("restores OpenRouter state without transferring the active OpenAI effort", () => {
    const store = useComposerDraftStore.getState();
    const routerSelection = modelSelection("openrouter", "cursor-auto", {
      reasoningEffort: "high",
    });
    store.setModelSelectionAndSticky(threadId, routerSelection);
    store.setModelSelectionAndSticky(
      threadId,
      modelSelection("openai", "gpt-5.6-sol", { reasoningEffort: "ultra" }),
    );

    store.setModelSelectionAndSticky(threadId, modelSelection("openrouter", "cursor-auto"));

    const state = useComposerDraftStore.getState();
    expect(state.draftsByThreadId[threadId]?.modelSelectionByProvider.openrouter).toEqual(
      routerSelection,
    );
    expect(state.stickyModelSelectionByProvider.openrouter).toEqual(routerSelection);
  });

  it("restores OpenAI state without transferring the active OpenRouter effort", () => {
    const store = useComposerDraftStore.getState();
    const openaiSelection = modelSelection("openai", "gpt-5.4", {
      reasoningEffort: "xhigh",
    });
    store.setModelSelectionAndSticky(threadId, openaiSelection);
    store.setModelSelectionAndSticky(
      threadId,
      modelSelection("openrouter", "cursor-auto", { reasoningEffort: "high" }),
    );

    store.setModelSelectionAndSticky(threadId, modelSelection("openai", "gpt-5.4"));

    const state = useComposerDraftStore.getState();
    expect(state.draftsByThreadId[threadId]?.modelSelectionByProvider.openai).toEqual(
      openaiSelection,
    );
    expect(state.stickyModelSelectionByProvider.openai).toEqual(openaiSelection);
  });

  it("uses destination defaults when switching providers without saved state", () => {
    const store = useComposerDraftStore.getState();
    store.setModelSelectionAndSticky(
      threadId,
      modelSelection("openai", "gpt-5.6-sol", { reasoningEffort: "ultra" }),
    );

    store.setModelSelectionAndSticky(threadId, modelSelection("anthropic", "claude-opus-4-6"));

    const state = useComposerDraftStore.getState();
    expect(state.draftsByThreadId[threadId]?.modelSelectionByProvider.anthropic).toEqual(
      modelSelection("anthropic", "claude-opus-4-6"),
    );
    expect(state.stickyModelSelectionByProvider.anthropic).toEqual(
      modelSelection("anthropic", "claude-opus-4-6"),
    );
  });
});

describe("composerDraftStore sticky composer settings", () => {
  beforeEach(() => {
    resetComposerDraftStore();
  });

  it("stores a sticky model selection", () => {
    const store = useComposerDraftStore.getState();

    store.setStickyModelSelection(
      modelSelection("openai", "gpt-5.3-codex", {
        reasoningEffort: "medium",
        fastMode: true,
      }),
    );

    expect(useComposerDraftStore.getState().stickyModelSelectionByProvider.openai).toEqual(
      modelSelection("openai", "gpt-5.3-codex", {
        reasoningEffort: "medium",
        fastMode: true,
      }),
    );
    expect(useComposerDraftStore.getState().stickyActiveProvider).toBe("openai");
  });

  it("normalizes empty sticky model options by dropping selection options", () => {
    const store = useComposerDraftStore.getState();

    store.setStickyModelSelection(modelSelection("openai", "gpt-5.4"));

    expect(useComposerDraftStore.getState().stickyModelSelectionByProvider.openai).toEqual(
      modelSelection("openai", "gpt-5.4"),
    );
    expect(useComposerDraftStore.getState().stickyActiveProvider).toBe("openai");
  });

  it("applies sticky activeProvider to new drafts", () => {
    const store = useComposerDraftStore.getState();
    const threadId = ThreadId.makeUnsafe("thread-sticky-active-provider");

    store.setStickyModelSelection(modelSelection("anthropic", "claude-opus-4-6"));
    store.applyStickyState(threadId);

    expect(useComposerDraftStore.getState().draftsByThreadId[threadId]).toMatchObject({
      modelSelectionByProvider: {
        anthropic: modelSelection("anthropic", "claude-opus-4-6"),
      },
      activeProvider: "anthropic",
    });
  });

  it("does not overwrite existing model-scoped options with another sticky model", () => {
    const store = useComposerDraftStore.getState();
    const threadId = ThreadId.makeUnsafe("thread-sticky-model-scope");
    const currentSelection = modelSelection("openai", "gpt-5.4", {
      reasoningEffort: "xhigh",
    });
    store.setStickyModelSelection(
      modelSelection("openai", "gpt-5.6-sol", { reasoningEffort: "ultra" }),
    );
    store.setModelSelection(threadId, currentSelection);

    store.applyStickyState(threadId);

    expect(
      useComposerDraftStore.getState().draftsByThreadId[threadId]?.modelSelectionByProvider.openai,
    ).toEqual(currentSelection);
  });

  it("restores sticky options for the same provider and model", () => {
    const store = useComposerDraftStore.getState();
    const threadId = ThreadId.makeUnsafe("thread-sticky-same-model");
    const stickySelection = modelSelection("openai", "gpt-5.4", {
      reasoningEffort: "xhigh",
    });
    store.setStickyModelSelection(stickySelection);
    store.setModelSelection(threadId, modelSelection("openai", "gpt-5.4"));

    store.applyStickyState(threadId);

    expect(
      useComposerDraftStore.getState().draftsByThreadId[threadId]?.modelSelectionByProvider.openai,
    ).toEqual(stickySelection);
  });
});

describe("composerDraftStore provider-scoped option updates", () => {
  const threadId = ThreadId.makeUnsafe("thread-provider");

  beforeEach(() => {
    resetComposerDraftStore();
  });

  it("retains off-provider option memory without changing the active selection", () => {
    const store = useComposerDraftStore.getState();
    store.setModelSelection(
      threadId,
      modelSelection("openai", "gpt-5.3-codex", {
        reasoningEffort: "medium",
      }),
    );
    store.setProviderModelOptions(threadId, "anthropic", { reasoningEffort: "max" });
    const draft = useComposerDraftStore.getState().draftsByThreadId[threadId];
    expect(draft?.modelSelectionByProvider.openai).toEqual(
      modelSelection("openai", "gpt-5.3-codex", { reasoningEffort: "medium" }),
    );
    expect(draft?.modelSelectionByProvider.anthropic?.options).toEqual({ reasoningEffort: "max" });
    expect(draft?.activeProvider).toBe("openai");
  });

  it("retains Anthropic xhigh effort in provider-scoped options", () => {
    const store = useComposerDraftStore.getState();

    store.setProviderModelOptions(
      threadId,
      "anthropic",
      { reasoningEffort: "xhigh" },
      { model: "claude-opus-4-7" },
    );

    const draft = useComposerDraftStore.getState().draftsByThreadId[threadId];
    expect(draft?.modelSelectionByProvider.anthropic).toEqual(
      modelSelection("anthropic", "claude-opus-4-7", {
        reasoningEffort: "xhigh",
      }),
    );
  });

  it("retains xAI reasoning effort in provider-scoped options", () => {
    const store = useComposerDraftStore.getState();

    store.setProviderModelOptions(
      threadId,
      "xai",
      { reasoningEffort: "high" },
      { model: "grok-4" },
    );

    const draft = useComposerDraftStore.getState().draftsByThreadId[threadId];
    expect(draft?.modelSelectionByProvider.xai).toEqual(
      modelSelection("xai", "grok-4", {
        reasoningEffort: "high",
      }),
    );
  });
});
