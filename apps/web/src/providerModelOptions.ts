import { formatModelDisplayName, humanizeModelSlug, normalizeModelSlug } from "@caide/shared/model";
import {
  PROVIDER_DISPLAY_NAMES,
  type ApiModelOptions,
  type EngineModelOptions,
  type ModelSelection,
  type ProviderKind,
  type ProviderModelOptions,
} from "@caide/contracts";

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
  const trimmedSlug = input.slug.trim();
  if (trimmedSlug.length === 0) {
    return trimmedSlug;
  }
  return formatModelDisplayName(trimmedSlug) ?? humanizeModelSlug(trimmedSlug);
}

function normalizeDynamicModelSlug(provider: ProviderKind, slug: string): string {
  return normalizeModelSlug(slug, provider) ?? slug.trim();
}

/**
 * Folds runtime-discovered models into the static option list for a provider:
 * discovered models lead (with display names recovered from the static list when
 * possible), static built-ins fill gaps, and user-defined custom models always survive.
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

  const customOnlyModels = input.staticOptions.filter(
    (model) =>
      "isCustom" in model &&
      (model as any).isCustom &&
      !dynamicNormalizedSlugs.has(normalizeDynamicModelSlug(input.provider, model.slug)),
  );
  const staticBuiltInModels = input.staticOptions.filter(
    (model) => !("isCustom" in model) || (model as any).isCustom !== true,
  );
  const missingStaticBuiltIns = staticBuiltInModels.filter(
    (model) => !dynamicNormalizedSlugs.has(model.slug),
  );

  const orderedDynamicOptions = normalizedDynamicOptions;

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
  if (provider === "engine") {
    return { ...(modelOptions as EngineModelOptions | undefined), ...patch } as EngineModelOptions;
  }
  return { ...(modelOptions as ApiModelOptions | undefined), ...patch } as ApiModelOptions;
}

export function buildProviderOptionPatch(
  provider: ProviderKind,
  optionId: string,
  value: string | boolean,
): Record<string, unknown> {
  return { [optionId]: value };
}

export function buildModelSelection(
  provider: ProviderKind,
  model: string,
  options?: ProviderOptions | null | undefined,
): ModelSelection {
  if (provider === "engine") {
    return options
      ? {
          provider,
          model,
          options: options as EngineModelOptions,
        }
      : { provider, model };
  }
  return options
    ? {
        provider,
        model,
        options: options as ApiModelOptions,
      }
    : { provider, model };
}
