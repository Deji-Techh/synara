import { formatModelDisplayName, humanizeModelSlug, normalizeModelSlug } from "@caide/shared/model";
import {
  PROVIDER_DISPLAY_NAMES,
  type AntigravityModelOptions,
  type AntigravityModelSelection,
  type AnthropicModelSelection,
  type ApiModelOptions,
  type ClaudeModelOptions,
  type ClaudeModelSelection,
  type CodexModelOptions,
  type CodexModelSelection,
  type CursorModelOptions,
  type CursorModelSelection,
  type DroidModelOptions,
  type DroidModelSelection,
  type GoogleModelSelection,
  type GrokModelOptions,
  type GrokModelSelection,
  type EngineModelOptions,
  type KiloModelSelection,
  type ModelSelection,
  type OpenAiModelSelection,
  type OpenCodeModelOptions,
  type OpenCodeModelSelection,
  type OpenRouterModelSelection,
  type OllamaModelSelection,
  type PiModelOptions,
  type PiModelSelection,
  type ProviderKind,
  type ProviderModelOptions,
} from "@caide/contracts";
import { normalizeCursorModelVariantBaseId } from "./cursorModelVariants";

export type ProviderOptions = ProviderModelOptions[ProviderKind];

export interface ProviderModelOption {
  slug: string;
  name: string;
  description?: string;
  upstreamProviderId?: string;
  upstreamProviderName?: string;
}

export interface ProviderModelOptionGroup {
  key: string;
  label: string | null;
  options: ProviderModelOption[];
}

/**
 * Returns the provider provenance shown when a model is detached from its
 * normal upstream-provider group (for example, inside Favourites).
 */
export function providerModelOptionProvenanceLabel(input: {
  provider: ProviderKind;
  option: ProviderModelOption;
}): string {
  const upstreamProviderName = input.option.upstreamProviderName?.trim();
  if (upstreamProviderName) {
    return upstreamProviderName;
  }

  const upstreamProviderId = input.option.upstreamProviderId?.trim();
  if (upstreamProviderId) {
    return humanizeModelSlug(upstreamProviderId);
  }

  const slugProvider = input.option.slug.split("/", 1)[0]?.trim();
  if (input.option.slug.includes("/") && slugProvider) {
    return humanizeModelSlug(slugProvider);
  }

  return PROVIDER_DISPLAY_NAMES[input.provider];
}

export function formatProviderModelOptionName(input: {
  provider: ProviderKind;
  slug: string;
}): string {
  const trimmedSlug =
    input.provider === "openai" ? input.slug.trim().replace(/\[[^\]]*\]$/u, "") : input.slug.trim();
  if (trimmedSlug.length === 0) {
    return trimmedSlug;
  }

  if (input.provider === "openai" || input.provider === "openai" || input.provider === "openai") {
    const modelIdentifier = trimmedSlug.includes("/")
      ? trimmedSlug.slice(trimmedSlug.lastIndexOf("/") + 1)
      : trimmedSlug;
    return formatModelDisplayName(modelIdentifier) ?? humanizeModelSlug(modelIdentifier);
  }

  return formatModelDisplayName(trimmedSlug) ?? trimmedSlug;
}

function normalizeDynamicModelSlug(provider: ProviderKind, slug: string): string {
  if (provider === "anthropic") {
    const withoutContextSuffix = slug.replace(/\[[^\]]+\]$/u, "");
    return normalizeModelSlug(withoutContextSuffix, provider) ?? withoutContextSuffix;
  }
  if (provider === "openai") {
    return slug.trim();
  }
  if (provider === "openai") {
    return normalizeCursorModelVariantBaseId(slug) ?? slug.trim();
  }
  return normalizeModelSlug(slug, provider) ?? slug;
}

/**
 * Folds runtime-discovered models into the static option list for a provider:
 * discovered models lead (with display names recovered from the static list when
 * possible), static built-ins fill gaps unless discovery fully owns the catalog
 * (antigravity/kilo/opencode/cursor), and user-defined custom models always survive.
 */
