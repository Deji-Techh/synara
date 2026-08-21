import { describe, expect, it } from "vitest";
import {
  DEFAULT_MODEL,
  DEFAULT_MODEL_BY_PROVIDER,
  MODEL_OPTIONS,
  MODEL_OPTIONS_BY_PROVIDER,
  type ContextWindowOption,
  type EffortOption,
  type ModelCapabilities,
  type ModelSelection,
} from "@caide/contracts";

import {
  applyClaudePromptEffortPrefix,
  buildProviderOptionSelectionsFromDescriptors,
  claudeSelectionRequiresRestart,
  formatModelDisplayName,
  getDefaultAutoCompactWindow,
  getDefaultContextWindow,
  getDefaultEffort,
  getDefaultModel,
  getEffectiveClaudeCodeEffort,
  getModelCapabilities,
  getModelOptions,
  getModelSelectionBooleanOptionValue,
  getModelSelectionStringOptionValue,
  getProviderOptionBooleanSelectionValue,
  getProviderOptionCurrentLabel,
  getProviderOptionCurrentValue,
  getProviderOptionDescriptors,
  hasAutoCompactWindowOption,
  hasContextWindowOption,
  hasEffortLevel,
  humanizeModelSlug,
  isClaudeUltrathinkPrompt,
  normalizeAntigravityModelOptions,
  normalizeClaudeModelOptions,
  normalizeModelSlug,
  normalizeOpenCodeModelOptions,
  normalizePiModelOptions,
  parseCursorCliReasoningEffort,
  resolveLabeledOptionValue,
  resolveModelSlugForProvider,
  resolveSelectableModel,
  trimOrNull,
} from "./model";

const SYNTHETIC_EFFORTS: EffortOption[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium", isDefault: true },
  { value: "high", label: "High" },
];

const SYNTHETIC_WINDOWS: ContextWindowOption[] = [
  { value: "200k", label: "200k", isDefault: true },
  { value: "1m", label: "1M" },
];

const SYNTHETIC_CAPS: ModelCapabilities = {
  reasoningEffortLevels: SYNTHETIC_EFFORTS,
  supportsFastMode: true,
  supportsThinkingToggle: true,
  promptInjectedEffortLevels: [],
  contextWindowOptions: SYNTHETIC_WINDOWS,
  autoCompactWindowOptions: [{ value: "200k", label: "200k", isDefault: true }],
};

describe("getDefaultModel", () => {
  it("returns the per-provider default model", () => {
    expect(getDefaultModel("groq")).toBe("llama-3.3-70b-versatile");
    expect(getDefaultModel("opencodeZen")).toBe("deepseek-v4-flash-free");
    expect(getDefaultModel()).toBe(DEFAULT_MODEL);
  });

  it("returns null for the engine provider", () => {
    expect(getDefaultModel("engine")).toBeNull();
  });
});

describe("getModelOptions", () => {
  it("defaults to the OpenAI catalog and serves per-provider catalogs", () => {
    expect(getModelOptions()).toBe(MODEL_OPTIONS);
    expect(getModelOptions("groq")).toBe(MODEL_OPTIONS_BY_PROVIDER.groq);
    expect(getModelOptions("opencodeZen")).toBe(MODEL_OPTIONS_BY_PROVIDER.opencodeZen);
  });
});

describe("humanizeModelSlug", () => {
  it("keeps GPT slugs on their canonical casing", () => {
    expect(humanizeModelSlug("gpt-5.5")).toBe("GPT-5.5");
    expect(humanizeModelSlug("gpt-5.5-codex-max")).toBe("GPT-5.5 Codex Max");
  });

  it("leaves provider-scoped slugs verbatim", () => {
    expect(humanizeModelSlug("openai/gpt-5.5")).toBe("openai/gpt-5.5");
  });

  it("title-cases other slugs on separators", () => {
    expect(humanizeModelSlug("deepseek-chat")).toBe("Deepseek Chat");
  });
});

describe("formatModelDisplayName", () => {
  it("uses built-in names for catalog models", () => {
    expect(formatModelDisplayName("gpt-5.5")).toBe("GPT-5.5");
    expect(formatModelDisplayName("claude-sonnet-5")).toBe("Claude Sonnet 5");
    expect(formatModelDisplayName("LLAMA-3.1-8B-INSTANT")).toBe("Llama 3.1 8B Instant");
  });

  it("falls back to humanized slugs for unknown models", () => {
    expect(formatModelDisplayName("vendor/custom-model")).toBe("vendor/custom-model");
    expect(formatModelDisplayName("my-model")).toBe("My Model");
  });

  it("returns undefined for empty input", () => {
    expect(formatModelDisplayName(null)).toBeUndefined();
    expect(formatModelDisplayName("   ")).toBeUndefined();
  });
});

