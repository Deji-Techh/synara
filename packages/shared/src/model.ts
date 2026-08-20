// @ts-nocheck
import {
  DEFAULT_MODEL_BY_PROVIDER,
  MODEL_CAPABILITIES_INDEX,
  MODEL_OPTIONS_BY_PROVIDER,
  MODEL_SLUG_ALIASES_BY_PROVIDER,
  type AntigravityModelOptions,
  type ClaudeApiEffort,
  type ClaudeModelOptions,
  type ClaudeCodeEffort,
  type CodexModelOptions,
  type GrokModelOptions,
  type GrokReasoningEffort,
  type ModelCapabilities,
  type ModelSelection,
  type ModelSlug,
  type OpenCodeModelOptions,
  type ProviderOptionDescriptor,
  type ProviderOptionSelection,
  type PiModelOptions,
  type PiThinkingLevel,
  type ProviderKind,
  type ProviderWithDefaultModel,
  CodexReasoningEffort,
} from "@caide/contracts";

// Legacy CLI providers removed from ProviderKind (013) — tests and persisted
// data still reference them. Coerce to the API provider that now serves them.
const LEGACY_PROVIDER_MAP: Record<string, ProviderKind> = {
  codex: "openai",
  claudeAgent: "anthropic",
  claudeCode: "anthropic",
  claude: "anthropic",
  antigravity: "google",
  gemini: "google",
  grok: "xai",
  droid: "openai",
  pi: "openai",
  cursor: "openai",
  opencode: "openai",
  kilo: "openai",
};

function coerceProviderKind(provider: string): ProviderKind {
  return (LEGACY_PROVIDER_MAP[provider] ?? provider) as ProviderKind;
}

const MODEL_SLUG_SET_BY_PROVIDER: Record<ProviderKind, ReadonlySet<ModelSlug>> = {
  engine: new Set<ModelSlug>(),
  openai: new Set(
    (
      MODEL_OPTIONS_BY_PROVIDER as unknown as Record<
        string,
        readonly { slug: string }[] | undefined
      >
    ).openai?.map((option) => option.slug) ?? [],
  ),
  anthropic: new Set(
    (
      MODEL_OPTIONS_BY_PROVIDER as unknown as Record<
        string,
        readonly { slug: string }[] | undefined
      >
    ).anthropic?.map((option) => option.slug) ?? [],
  ),
  google: new Set(
    (
      MODEL_OPTIONS_BY_PROVIDER as unknown as Record<
        string,
        readonly { slug: string }[] | undefined
      >
    ).google?.map((option) => option.slug) ?? [],
  ),
  openrouter: new Set(
    (
      MODEL_OPTIONS_BY_PROVIDER as unknown as Record<
        string,
        readonly { slug: string }[] | undefined
      >
    ).openrouter?.map((option) => option.slug) ?? [],
  ),
  ollama: new Set<ModelSlug>(),
  deepseek: new Set<ModelSlug>(),
  groq: new Set<ModelSlug>(),
  mistral: new Set<ModelSlug>(),
  together: new Set<ModelSlug>(),
  cohere: new Set<ModelSlug>(),
  xai: new Set<ModelSlug>(),
  fireworks: new Set<ModelSlug>(),
  opencodeZen: new Set(
    (
      MODEL_OPTIONS_BY_PROVIDER as unknown as Record<
        string,
        readonly { slug: string }[] | undefined
      >
    ).opencodeZen?.map((option) => option.slug) ?? [],
  ),
  opencodeGo: new Set(
    (
      MODEL_OPTIONS_BY_PROVIDER as unknown as Record<
        string,
        readonly { slug: string }[] | undefined
      >
    ).opencodeGo?.map((option) => option.slug) ?? [],
  ),
};

export interface SelectableModelOption {
  slug: string;
  name: string;
}