export function mergeDynamicModelOptions(input: {
  provider: ProviderKind;
  staticOptions: ReadonlyArray<ProviderModelOption & { isCustom?: boolean }>;
  dynamicModels: ReadonlyArray<{
    slug: string;
    name?: string | null | undefined;
    description?: string | null | undefined;
    upstreamProviderId?: string | null | undefined;
    upstreamProviderName?: string | null | undefined;
  }>;
}): ReadonlyArray<ProviderModelOption & { isCustom?: boolean }> {
  const staticNameBySlug = new Map(input.staticOptions.map((model) => [model.slug, model.name]));
  const dynamicNormalizedSlugs = new Set<string>();
  const normalizedDynamicOptions: ProviderModelOption[] = [];

  for (const dynamicModel of input.dynamicModels) {
    const rawName = dynamicModel.name?.trim() ?? "";
    const isClaudeDefaultAlias =
      input.provider === "anthropic" &&
      (rawName.toLowerCase() === "default (recommended)" ||
        rawName.toLowerCase() === "default recommended" ||
        dynamicModel.slug.trim().toLowerCase() === "default");
    if (isClaudeDefaultAlias) {
      continue;
    }

    const normalizedSlug = normalizeDynamicModelSlug(input.provider, dynamicModel.slug);
    const rawSlug = dynamicModel.slug.trim().toLowerCase();
    const displayNameFallback = formatProviderModelOptionName({
      provider: input.provider,
      slug: normalizedSlug,
    });
    if (dynamicNormalizedSlugs.has(normalizedSlug)) {
      continue;
    }
    dynamicNormalizedSlugs.add(normalizedSlug);
    normalizedDynamicOptions.push({
      slug: normalizedSlug,
      name:
        staticNameBySlug.get(normalizedSlug) ??
        (rawName.length > 0 &&
        rawName.toLowerCase() !== rawSlug &&
        rawName.toLowerCase() !== normalizedSlug.toLowerCase()
          ? rawName
          : displayNameFallback),
      ...(dynamicModel.description?.trim() ? { description: dynamicModel.description.trim() } : {}),
      ...(dynamicModel.upstreamProviderId?.trim()
        ? { upstreamProviderId: dynamicModel.upstreamProviderId.trim() }
        : {}),
      ...(dynamicModel.upstreamProviderName?.trim()
        ? { upstreamProviderName: dynamicModel.upstreamProviderName.trim() }
        : {}),
    });
  }

  // Droid validates model values against its live ACP select options, so an
  // arbitrary custom slug is guaranteed to fail at session configuration.
  const customOnlyModels =
    input.provider === "openai"
      ? []
      : input.staticOptions.filter(
          (model) =>
            "isCustom" in model &&
            model.isCustom &&
            !dynamicNormalizedSlugs.has(normalizeDynamicModelSlug(input.provider, model.slug)),
        );
  const staticBuiltInModels = input.staticOptions.filter(
    (model) => !("isCustom" in model) || model.isCustom !== true,
  );
  const missingStaticBuiltIns =
    (input.provider === "google" ||
      input.provider === "openai" ||
      input.provider === "openai" ||
      input.provider === "openai" ||
      input.provider === "openai") &&
    normalizedDynamicOptions.length > 0
      ? []
      : staticBuiltInModels.filter((model) => !dynamicNormalizedSlugs.has(model.slug));

  const orderedDynamicOptions =
    input.provider === "anthropic"
      ? normalizedDynamicOptions.toReversed()
      : normalizedDynamicOptions;

  return [...orderedDynamicOptions, ...missingStaticBuiltIns, ...customOnlyModels];
}

/** Returns a compact label for provider descriptions that begin with an `Nx` cost multiplier. */
export function providerModelCostMultiplierLabel(description?: string): string | null {
  const multiplier = description?.trim().match(/^(\d+(?:\.\d+)?)x(?:\s|$)/i)?.[1];
  return multiplier ? `${multiplier}×` : null;
}

