// FILE: modelSelectionCompatibility.ts
// Purpose: Normalizes persisted model-selection JSON from older/newer app builds.
// Layer: Persistence compatibility helper
// Exports: normalizeLegacyModelSelection, normalizePersistedModelSelection

import { type ProviderKind, MODEL_OPTIONS_BY_PROVIDER } from "@caide/contracts";

type ModelProviderKind = ProviderKind;

const NON_DROID_MODEL_SLUGS = new Set(
  Object.entries(MODEL_OPTIONS_BY_PROVIDER).flatMap(([provider, models]) =>
    provider === "groq" ? [] : models.map((model) => model.slug.toLowerCase()),
  ),
);
const DROID_ONLY_MODEL_SLUGS = new Set(
  ((MODEL_OPTIONS_BY_PROVIDER as Record<string, readonly { slug: string }[] | undefined>).groq ?? [])
    .map((model) => model.slug.toLowerCase())
    .filter((slug) => !NON_DROID_MODEL_SLUGS.has(slug)),
);

const LEGACY_GEMINI_MODEL_LABELS: Readonly<Record<string, string>> = {
  "gemini-3.1-pro-preview": "Gemini 3.1 Pro",
  "gemini-3-flash-preview": "Gemini 3.5 Flash",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readTrimmedString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

// Imported instance ids may be runtime names rather than Caide provider literals.
function inferProviderFromLabel(label: string): ModelProviderKind | undefined {
  const lowerLabel = label.toLowerCase();
  if (lowerLabel.includes("engine")) return "engine";
  if (lowerLabel.includes("opencode") && lowerLabel.includes("go")) return "opencodeGo";
  if (lowerLabel.includes("opencode")) return "opencodeZen";
  if (lowerLabel.includes("openai") || lowerLabel.includes("codex") || lowerLabel.includes("droid")) return "openai";
  if (lowerLabel.includes("anthropic") || lowerLabel.includes("claude")) return "anthropic";
  if (lowerLabel.includes("google") || lowerLabel.includes("gemini")) return "google";
  if (lowerLabel.includes("deepseek")) return "deepseek";
  if (lowerLabel.includes("mistral")) return "mistral";
  if (lowerLabel.includes("ollama")) return "ollama";
  if (lowerLabel.includes("openrouter")) return "openrouter";
  if (lowerLabel.includes("together")) return "together";
  if (lowerLabel.includes("cohere")) return "cohere";
  if (lowerLabel.includes("xai") || lowerLabel.includes("grok")) return "xai";
  if (lowerLabel.includes("fireworks")) return "fireworks";
  if (lowerLabel.includes("groq")) return "groq";
  return undefined;
}

function inferLegacyModelProvider(provider: unknown, model: string): ModelProviderKind {
  if (typeof provider === "string") {
    if (
      provider === "engine" ||
      provider === "openai" ||
      provider === "anthropic" ||
      provider === "google" ||
      provider === "openrouter" ||
      provider === "ollama" ||
      provider === "deepseek" ||
      provider === "groq" ||
      provider === "mistral" ||
      provider === "together" ||
      provider === "cohere" ||
      provider === "xai" ||
      provider === "fireworks" ||
      provider === "opencodeZen" ||
      provider === "opencodeGo"
    ) {
      return provider as ModelProviderKind;
    }
    const providerFromLabel = inferProviderFromLabel(provider);
    if (providerFromLabel !== undefined) {
      return providerFromLabel;
    }
  }
  return "openai";
}

function readLegacyProviderOptions(options: unknown, provider: ModelProviderKind): unknown {
  if (!isRecord(options)) {
    return options;
  }
  const providerScopedOptions = options[provider];
  return providerScopedOptions === undefined ? options : providerScopedOptions;
}

function normalizeModelOptions(input: unknown): unknown {
  if (!Array.isArray(input)) {
    return input;
  }

  const entries: Array<readonly [string, unknown]> = [];
  for (const option of input) {
    if (!isRecord(option)) {
      return input;
    }
    const id = readTrimmedString(option, "id");
    if (id === undefined) {
      return input;
    }
    entries.push([id, option.value]);
  }
  return Object.fromEntries(entries);
}

function splitLegacyAntigravityModelLabel(model: string): {
  model: string;
  reasoningEffort?: string;
} {
  const match = model.trim().match(/^(.*?)\s+\(([^()]+)\)$/u);
  if (!match?.[1] || !match[2]) {
    return { model };
  }
  const reasoningEffort = match[2].trim().toLowerCase();
  if (!new Set(["low", "medium", "high", "thinking"]).has(reasoningEffort)) {
    return { model };
  }
  return {
    model: match[1].trim(),
    reasoningEffort,
  };
}

function migrateLegacyGeminiModel(model: string): string {
  const trimmed = model.trim();
  return LEGACY_GEMINI_MODEL_LABELS[trimmed.toLowerCase()] ?? trimmed;
}

export function normalizeLegacyModelSelection(input: {
  readonly provider: unknown;
  readonly model: string;
  readonly options: unknown;
}): Record<string, unknown> {
  const provider = inferLegacyModelProvider(input.provider, input.model);
  const migratedGeminiSelection = input.provider === "gemini";
  const normalizedOptions = migratedGeminiSelection
    ? undefined
    : normalizeModelOptions(readLegacyProviderOptions(input.options, provider));
  const antigravityModel =
    (provider as string) === "google"
      ? splitLegacyAntigravityModelLabel(
          migratedGeminiSelection ? migrateLegacyGeminiModel(input.model) : input.model,
        )
      : null;
  const options =
    antigravityModel?.reasoningEffort &&
    (normalizedOptions === undefined || isRecord(normalizedOptions))
      ? {
          ...(isRecord(normalizedOptions) ? normalizedOptions : {}),
          reasoningEffort: antigravityModel.reasoningEffort,
        }
      : normalizedOptions;
  return {
    provider,
    model: antigravityModel?.model ?? input.model,
    ...(options === undefined ? {} : { options }),
  };
}

export function normalizePersistedModelSelection(input: unknown): unknown {
  if (!isRecord(input)) {
    return input;
  }

  const model = readTrimmedString(input, "model");
  if (model === undefined) {
    return input;
  }

  // Newer Caide writes provider-less selections as { instanceId, model } and
  // option rows as [{ id, value }]; Caide stores canonical provider/options objects.
  return normalizeLegacyModelSelection({
    provider: input.provider ?? input.instanceId,
    model,
    options: input.options,
  });
}