const PI_THINKING_LEVEL_SET = new Set<PiThinkingLevel>([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);
export const EMPTY_MODEL_CAPABILITIES: ModelCapabilities = {
  reasoningEffortLevels: [],
  supportsFastMode: false,
  supportsThinkingToggle: false,
  promptInjectedEffortLevels: [],
  contextWindowOptions: [],
};
export function getModelOptions(provider: ProviderKind = "openai") {
  return MODEL_OPTIONS_BY_PROVIDER[provider];
}

function hasDefaultModel(provider: ProviderKind): provider is ProviderWithDefaultModel {
  return provider !== "engine";
}

export function getDefaultModel(provider: "engine"): null;
export function getDefaultModel(provider?: ProviderWithDefaultModel): ModelSlug;
export function getDefaultModel(provider: ProviderKind): ModelSlug | null;
export function getDefaultModel(provider: ProviderKind = "openai"): ModelSlug | null {
  return hasDefaultModel(provider)
    ? DEFAULT_MODEL_BY_PROVIDER[provider as ProviderWithDefaultModel]
    : null;
}

const MODEL_NAME_BY_SLUG = new Map(
  Object.values(MODEL_OPTIONS_BY_PROVIDER)
    .flat()
    .map((option) => [option.slug.toLowerCase(), option.name] as const),
);

// Turns a raw model slug into a readable label when no built-in name exists.
// GPT slugs keep their canonical "GPT-x" casing; provider-scoped custom ids
// ("vendor/model") stay verbatim; everything else is title-cased on -/_ .
export function humanizeModelSlug(slug: string): string {
  if (slug.toLowerCase().startsWith("gpt-")) {
    const [, version, ...rest] = slug.split("-");
    if (rest.length === 0) return `GPT-${version}`;
    return `GPT-${version} ${rest.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ")}`;
  }
  if (slug.includes("/")) {
    return slug;
  }
  return slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatModelDisplayName(model: string | null | undefined): string | undefined {
  const normalized = trimOrNull(model);
  if (!normalized) {
    return undefined;
  }

  return MODEL_NAME_BY_SLUG.get(normalized.toLowerCase()) ?? humanizeModelSlug(normalized);
}

// ── Effort helpers ────────────────────────────────────────────────────

export function parseCursorCliReasoningEffort(model: string): string | undefined {
  const tokens = model.trim().toLowerCase().split("-");
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    if (!token) {
      continue;
    }
    if (token === "xhigh") {
      return "xhigh";
    }
    if (token === "high" && tokens[index - 1] === "extra") {
      return "xhigh";
    }
    if (
      token === "max" ||
      token === "none" ||
      token === "low" ||
      token === "medium" ||
      token === "high"
    ) {
      return token;
    }
  }
  return undefined;
}

/** Check whether a capabilities object includes a given effort value. */
export function hasEffortLevel(caps: ModelCapabilities, value: string): boolean {
  return caps.reasoningEffortLevels.some((l) => l.value === value);
}

/** Return the default effort value for a capabilities object, or null if none. */
export function getDefaultEffort(caps: ModelCapabilities): string | null {
  return caps.reasoningEffortLevels.find((l) => l.isDefault)?.value ?? null;
}

/** Check whether a capabilities object includes a given context window value. */
export function hasContextWindowOption(caps: ModelCapabilities, value: string): boolean {
  return caps.contextWindowOptions.some((option) => option.value === value);
}

/** Return the default context window value for a capabilities object, or null if none. */
export function getDefaultContextWindow(caps: ModelCapabilities): string | null {
  return caps.contextWindowOptions.find((option) => option.isDefault)?.value ?? null;
}

/** Check whether a Claude auto-compaction budget is supported. */
export function hasAutoCompactWindowOption(caps: ModelCapabilities, value: string): boolean {
  return caps.autoCompactWindowOptions?.some((option) => option.value === value) ?? false;
}

/** Return the default Claude auto-compaction budget, or null if the model has no override. */
export function getDefaultAutoCompactWindow(caps: ModelCapabilities): string | null {
  return caps.autoCompactWindowOptions?.find((option) => option.isDefault)?.value ?? null;
}

export function resolveLabeledOptionValue(
  options: ReadonlyArray<{ value: string; isDefault?: boolean | undefined }> | undefined,
  rawValue: string | null | undefined,
): string | null {
  const trimmedValue = trimOrNull(rawValue);
  if (!options || options.length === 0) {
    return trimmedValue;
  }
  if (trimmedValue && options.some((option) => option.value === trimmedValue)) {
    return trimmedValue;
  }
  return options.find((option) => option.isDefault)?.value ?? options[0]?.value ?? null;
}

type ProviderOptionSelectionsInput =
  | ReadonlyArray<ProviderOptionSelection>
  | Record<string, unknown>
  | null
  | undefined;

function cloneProviderOptionDescriptor(
  descriptor: ProviderOptionDescriptor,
): ProviderOptionDescriptor {
  if (descriptor.type === "select") {
    return {
      ...descriptor,
      options: descriptor.options.map((option) => ({ ...option })),
      ...(descriptor.promptInjectedValues
        ? { promptInjectedValues: [...descriptor.promptInjectedValues] }
        : {}),
    };
  }
  return { ...descriptor };
}

function providerOptionSelectionValue(
  selections: ProviderOptionSelectionsInput,
  id: string,
): string | boolean | undefined {
  if (!selections) {
    return undefined;
  }
  if (Array.isArray(selections)) {
    return selections.find((selection) => selection.id === id)?.value;
  }
  const selectionRecord = selections as Record<string, unknown>;
  const value = selectionRecord[id];
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return typeof value === "string" || typeof value === "boolean" ? value : undefined;
}

export function getProviderOptionBooleanSelectionValue(
  selections: ProviderOptionSelectionsInput,
  id: string,
): boolean | undefined {
  const value = providerOptionSelectionValue(selections, id);
  return typeof value === "boolean" ? value : undefined;
}

export function getModelSelectionOptionValue(
  modelSelection: ModelSelection | null | undefined,
  id: string,
): string | boolean | undefined {
  return providerOptionSelectionValue(modelSelection?.options as ProviderOptionSelectionsInput, id);
}

export function getModelSelectionStringOptionValue(
  modelSelection: ModelSelection | null | undefined,
  id: string,
): string | undefined {
  const value = providerOptionSelectionValue(
    modelSelection?.options as ProviderOptionSelectionsInput,
    id,
  );
  return typeof value === "string" ? value : undefined;
}

export function getModelSelectionBooleanOptionValue(
  modelSelection: ModelSelection | null | undefined,
  id: string,
): boolean | undefined {
  return getProviderOptionBooleanSelectionValue(
    modelSelection?.options as ProviderOptionSelectionsInput,
    id,
  );
}

function resolveDescriptorChoiceValue(
  descriptor: Extract<ProviderOptionDescriptor, { type: "select" }>,
  rawValue: string | null | undefined,
): string | undefined {
  const trimmed = trimOrNull(rawValue);
  if (trimmed && descriptor.options.some((option) => option.id === trimmed)) {
    return trimmed;
  }
  return descriptor.currentValue ?? descriptor.options.find((option) => option.isDefault)?.id;
}

function withProviderOptionCurrentValue(
  descriptor: ProviderOptionDescriptor,
  rawValue: string | boolean | undefined,
): ProviderOptionDescriptor {
  if (descriptor.type === "boolean") {
    return typeof rawValue === "boolean" ? { ...descriptor, currentValue: rawValue } : descriptor;
  }
  const currentValue =
    typeof rawValue === "string"
      ? resolveDescriptorChoiceValue(descriptor, rawValue)
      : resolveDescriptorChoiceValue(descriptor, descriptor.currentValue);
  if (!currentValue) {
    const { currentValue: _currentValue, ...rest } = descriptor;
    return rest;
  }
  return { ...descriptor, currentValue };
}

function reasoningDescriptorId(_provider: ProviderKind): string {
  return "reasoningEffort";
}

function legacyCapabilityDescriptors(
  _provider: ProviderKind,
  caps: ModelCapabilities,
): ProviderOptionDescriptor[] {
  const primaryOptions = caps.reasoningEffortLevels;
  const descriptors: ProviderOptionDescriptor[] = [];
  if (primaryOptions.length > 0) {
    const defaultPrimaryOption = primaryOptions.find((option) => option.isDefault);
    descriptors.push({
      id: reasoningDescriptorId(_provider),
      label: "Reasoning",
      type: "select",
      options: primaryOptions.map((option) => ({
        id: option.value,
        label: option.label,
        ...(option.description ? { description: option.description } : {}),
        ...(option.isDefault ? { isDefault: true as const } : {}),
      })),
      ...(defaultPrimaryOption ? { currentValue: defaultPrimaryOption.value } : {}),
      ...(caps.promptInjectedEffortLevels.length > 0
        ? { promptInjectedValues: [...caps.promptInjectedEffortLevels] }
        : {}),
    });
  }
  if (caps.contextWindowOptions.length > 0) {
    const defaultContextWindowOption = caps.contextWindowOptions.find((option) => option.isDefault);
    descriptors.push({
      id: "contextWindow",
      label: "Context Window",
      type: "select",
      options: caps.contextWindowOptions.map((option) => ({
        id: option.value,
        label: option.label,
        ...(option.isDefault ? { isDefault: true as const } : {}),
      })),
      ...(defaultContextWindowOption ? { currentValue: defaultContextWindowOption.value } : {}),
    });
  }
  if (caps.autoCompactWindowOptions && caps.autoCompactWindowOptions.length > 0) {
    const defaultOption = caps.autoCompactWindowOptions.find((option) => option.isDefault);
    descriptors.push({
      id: "autoCompactWindow",
      label: "Auto-compact",
      type: "select",
      options: caps.autoCompactWindowOptions.map((option) => ({
        id: option.value,
        label: option.label,
        ...(option.isDefault ? { isDefault: true as const } : {}),
      })),
      ...(defaultOption ? { currentValue: defaultOption.value } : {}),
    });
  }
  if (caps.supportsFastMode) {
    descriptors.push({ id: "fastMode", label: "Fast Mode", type: "boolean" });
  }
  if (caps.supportsThinkingToggle) {
    descriptors.push({ id: "thinking", label: "Thinking", type: "boolean", currentValue: true });
  }
  return descriptors;
}

export function getProviderOptionDescriptors(input: {
  provider: ProviderKind;
  caps: ModelCapabilities;
  selections?: ProviderOptionSelectionsInput;
}): ReadonlyArray<ProviderOptionDescriptor> {
  const descriptors =
    input.caps.optionDescriptors?.map(cloneProviderOptionDescriptor) ??
    legacyCapabilityDescriptors(input.provider, input.caps);
  return descriptors.map((descriptor) =>
    withProviderOptionCurrentValue(
      descriptor,
      providerOptionSelectionValue(input.selections, descriptor.id),
    ),
  );
}

export function getProviderOptionCurrentValue(
  descriptor: ProviderOptionDescriptor | null | undefined,
): string | boolean | undefined {
  if (!descriptor) {
    return undefined;
  }
  if (descriptor.type === "boolean") {
    return descriptor.currentValue;
  }
  return descriptor.currentValue ?? descriptor.options.find((option) => option.isDefault)?.id;
}

export function getProviderOptionCurrentLabel(
  descriptor: ProviderOptionDescriptor | null | undefined,
): string | undefined {
  const value = getProviderOptionCurrentValue(descriptor);
  if (!descriptor) {
    return undefined;
  }
  if (descriptor.type === "boolean") {
    return typeof value === "boolean" ? (value ? "On" : "Off") : undefined;
  }
  return typeof value === "string"
    ? descriptor.options.find((option) => option.id === value)?.label
    : undefined;
}

export function buildProviderOptionSelectionsFromDescriptors(
  descriptors: ReadonlyArray<ProviderOptionDescriptor> | null | undefined,
): ProviderOptionSelection[] | undefined {
  if (!descriptors || descriptors.length === 0) {
    return undefined;
  }
  const selections = descriptors.flatMap((descriptor) => {
    const value = getProviderOptionCurrentValue(descriptor);
    return typeof value === "string" || typeof value === "boolean"
      ? [{ id: descriptor.id, value }]
      : [];
  });
  return selections.length > 0 ? selections : undefined;
}

// ── Data-driven capability resolver ───────────────────────────────────

export function getModelCapabilities(
  provider: ProviderKind | string,
  model: string | null | undefined,
): ModelCapabilities {
  const coerced = coerceProviderKind(String(provider));
  const slug = normalizeModelSlug(model, coerced as ProviderKind);
  if (slug) {
    const caps = (MODEL_CAPABILITIES_INDEX as Record<string, Record<string, ModelCapabilities>>)[
      coerced
    ]?.[slug];
    if (caps) return caps;
  }
  if (((coerced as string) === "grok" || coerced === "xai") && slug) {
    // Grok exposes reasoning effort as a provider-level CLI option, while its
    // runtime model catalog contains only model ids. New models must inherit the
    // provider ladder even before runtime discovery has returned their descriptor.
    // Legacy "grok" maps to "xai".
    const grokIndex =
      (MODEL_CAPABILITIES_INDEX as Record<string, Record<string, ModelCapabilities>>).grok ??
      (MODEL_CAPABILITIES_INDEX as Record<string, Record<string, ModelCapabilities>>).xai;
    if (grokIndex && slug) {
      return grokIndex["grok-build"] ?? EMPTY_MODEL_CAPABILITIES;
    }
  }
  // Legacy shims: codex/droid -> openai, claudeAgent -> anthropic
  // For the test harness the static MODEL_OPTIONS_BY_PROVIDER for those legacy
  // names is empty, so fall back to the coerced provider's index.
  return EMPTY_MODEL_CAPABILITIES;
}

export function isClaudeUltrathinkPrompt(text: string | null | undefined): boolean {
  return typeof text === "string" && /\bultrathink\b/i.test(text);
}

export function normalizeModelSlug(
  model: string | null | undefined,
  provider: ProviderKind | string = "openai",
): ModelSlug | null {
  if (typeof model !== "string") {
    return null;
  }

  const trimmed = model.trim();
  if (!trimmed) {
    return null;
  }

  const coerced = coerceProviderKind(String(provider));
  const providerScopedModel =
    coerced === "anthropic" ? trimmed.replace(/\[[^\]]+\]$/u, "") : trimmed;
  const aliases =
    (MODEL_SLUG_ALIASES_BY_PROVIDER as Record<string, Record<string, ModelSlug>>)[coerced] ?? {};
  const aliased = Object.prototype.hasOwnProperty.call(aliases, providerScopedModel)
    ? aliases[providerScopedModel]
    : undefined;
  return typeof aliased === "string" ? aliased : (providerScopedModel as ModelSlug);
}