export function groupProviderModelOptions(
  options: ReadonlyArray<ProviderModelOption>,
): ProviderModelOptionGroup[] {
  const groupedOptions: ProviderModelOptionGroup[] = [];
  const groupIndexByKey = new Map<string, number>();

  for (const option of options) {
    const upstreamProviderId = option.upstreamProviderId?.trim();
    const upstreamProviderName = option.upstreamProviderName?.trim();
    const groupLabel =
      upstreamProviderName && upstreamProviderName.length > 0
        ? upstreamProviderName
        : upstreamProviderId && upstreamProviderId.length > 0
          ? upstreamProviderId
          : null;
    const groupKey = groupLabel
      ? `${(upstreamProviderId ?? groupLabel).trim().toLowerCase()}`
      : "__ungrouped__";
    const existingIndex = groupIndexByKey.get(groupKey);

    if (existingIndex !== undefined) {
      groupedOptions[existingIndex]!.options.push(option);
      continue;
    }

    groupIndexByKey.set(groupKey, groupedOptions.length);
    groupedOptions.push({
      key: groupKey,
      label: groupLabel,
      options: [option],
    });
  }

  return groupedOptions;
}

export function groupProviderModelOptionsWithFavorites(input: {
  options: ReadonlyArray<ProviderModelOption>;
  favoriteSlugs: ReadonlySet<string>;
  favoriteLabel?: string;
}): ProviderModelOptionGroup[] {
  if (input.favoriteSlugs.size === 0) {
    return groupProviderModelOptions(input.options);
  }

  const favoriteOptions = input.options.filter((option) => input.favoriteSlugs.has(option.slug));
  if (favoriteOptions.length === 0) {
    return groupProviderModelOptions(input.options);
  }
  const groupedOptions = groupProviderModelOptions(
    input.options.filter((option) => !input.favoriteSlugs.has(option.slug)),
  );

  return [
    {
      key: "__favorites__",
      label: input.favoriteLabel ?? "Favourites",
      options: favoriteOptions,
    },
    ...groupedOptions,
  ];
}

/** Long grouped model lists collapse provider sections to keep submenus scannable. */
export const COLLAPSIBLE_MODEL_GROUP_THRESHOLD = 3;

export function shouldUseCollapsibleModelGroups(groupCount: number, isSearching: boolean): boolean {
  return groupCount >= COLLAPSIBLE_MODEL_GROUP_THRESHOLD && !isSearching;
}

export function resolveModelGroupDefaultOpen(input: {
  groupKey: string;
  options: ReadonlyArray<ProviderModelOption>;
  activeModel: string;
  groupCount: number;
}): boolean {
  if (input.groupCount < COLLAPSIBLE_MODEL_GROUP_THRESHOLD) {
    return true;
  }
  if (input.groupKey === "__favorites__") {
    return true;
  }
  return input.options.some((option) => option.slug === input.activeModel);
}

export function buildNextProviderOptions(
  provider: ProviderKind,
  modelOptions: ProviderOptions | null | undefined,
  patch: Record<string, unknown>,
): ProviderOptions {
  if (provider === "openai") {
    return { ...(modelOptions as CodexModelOptions | undefined), ...patch } as CodexModelOptions;
  }
  if (provider === "anthropic") {
    return { ...(modelOptions as ClaudeModelOptions | undefined), ...patch } as ClaudeModelOptions;
  }
  if (provider === "openai") {
    return { ...(modelOptions as CursorModelOptions | undefined), ...patch } as CursorModelOptions;
  }
  if (provider === "google") {
    return {
      ...(modelOptions as AntigravityModelOptions | undefined),
      ...patch,
    } as AntigravityModelOptions;
  }
  if (provider === "openai") {
    return {
      ...(modelOptions as GrokModelOptions | undefined),
      ...patch,
    } as GrokModelOptions;
  }
  if (provider === "openai") {
    return {
      ...(modelOptions as DroidModelOptions | undefined),
      ...patch,
    } as DroidModelOptions;
  }
  if (provider === "openai") {
    return {
      ...(modelOptions as OpenCodeModelOptions | undefined),
      ...patch,
    } as OpenCodeModelOptions;
  }
  return {
    ...(modelOptions as PiModelOptions | undefined),
    ...patch,
  } as PiModelOptions;
}

export function buildProviderOptionPatch(
  provider: ProviderKind,
  optionId: string,
  value: string | boolean,
): Record<string, unknown> {
  return { [optionId]: value };
}