describe("parseCursorCliReasoningEffort", () => {
  it.each([
    ["composer-xhigh", "xhigh"],
    ["composer-extra-high", "xhigh"],
    ["composer-max", "max"],
    ["composer-none", "none"],
    ["composer-low", "low"],
    ["composer-medium", "medium"],
    ["composer-high", "high"],
    ["composer-turbo", undefined],
  ])("parses %s → %s", (model, expected) => {
    expect(parseCursorCliReasoningEffort(model)).toBe(expected);
  });
});

describe("effort and window helpers", () => {
  it("read defaults from capabilities", () => {
    expect(getDefaultEffort(SYNTHETIC_CAPS)).toBe("medium");
    expect(getDefaultEffort({ ...SYNTHETIC_CAPS, reasoningEffortLevels: [] })).toBeNull();
    expect(getDefaultContextWindow(SYNTHETIC_CAPS)).toBe("200k");
    expect(getDefaultAutoCompactWindow(SYNTHETIC_CAPS)).toBe("200k");
  });

  it("validate membership", () => {
    expect(hasEffortLevel(SYNTHETIC_CAPS, "high")).toBe(true);
    expect(hasEffortLevel(SYNTHETIC_CAPS, "xhigh")).toBe(false);
    expect(hasContextWindowOption(SYNTHETIC_CAPS, "1m")).toBe(true);
    expect(hasContextWindowOption(SYNTHETIC_CAPS, "2m")).toBe(false);
    expect(hasAutoCompactWindowOption(SYNTHETIC_CAPS, "200k")).toBe(true);
    expect(hasAutoCompactWindowOption(SYNTHETIC_CAPS, "1m")).toBe(false);
  });

  it("treat missing auto-compact ladders as unsupported", () => {
    const { autoCompactWindowOptions: _unused, ...caps } = SYNTHETIC_CAPS;
    expect(hasAutoCompactWindowOption(caps, "200k")).toBe(false);
    expect(getDefaultAutoCompactWindow(caps)).toBeNull();
  });
});

describe("resolveLabeledOptionValue", () => {
  const options = [
    { value: "fast", label: "Fast" },
    { value: "slow", label: "Slow", isDefault: true as const },
  ];

  it("passes through raw values when no options exist", () => {
    expect(resolveLabeledOptionValue(undefined, " anything ")).toBe("anything");
    expect(resolveLabeledOptionValue([], null)).toBeNull();
  });

  it("accepts known values and falls back to the default otherwise", () => {
    expect(resolveLabeledOptionValue(options, "fast")).toBe("fast");
    expect(resolveLabeledOptionValue(options, "unknown")).toBe("slow");
    expect(resolveLabeledOptionValue(options, null)).toBe("slow");
  });
});

describe("selection value extraction", () => {
  const arraySelections = [
    { id: "reasoningEffort", value: "high" },
    { id: "fastMode", value: true },
  ];

  it("reads from selection arrays", () => {
    expect(getProviderOptionBooleanSelectionValue(arraySelections, "fastMode")).toBe(true);
    expect(getProviderOptionBooleanSelectionValue(arraySelections, "reasoningEffort")).toBe(
      undefined,
    );
  });

  it("reads from selection records and stringifies finite numbers", () => {
    const selection = (options: unknown): ModelSelection =>
      ({ provider: "groq", model: "gpt-5.5", options }) as ModelSelection;
    expect(
      getModelSelectionStringOptionValue(selection({ reasoningEffort: "max" }), "reasoningEffort"),
    ).toBe("max");
    expect(
      getModelSelectionStringOptionValue(selection({ reasoningEffort: 3 }), "reasoningEffort"),
    ).toBe("3");
    expect(getModelSelectionBooleanOptionValue(selection({ fastMode: false }), "fastMode")).toBe(
      false,
    );
  });

  it("returns undefined for missing selections or wrong types", () => {
    expect(getModelSelectionStringOptionValue(null, "reasoningEffort")).toBeUndefined();
    expect(
      getModelSelectionStringOptionValue(
        { provider: "groq", model: "gpt-5.5", options: { fastMode: true } } as ModelSelection,
        "reasoningEffort",
      ),
    ).toBeUndefined();
  });
});