export function resolveSelectableModel(
  provider: ProviderKind,
  value: string | null | undefined,
  options: ReadonlyArray<SelectableModelOption>,
): ModelSlug | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const direct = options.find((option) => option.slug === trimmed);
  if (direct) {
    return direct.slug;
  }

  const byName = options.find((option) => option.name.toLowerCase() === trimmed.toLowerCase());
  if (byName) {
    return byName.slug;
  }

  const normalized = normalizeModelSlug(trimmed, provider);
  if (!normalized) {
    return null;
  }

  const resolved = options.find((option) => option.slug === normalized);
  return resolved ? resolved.slug : null;
}

export function resolveModelSlug(
  model: string | null | undefined,
  provider: ProviderKind | string = "openai",
): ModelSlug | null {
  const coerced = coerceProviderKind(String(provider)) as ProviderKind;
  const normalized = normalizeModelSlug(model, coerced);
  if (coerced === "engine") {
    return normalized;
  }
  if (!normalized) {
    return (DEFAULT_MODEL_BY_PROVIDER as Record<string, ModelSlug>)[coerced] ?? null;
  }

  return (MODEL_SLUG_SET_BY_PROVIDER as Record<string, ReadonlySet<ModelSlug>>)[coerced]?.has(
    normalized,
  )
    ? normalized
    : ((DEFAULT_MODEL_BY_PROVIDER as Record<string, ModelSlug>)[coerced] ?? null);
}

