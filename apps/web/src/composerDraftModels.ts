// FILE: composerDraftModels.ts
// Purpose: Normalizes provider-scoped model selections and resolves effective composer models.
// Exports: Model state helpers used by persistence, actions, and the public facade.

import {
  GROK_REASONING_EFFORT_OPTIONS,
  ProviderKind,
  type ClaudeCodeEffort,
  type CodexReasoningEffort,
  type CursorModelOptions,
  type DroidReasoningEffort,
  type GrokReasoningEffort,
  type ModelSelection,
  type ModelSlug,
  type PiThinkingLevel,
  type ProviderModelOptions,
} from "@caide/contracts";
import * as Schema from "effect/Schema";

import {
  coerceProviderKind,
  getDefaultModel,
  normalizeModelSlug,
  resolveModelSlugForProvider,
  resolveSelectableModel,
} from "@caide/shared/model";
import { resolveAppModelSelection } from "./appSettings";
import type { ComposerThreadDraftState } from "./composerDraftDomain";
import { classifyProviderReasoningEffortSupport } from "./lib/codexReasoningEffort";

export const COMPOSER_PROVIDER_KINDS = [
  "engine",
  "openai",
  "anthropic",
  "google",
  "openrouter",
  "ollama",
  "deepseek",
  "groq",
  "mistral",
  "together",
  "cohere",
  "xai",
  "fireworks",
  "opencodeZen",
  "opencodeGo",
] as const satisfies readonly ProviderKind[];

const isProviderKind = Schema.is(ProviderKind);

export const LegacyCodexFields = Schema.Struct({
  effort: Schema.optionalKey(Schema.String),
  codexFastMode: Schema.optionalKey(Schema.Boolean),
  serviceTier: Schema.optionalKey(Schema.String),
});

export type LegacyCodexFields = typeof LegacyCodexFields.Type;

export interface EffectiveComposerModelState {
  selectedModel: ModelSlug;
  modelOptions: ProviderModelOptions | null;
}

function mergeProviderModelOptionsFromSelections(
  ...selections: ReadonlyArray<ModelSelection | null | undefined>
): ProviderModelOptions | null {
  const result: Partial<Record<ProviderKind, ProviderModelOptions[ProviderKind]>> = {};
  for (const selection of selections) {
    if (!selection) continue;
    if (selection.options) {
      result[selection.provider] = selection.options as any;
    } else {
      delete result[selection.provider];
    }
  }
  return Object.keys(result).length > 0 ? (result as ProviderModelOptions) : null;
}

function deriveEffectiveComposerModelOptions(input: {
  draft:
    | Pick<ComposerThreadDraftState, "modelSelectionByProvider" | "activeProvider">
    | null
    | undefined;
  threadModelSelection: ModelSelection | null | undefined;
  projectModelSelection: ModelSelection | null | undefined;
}): ProviderModelOptions | null {
  const baseOptions = mergeProviderModelOptionsFromSelections(
    input.projectModelSelection,
    input.threadModelSelection,
  );
  const draftSelections = input.draft?.modelSelectionByProvider;
  if (!draftSelections) {
    return baseOptions;
  }

  const result: Partial<Record<ProviderKind, ProviderModelOptions[ProviderKind]>> = baseOptions
    ? { ...baseOptions }
    : {};
  for (const [provider, selection] of Object.entries(draftSelections) as Array<
    [ProviderKind, ModelSelection | undefined]
  >) {
    if (!selection) continue;
    if (selection.options) {
      result[provider] = selection.options as any;
    } else {
      delete result[provider];
    }
  }
  return Object.keys(result).length > 0 ? (result as ProviderModelOptions) : null;
}

export function normalizeProviderKind(value: unknown): ProviderKind | null {
  if (typeof value !== "string") {
    return null;
  }
  const coerced = coerceProviderKind(value);
  return isProviderKind(coerced) ? coerced : null;
}

function trimStringOrUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function makeModelSelection(
  provider: ProviderKind,
  model: string,
  options?: ProviderModelOptions[ProviderKind],
  _supportsAutoMode?: boolean,
): ModelSelection {
  return {
    provider,
    model,
    ...(options ? { options: options as any } : {}),
  } as ModelSelection;
}