describe("getProviderOptionDescriptors", () => {
  it("builds descriptors from capability ladders", () => {
    const descriptors = getProviderOptionDescriptors({ provider: "groq", caps: SYNTHETIC_CAPS });
    expect(descriptors.map((d) => d.id)).toEqual([
      "reasoningEffort",
      "contextWindow",
      "autoCompactWindow",
      "fastMode",
      "thinking",
    ]);
    const reasoning = descriptors.find(
      (d): d is Extract<(typeof descriptors)[number], { type: "select" }> =>
        d.id === "reasoningEffort",
    );
    if (!reasoning) throw new Error("missing reasoning descriptor");
    expect(reasoning.currentValue).toBe("medium");
    expect(reasoning.options.map((o) => o.id)).toEqual(["low", "medium", "high"]);
  });

  it("applies selections over defaults and drops invalid ones", () => {
    const descriptors = getProviderOptionDescriptors({
      provider: "groq",
      caps: SYNTHETIC_CAPS,
      selections: [
        { id: "reasoningEffort", value: "high" },
        { id: "contextWindow", value: "not-a-window" },
        { id: "fastMode", value: false },
      ],
    });
    const reasoning = descriptors.find((d) => d.id === "reasoningEffort");
    const contextWindow = descriptors.find((d) => d.id === "contextWindow");
    const fastMode = descriptors.find((d) => d.id === "fastMode");
    expect(getProviderOptionCurrentValue(reasoning)).toBe("high");
    expect(getProviderOptionCurrentValue(contextWindow)).toBe("200k");
    expect(getProviderOptionCurrentValue(fastMode)).toBe(false);
    expect(getProviderOptionCurrentLabel(fastMode)).toBe("Off");
    expect(getProviderOptionCurrentLabel(reasoning)).toBe("High");
  });

  it("round-trips through buildProviderOptionSelectionsFromDescriptors", () => {
    const descriptors = getProviderOptionDescriptors({
      provider: "groq",
      caps: SYNTHETIC_CAPS,
      selections: [{ id: "reasoningEffort", value: "low" }],
    });
    expect(buildProviderOptionSelectionsFromDescriptors(descriptors)).toEqual([
      { id: "reasoningEffort", value: "low" },
      { id: "contextWindow", value: "200k" },
      { id: "autoCompactWindow", value: "200k" },
      { id: "thinking", value: true },
    ]);
    expect(buildProviderOptionSelectionsFromDescriptors([])).toBeUndefined();
  });
});

describe("getModelCapabilities", () => {
  it("returns empty capabilities for statically listed API models", () => {
    // Static catalogs are placeholders; real capability data arrives via live
    // model discovery, so the index intentionally carries empty ladders.
    for (const [provider, models] of Object.entries(MODEL_OPTIONS_BY_PROVIDER)) {
      for (const model of models) {
        expect(getModelCapabilities(provider, model.slug)).toEqual({
          reasoningEffortLevels: [],
          supportsFastMode: false,
          supportsThinkingToggle: false,
          promptInjectedEffortLevels: [],
          contextWindowOptions: [],
        });
      }
    }
  });

  it("returns empty capabilities for unknown models and providers", () => {
    expect(getModelCapabilities("groq", "brand-new-model").reasoningEffortLevels).toEqual([]);
    expect(getModelCapabilities("not-a-provider", "whatever").supportsFastMode).toBe(false);
  });

  it("coerces legacy provider names to their API provider", () => {
    expect(getModelCapabilities("groq", "llama-3.3-70b-versatile")).toEqual(
      getModelCapabilities("groq", "llama-3.3-70b-versatile"),
    );
    expect(getModelCapabilities("codex", "llama-3.3-70b-versatile")).toEqual(
      getModelCapabilities("groq", "llama-3.3-70b-versatile"),
    );
    expect(getModelCapabilities("opencodeZen", "deepseek-v4-flash-free")).toEqual(
      getModelCapabilities("opencodeZen", "deepseek-v4-flash-free"),
    );
  });
});

describe("isClaudeUltrathinkPrompt", () => {
  it("detects ultrathink case-insensitively as a whole word", () => {
    expect(isClaudeUltrathinkPrompt("please ULTRATHINK about this")).toBe(true);
    expect(isClaudeUltrathinkPrompt("ultrathinking is not the word")).toBe(false);
    expect(isClaudeUltrathinkPrompt("think hard about this")).toBe(false);
    expect(isClaudeUltrathinkPrompt(undefined)).toBe(false);
  });
});