export function resolveModelSlugForProvider(
  provider: ProviderKind,
  model: string | null | undefined,
): ModelSlug | null {
  return resolveModelSlug(model, provider);
}

/** Trim a string, returning null for empty/missing values. */
export function trimOrNull<T extends string>(value: T | null | undefined): T | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim() as T;
  return trimmed || null;
}

export function normalizeCodexModelOptions(
  model: string | null | undefined,
  modelOptions: CodexModelOptions | null | undefined,
): CodexModelOptions | undefined {
  const caps = getModelCapabilities("openai", model);
  const defaultReasoningEffort = getDefaultEffort(caps) as CodexReasoningEffort;
  const reasoningEffort = trimOrNull(modelOptions?.reasoningEffort) ?? defaultReasoningEffort;
  const fastModeEnabled = modelOptions?.fastMode === true;
  const nextOptions: CodexModelOptions = {
    ...(reasoningEffort !== defaultReasoningEffort ? { reasoningEffort } : {}),
    ...(fastModeEnabled ? { fastMode: true } : {}),
  };
  return Object.keys(nextOptions).length > 0 ? nextOptions : undefined;
}

export function normalizeClaudeModelOptions(
  model: string | null | undefined,
  modelOptions: ClaudeModelOptions | null | undefined,
): ClaudeModelOptions | undefined {
  const caps = getModelCapabilities("anthropic", model);
  const defaultReasoningEffort = getDefaultEffort(caps);
  const defaultAutoCompactWindow = getDefaultAutoCompactWindow(caps);
  const resolvedEffort = trimOrNull(modelOptions?.effort);
  const resolvedAutoCompactWindow =
    trimOrNull(modelOptions?.autoCompactWindow) ?? trimOrNull(modelOptions?.contextWindow);
  const isPromptInjected = caps.promptInjectedEffortLevels.includes(resolvedEffort ?? "");
  const effort =
    resolvedEffort &&
    !isPromptInjected &&
    hasEffortLevel(caps, resolvedEffort) &&
    resolvedEffort !== defaultReasoningEffort
      ? resolvedEffort
      : undefined;
  const autoCompactWindow =
    resolvedAutoCompactWindow &&
    hasAutoCompactWindowOption(caps, resolvedAutoCompactWindow) &&
    resolvedAutoCompactWindow !== defaultAutoCompactWindow
      ? resolvedAutoCompactWindow
      : undefined;
  const thinking =
    caps.supportsThinkingToggle && modelOptions?.thinking === false ? false : undefined;
  const fastMode = caps.supportsFastMode && modelOptions?.fastMode === true ? true : undefined;
  const nextOptions: ClaudeModelOptions = {
    ...(thinking === false ? { thinking: false } : {}),
    ...(effort ? { effort } : {}),
    ...(fastMode ? { fastMode: true } : {}),
    ...(autoCompactWindow ? { autoCompactWindow } : {}),
  };
  return Object.keys(nextOptions).length > 0 ? nextOptions : undefined;
}