export function normalizeProviderModelOptions(
  value: unknown,
  _provider?: ProviderKind,
  _legacy?: LegacyCodexFields,
): ProviderModelOptions | null {
  const candidate = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  if (!candidate) {
    return null;
  }
  const result: Partial<Record<ProviderKind, any>> = {};

  for (const provider of COMPOSER_PROVIDER_KINDS) {
    const raw = candidate[provider];
    if (!raw || typeof raw !== "object") continue;
    const obj = raw as Record<string, unknown>;

    if (provider === "engine") {
      const thinkingLevel = trimStringOrUndefined(obj.thinkingLevel);
      if (thinkingLevel) {
        result.engine = { thinkingLevel };
      }
    } else {
      const reasoningEffort = trimStringOrUndefined(obj.reasoningEffort);
      const fastMode = obj.fastMode === true ? true : obj.fastMode === false ? false : undefined;
      const thinking = obj.thinking === true ? true : obj.thinking === false ? false : undefined;
      if (reasoningEffort !== undefined || fastMode !== undefined || thinking !== undefined) {
        result[provider] = {
          ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
          ...(fastMode !== undefined ? { fastMode } : {}),
          ...(thinking !== undefined ? { thinking } : {}),
        };
      }
    }
  }

  return Object.keys(result).length > 0 ? (result as ProviderModelOptions) : null;
}

export function normalizeModelSelection(
  value: unknown,
  legacy?: {
    provider?: unknown;
    model?: unknown;
    modelOptions?: unknown;
    legacyCodex?: LegacyCodexFields;
  },
): ModelSelection | null {
  const candidate = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  const rawProvider = candidate?.provider ?? legacy?.provider;
  const provider = normalizeProviderKind(rawProvider);
  if (provider === null) {
    return null;
  }
  const rawModel = candidate?.model ?? legacy?.model;
  if (typeof rawModel !== "string") {
    return null;
  }
  const model = normalizeModelSlug(rawModel, provider);
  if (!model) {
    return null;
  }
  const modelOptions = normalizeProviderModelOptions(
    candidate?.options ? { [provider]: candidate.options } : legacy?.modelOptions,
    provider,
  );
  const options = (modelOptions as any)?.[provider];
  return makeModelSelection(provider, model, options);
}

export function reconcileProviderScopedModelSelection(
  requested: ModelSelection,
  current: ModelSelection | null | undefined,
): ModelSelection {
  if (requested.options !== undefined || current?.provider !== requested.provider) {
    return requested;
  }
  if (current.model === requested.model) {
    return makeModelSelection(
      requested.provider,
      requested.model,
      current.options,
    );
  }
  return requested;
}

export function stripNonStickyModelOptions(selection: ModelSelection): ModelSelection {
  return selection;
}

export function sanitizeStickyModelSelectionMap(
  map: Partial<Record<ProviderKind, ModelSelection>>,
): Partial<Record<ProviderKind, ModelSelection>> {
  return map;
}

export function legacySyncModelSelectionOptions(
  modelSelection: ModelSelection | null,
  modelOptions: ProviderModelOptions | null | undefined,
): ModelSelection | null {
  if (modelSelection === null) {
    return null;
  }
  const options = modelOptions?.[modelSelection.provider];
  return makeModelSelection(
    modelSelection.provider,
    modelSelection.model,
    options,
  );
}

export function legacyMergeModelSelectionIntoProviderModelOptions(
  modelSelection: ModelSelection | null,
  currentModelOptions: ProviderModelOptions | null | undefined,
): ProviderModelOptions | null {
  if (modelSelection?.options === undefined) {
    return normalizeProviderModelOptions(currentModelOptions);
  }
  return legacyReplaceProviderModelOptions(
    normalizeProviderModelOptions(currentModelOptions),
    modelSelection.provider,
    modelSelection.options,
  );
}

function legacyReplaceProviderModelOptions(
  currentModelOptions: ProviderModelOptions | null | undefined,
  provider: ProviderKind,
  nextProviderOptions: ProviderModelOptions[ProviderKind] | null | undefined,
): ProviderModelOptions | null {
  const { [provider]: _discardedProviderModelOptions, ...otherProviderModelOptions } =
    currentModelOptions ?? {};
  const normalizedNextProviderOptions = normalizeProviderModelOptions(
    { [provider]: nextProviderOptions },
    provider,
  );

  return normalizeProviderModelOptions({
    ...otherProviderModelOptions,
    ...(normalizedNextProviderOptions ? normalizedNextProviderOptions : {}),
  });
}

export function legacyToModelSelectionByProvider(
  modelSelection: ModelSelection | null,
  modelOptions: ProviderModelOptions | null | undefined,
): Partial<Record<ProviderKind, ModelSelection>> {
  const result: Partial<Record<ProviderKind, ModelSelection>> = {};
  // Add entries from the options bag (for non-active providers)
  if (modelOptions) {
    for (const provider of COMPOSER_PROVIDER_KINDS) {
      const options = modelOptions[provider];
      if (options && Object.keys(options).length > 0) {
        const model =
          modelSelection?.provider === provider ? modelSelection.model : getDefaultModel(provider);
        if (model) {
          result[provider] = makeModelSelection(provider, model, options);
        }
      }
    }
  }
  // Add/overwrite the active selection (it's authoritative for its provider)
  if (modelSelection) {
    result[modelSelection.provider] = modelSelection;
  }
  return result;
}