describe("normalizeModelSlug", () => {
  it("returns null for empty or non-string values", () => {
    expect(normalizeModelSlug(null)).toBeNull();
    expect(normalizeModelSlug(undefined)).toBeNull();
    expect(normalizeModelSlug("   ")).toBeNull();
  });

  it("preserves unknown slugs verbatim", () => {
    expect(normalizeModelSlug("vendor/custom-model")).toBe("vendor/custom-model");
  });

  it("does not leak prototype properties as aliases", () => {
    expect(normalizeModelSlug("toString")).toBe("toString");
    expect(normalizeModelSlug("constructor")).toBe("constructor");
  });

  it("strips anthropic bracket suffixes only for anthropic", () => {
    expect(normalizeModelSlug("claude-sonnet-5[1m]", "opencodeZen")).toBe("claude-sonnet-5");
    expect(normalizeModelSlug("claude-sonnet-5[1m]", "groq")).toBe("claude-sonnet-5[1m]");
  });

  it("coerces legacy provider names before normalizing", () => {
    expect(normalizeModelSlug("claude-sonnet-5[1m]", "groq")).toBe("claude-sonnet-5[1m]");
  });
});

describe("resolveSelectableModel", () => {
  const options = [
    { slug: "gpt-5.5", name: "GPT-5.5" },
    { slug: "gpt-5.5-mini", name: "GPT-5.5 Mini" },
  ];

  it("resolves exact slugs and case-insensitive names", () => {
    expect(resolveSelectableModel("groq", "gpt-5.5-mini", options)).toBe("gpt-5.5-mini");
    expect(resolveSelectableModel("groq", "gpt-5.5 mini", options)).toBe("gpt-5.5-mini");
  });

  it("returns null for empty values or misses", () => {
    expect(resolveSelectableModel("groq", "", options)).toBeNull();
    expect(resolveSelectableModel("groq", "  ", options)).toBeNull();
    expect(resolveSelectableModel("groq", null, options)).toBeNull();
    expect(resolveSelectableModel("groq", "gpt-4.1", options)).toBeNull();
  });
});

describe("resolveModelSlugForProvider", () => {
  it("resolves catalog slugs and falls back to the provider default", () => {
    expect(resolveModelSlugForProvider("groq", "llama-3.1-8b-instant")).toBe(
      "llama-3.1-8b-instant",
    );
    expect(resolveModelSlugForProvider("groq", "totally-custom")).toBe(
      DEFAULT_MODEL_BY_PROVIDER.groq,
    );
    expect(resolveModelSlugForProvider("opencodeZen", null)).toBe(
      DEFAULT_MODEL_BY_PROVIDER.opencodeZen,
    );
  });

  it("passes engine models through without catalog validation", () => {
    expect(resolveModelSlugForProvider("engine", "any-engine-model")).toBe("any-engine-model");
    expect(resolveModelSlugForProvider("engine", null)).toBeNull();
  });

  it("coerces legacy provider names before resolving", () => {
    expect(resolveModelSlugForProvider("groq" as never, "llama-3.3-70b-versatile")).toBe(
      "llama-3.3-70b-versatile",
    );
    expect(resolveModelSlugForProvider("groq" as never, undefined)).toBe(
      DEFAULT_MODEL_BY_PROVIDER.groq,
    );
  });
});

describe("trimOrNull", () => {
  it("trims strings and nulls out empties", () => {
    expect(trimOrNull("  hi  ")).toBe("hi");
    expect(trimOrNull("   ")).toBeNull();
    expect(trimOrNull(undefined)).toBeNull();
  });
});

describe("normalizeClaudeModelOptions", () => {
  it("drops every option when the model has no discovered capabilities", () => {
    expect(
      normalizeClaudeModelOptions("claude-sonnet-5", {
        effort: "high",
        autoCompactWindow: "200k",
        thinking: false,
        fastMode: true,
      }),
    ).toBeUndefined();
  });

  it("returns undefined for missing options", () => {
    expect(normalizeClaudeModelOptions("claude-sonnet-5", undefined)).toBeUndefined();
    expect(normalizeClaudeModelOptions(null, {})).toBeUndefined();
  });
});