export function buildModelSelection(
  provider: "openai",
  model: string,
  options?: CodexModelOptions | null | undefined,
): CodexModelSelection;
export function buildModelSelection(
  provider: "anthropic",
  model: string,
  options?: ClaudeModelOptions | null | undefined,
  supportsAutoMode?: boolean | undefined,
): ClaudeModelSelection;
export function buildModelSelection(
  provider: "openai",
  model: string,
  options?: CursorModelOptions | null | undefined,
): CursorModelSelection;
export function buildModelSelection(
  provider: "google",
  model: string,
  options?: AntigravityModelOptions | null | undefined,
): AntigravityModelSelection;
export function buildModelSelection(
  provider: "openai",
  model: string,
  options?: GrokModelOptions | null | undefined,
): GrokModelSelection;
export function buildModelSelection(
  provider: "openai",
  model: string,
  options?: DroidModelOptions | null | undefined,
): DroidModelSelection;
export function buildModelSelection(
  provider: "openai",
  model: string,
  options?: OpenCodeModelOptions | null | undefined,
): OpenCodeModelSelection;
export function buildModelSelection(
  provider: "openai",
  model: string,
  options?: OpenCodeModelOptions | null | undefined,
): KiloModelSelection;
export function buildModelSelection(
  provider: "openai",
  model: string,
  options?: PiModelOptions | null | undefined,
): PiModelSelection;
export function buildModelSelection(
  provider: "openai",
  model: string,
  options?: ApiModelOptions | null | undefined,
): OpenAiModelSelection;
export function buildModelSelection(
  provider: "anthropic",
  model: string,
  options?: ApiModelOptions | null | undefined,
): AnthropicModelSelection;
export function buildModelSelection(
  provider: "google",
  model: string,
  options?: ApiModelOptions | null | undefined,
): GoogleModelSelection;
export function buildModelSelection(
  provider: "openrouter",
  model: string,
  options?: ApiModelOptions | null | undefined,
): OpenRouterModelSelection;
export function buildModelSelection(
  provider: "ollama",
  model: string,
  options?: ApiModelOptions | null | undefined,
): OllamaModelSelection;
export function buildModelSelection(
  provider: ProviderKind,
  model: string,
  options?: ProviderOptions | null | undefined,
  supportsAutoMode?: boolean | undefined,
): ModelSelection;
export function buildModelSelection(
  provider: ProviderKind,
  model: string,
  options?: ProviderOptions | null | undefined,
  supportsAutoMode?: boolean | undefined,
): ModelSelection {
  switch (provider) {
    case "google":
      return options
        ? {
            provider,
            model,
            options: options as AntigravityModelOptions,
          }
        : { provider, model };
    case "openai":
      return options
        ? {
            provider,
            model,
            options: options as CodexModelOptions,
          }
        : { provider, model };
    case "anthropic":
      return {
        provider,
        model,
        ...(options ? { options: options as ClaudeModelOptions } : {}),
        ...(typeof supportsAutoMode === "boolean" ? { supportsAutoMode } : {}),
      };
    case "openai":
      return options
        ? {
            provider,
            model,
            options: options as CursorModelOptions,
          }
        : { provider, model };
    case "openai":
      return options
        ? {
            provider,
            model,
            options: options as GrokModelOptions,
          }
        : { provider, model };
    case "openai":
      return options
        ? {
            provider,
            model,
            options: options as DroidModelOptions,
          }
        : { provider, model };
    case "openai":
      return options
        ? {
            provider,
            model,
            options: options as OpenCodeModelOptions,
          }
        : { provider, model };
    case "openai":
      return options
        ? {
            provider,
            model,
            options: options as OpenCodeModelOptions,
          }
        : { provider, model };
    case "engine":
      return options
        ? {
            provider,
            model,
            options: options as EngineModelOptions,
          }
        : { provider, model };
    case "openai":
      return options
        ? {
            provider,
            model,
            options: options as PiModelOptions,
          }
        : { provider, model };
    case "openai":
    case "anthropic":
    case "google":
    case "openrouter":
    case "ollama":
    case "deepseek":
    case "groq":
    case "mistral":
    case "together":
    case "cohere":
    case "xai":
    case "fireworks":
    case "opencodeZen":
      return options
        ? {
            provider,
            model,
            options: options as ApiModelOptions,
          }
        : { provider, model };
  }
}