export function deriveEffectiveComposerModelState(input: {
  draft:
    | Pick<ComposerThreadDraftState, "modelSelectionByProvider" | "activeProvider">
    | null
    | undefined;
  selectedProvider: ProviderKind;
  threadModelSelection: ModelSelection | null | undefined;
  projectModelSelection: ModelSelection | null | undefined;
  customModelsByProvider: Record<ProviderKind, readonly string[]>;
  availableModelOptionsByProvider?: Partial<
    Record<ProviderKind, ReadonlyArray<{ slug: string; name: string }>>
  >;
}): EffectiveComposerModelState {
  const resolveAvailableModel = (candidate: string | null | undefined): ModelSlug | null => {
    const availableOptions = input.availableModelOptionsByProvider?.[input.selectedProvider];
    if (!availableOptions || availableOptions.length === 0) {
      return null;
    }
    return resolveSelectableModel(input.selectedProvider, candidate, availableOptions);
  };
  const baseModel = resolveModelSlugForProvider(
    input.selectedProvider,
    (input.threadModelSelection?.provider === input.selectedProvider
      ? input.threadModelSelection.model
      : null) ??
      (input.projectModelSelection?.provider === input.selectedProvider
        ? input.projectModelSelection.model
        : null) ??
      getDefaultModel(input.selectedProvider),
  );
  const persistedThreadModel =
    input.threadModelSelection?.provider === input.selectedProvider
      ? (normalizeModelSlug(input.threadModelSelection.model, input.selectedProvider) ??
        input.threadModelSelection.model)
      : null;
  const persistedProjectModel =
    input.projectModelSelection?.provider === input.selectedProvider
      ? (normalizeModelSlug(input.projectModelSelection.model, input.selectedProvider) ??
        input.projectModelSelection.model)
      : null;
  const activeSelection = input.draft?.modelSelectionByProvider?.[input.selectedProvider];
  const selectedDraftModel = activeSelection?.model
    ? resolveAppModelSelection(
        input.selectedProvider,
        input.customModelsByProvider,
        activeSelection.model,
      )
    : null;
  const unlistedDraftModel = selectedDraftModel;
  const selectedModel =
    resolveAvailableModel(activeSelection?.model) ??
    resolveAvailableModel(
      input.threadModelSelection?.provider === input.selectedProvider
        ? input.threadModelSelection.model
        : null,
    ) ??
    resolveAvailableModel(
      input.projectModelSelection?.provider === input.selectedProvider
        ? input.projectModelSelection.model
        : null,
    ) ??
    resolveAvailableModel(selectedDraftModel) ??
    persistedThreadModel ??
    persistedProjectModel ??
    unlistedDraftModel ??
    input.availableModelOptionsByProvider?.[input.selectedProvider]?.[0]?.slug ??
    baseModel ??
    // Provider-scoped last resort. Never leak another provider's default here:
    // engine-bound threads with no catalog previously resolved to Groq's Llama,
    // which made freshly created apps look like the pick was "reverted".
    getDefaultModel(input.selectedProvider) ??
    "default";
  const modelOptions = deriveEffectiveComposerModelOptions(input);

  return {
    selectedModel,
    modelOptions,
  };
}

export function resolvePreferredComposerModelSelection(input: {
  draft:
    | Pick<ComposerThreadDraftState, "modelSelectionByProvider" | "activeProvider">
    | null
    | undefined;
  threadModelSelection: ModelSelection | null | undefined;
  projectModelSelection: ModelSelection | null | undefined;
  defaultProvider?: ProviderKind | null | undefined;
}): ModelSelection {
  const draftProviderWithSelection =
    COMPOSER_PROVIDER_KINDS.find(
      (provider) => input.draft?.modelSelectionByProvider?.[provider] !== undefined,
    ) ?? null;
  const preferredProvider =
    input.draft?.activeProvider ??
    draftProviderWithSelection ??
    input.threadModelSelection?.provider ??
    input.projectModelSelection?.provider ??
    input.defaultProvider ??
    "groq";

  return (
    input.draft?.modelSelectionByProvider?.[preferredProvider] ??
    (input.threadModelSelection?.provider === preferredProvider
      ? input.threadModelSelection
      : null) ??
    (input.projectModelSelection?.provider === preferredProvider
      ? input.projectModelSelection
      : null) ?? {
      provider: preferredProvider,
      model: getDefaultModel(preferredProvider) ?? "default",
    }
  );
}