export function resolveApiModelId(modelSelection: ModelSelection): string {
  return modelSelection.model;
}

/**
 * Map a requested Claude Code effort to the API effort passed at session spawn.
 * `ultrathink` is prompt-injected (no API effort); `ultracode` runs as xhigh plus
 * the `ultracode` session setting.
 */
export function getEffectiveClaudeCodeEffort(
  effort: ClaudeCodeEffort | null | undefined,
): ClaudeApiEffort | null {
  if (!effort || effort === "ultrathink") {
    return null;
  }
  return effort === "ultracode" ? "xhigh" : effort;
}

interface ClaudeSpawnProfile {
  readonly maxEffort: boolean;
}

// Mirrors the spawn-time option derivation in the Claude adapter's startSession:
// only `max` effort is fixed at subprocess spawn (the query `effort` option;
// the flag-settings `effortLevel` key caps at xhigh). Every other effort level
// plus fastMode/ultracode are Settings keys applied live via the SDK's
// flag-settings control, and model/context window switch via `setModel`.
function claudeSpawnProfile(selection: Extract<ModelSelection, { provider: "anthropic" }>) {
  const caps = getModelCapabilities("anthropic", selection.model);
  const rawOptions = selection.options as { reasoningEffort?: string; effort?: string } | undefined;
  const requestedEffort = trimOrNull(rawOptions?.reasoningEffort ?? rawOptions?.effort ?? null);
  const effort = requestedEffort && hasEffortLevel(caps, requestedEffort) ? requestedEffort : null;
  return {
    maxEffort: getEffectiveClaudeCodeEffort(effort as ClaudeCodeEffort | null) === "max",
  } satisfies ClaudeSpawnProfile;
}