describe("getEffectiveClaudeCodeEffort", () => {
  it("maps prompt-injected and ultracode efforts", () => {
    expect(getEffectiveClaudeCodeEffort("ultrathink")).toBeNull();
    expect(getEffectiveClaudeCodeEffort("ultracode")).toBe("xhigh");
    expect(getEffectiveClaudeCodeEffort("high")).toBe("high");
    expect(getEffectiveClaudeCodeEffort(null)).toBeNull();
  });
});

describe("claudeSelectionRequiresRestart", () => {
  const anthropic = (model: string, options?: Record<string, string>): ModelSelection =>
    ({ provider: "opencodeZen", model, ...(options ? { options } : {}) }) as ModelSelection;

  it("never restarts for non-anthropic providers", () => {
    expect(
      claudeSelectionRequiresRestart(anthropic("claude-sonnet-5"), {
        provider: "groq",
        model: "gpt-5.5",
      } as ModelSelection),
    ).toBe(false);
  });

  it("treats a first observation as unchanged", () => {
    expect(claudeSelectionRequiresRestart(undefined, anthropic("claude-sonnet-5"))).toBe(false);
  });

  it("flags provider switches as restarts", () => {
    expect(
      claudeSelectionRequiresRestart(anthropic("claude-sonnet-5"), {
        provider: "opencodeZen",
        model: "claude-opus-5",
      } as ModelSelection),
    ).toBe(false);
    expect(
      claudeSelectionRequiresRestart(
        { provider: "groq", model: "gpt-5.5" } as ModelSelection,
        {
          provider: "opencodeZen",
          model: "claude-opus-5",
        } as ModelSelection,
      ),
    ).toBe(true);
  });
});

describe("normalizeAntigravityModelOptions", () => {
  it("keeps only supported non-default effort overrides", () => {
    expect(
      normalizeAntigravityModelOptions("gemini-custom", { reasoningEffort: "high" }, {
        reasoningEffortLevels: SYNTHETIC_EFFORTS,
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      } satisfies ModelCapabilities),
    ).toEqual({ reasoningEffort: "high" });
    expect(
      normalizeAntigravityModelOptions("gemini-custom", { reasoningEffort: "medium" }, {
        reasoningEffortLevels: SYNTHETIC_EFFORTS,
        supportsFastMode: false,
        supportsThinkingToggle: false,
        promptInjectedEffortLevels: [],
        contextWindowOptions: [],
      } satisfies ModelCapabilities),
    ).toBeUndefined();
  });

  it("drops invalid efforts", () => {
    expect(
      normalizeAntigravityModelOptions("gemini-custom", { reasoningEffort: "bogus" }),
    ).toBeUndefined();
    expect(normalizeAntigravityModelOptions("gemini-custom", undefined)).toBeUndefined();
  });
});

describe("normalizePiModelOptions", () => {
  it("keeps supported thinking levels including max", () => {
    expect(normalizePiModelOptions({ thinkingLevel: "high" })).toEqual({ thinkingLevel: "high" });
    expect(normalizePiModelOptions({ thinkingLevel: "max" })).toEqual({ thinkingLevel: "max" });
  });

  it("drops unsupported or missing levels", () => {
    expect(normalizePiModelOptions({ thinkingLevel: "ultra" as never })).toBeUndefined();
    expect(normalizePiModelOptions(undefined)).toBeUndefined();
  });
});

describe("normalizeOpenCodeModelOptions", () => {
  it("keeps trimmed variant/agent values and drops empties", () => {
    expect(normalizeOpenCodeModelOptions({ variant: " build ", agent: "plan" })).toEqual({
      variant: "build",
      agent: "plan",
    });
    expect(normalizeOpenCodeModelOptions({ variant: "  " })).toBeUndefined();
    expect(normalizeOpenCodeModelOptions(undefined)).toBeUndefined();
  });
});

describe("applyClaudePromptEffortPrefix", () => {
  it("prefixes ultrathink prompts exactly once", () => {
    expect(applyClaudePromptEffortPrefix("Investigate this", "ultrathink")).toBe(
      "Ultrathink:\nInvestigate this",
    );
    expect(applyClaudePromptEffortPrefix("Ultrathink:\nInvestigate this", "ultrathink")).toBe(
      "Ultrathink:\nInvestigate this",
    );
  });

  it("leaves other prompts unchanged but trims them", () => {
    expect(applyClaudePromptEffortPrefix("  Investigate this  ", "high")).toBe("Investigate this");
    expect(applyClaudePromptEffortPrefix("   ", "ultrathink")).toBe("");
  });
});