/**
 * Whether switching from `previous` to `next` requires restarting the Claude
 * subprocess. Restarting resumes via `--resume`, which replays the whole
 * conversation as uncached input tokens, so it must only happen for options
 * fixed at spawn — currently only `max` effort, which has no live Settings
 * equivalent. Model changes use `setModel`; other effort levels, fast mode,
 * ultracode, the auto-compact budget, and the thinking toggle all use the
 * SDK's live flag-settings control.
 */
export function claudeSelectionRequiresRestart(
  previous: ModelSelection | undefined,
  next: ModelSelection,
): boolean {
  if (next.provider !== "anthropic") {
    return false;
  }
  if (previous === undefined) {
    // First observation in this process: the live session was started from the
    // same selection source, so treat it as unchanged rather than replaying.
    return false;
  }
  if (previous.provider !== "anthropic") {
    return true;
  }
  // Normalize against each model before deciding a model-only switch is live:
  // a persisted `max` request may become spawn-fixed (or stop being so) as the
  // selected model's capabilities change.
  const prev = claudeSpawnProfile(previous);
  const desired = claudeSpawnProfile(next);
  return prev.maxEffort !== desired.maxEffort;
}

export function normalizeGrokModelOptions(
  model: string | null | undefined,
  modelOptions: GrokModelOptions | null | undefined,
): GrokModelOptions | undefined {
  const caps = getModelCapabilities("grok", model);
  const reasoningEffort = trimOrNull(modelOptions?.reasoningEffort);
  if (!reasoningEffort || !hasEffortLevel(caps, reasoningEffort)) {
    return undefined;
  }
  if (reasoningEffort === getDefaultEffort(caps)) {
    return undefined;
  }
  return { reasoningEffort: reasoningEffort as GrokReasoningEffort };
}

export function normalizeAntigravityModelOptions(
  model: string | null | undefined,
  modelOptions: AntigravityModelOptions | null | undefined,
  capabilities: ModelCapabilities = getModelCapabilities("antigravity", model),
): AntigravityModelOptions | undefined {
  const reasoningEffort = trimOrNull(modelOptions?.reasoningEffort);
  if (!reasoningEffort || !hasEffortLevel(capabilities, reasoningEffort)) {
    return undefined;
  }
  if (reasoningEffort === getDefaultEffort(capabilities)) {
    return undefined;
  }
  return { reasoningEffort };
}

export function normalizePiModelOptions(
  modelOptions: PiModelOptions | null | undefined,
): PiModelOptions | undefined {
  const thinkingLevel = trimOrNull(modelOptions?.thinkingLevel);
  return thinkingLevel && PI_THINKING_LEVEL_SET.has(thinkingLevel as PiThinkingLevel)
    ? { thinkingLevel: thinkingLevel as PiThinkingLevel }
    : undefined;
}

export function normalizeOpenCodeModelOptions(
  modelOptions: OpenCodeModelOptions | null | undefined,
): OpenCodeModelOptions | undefined {
  const variant = trimOrNull(modelOptions?.variant);
  const agent = trimOrNull(modelOptions?.agent);
  const nextOptions: OpenCodeModelOptions = {
    ...(variant ? { variant } : {}),
    ...(agent ? { agent } : {}),
  };
  return Object.keys(nextOptions).length > 0 ? nextOptions : undefined;
}

export function applyClaudePromptEffortPrefix(
  text: string,
  effort: ClaudeCodeEffort | null | undefined,
): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (effort !== "ultrathink") {
    return trimmed;
  }
  if (trimmed.startsWith("Ultrathink:")) {
    return trimmed;
  }
  return `Ultrathink:\n${trimmed}`;
}
