// FILE: appSettings.ts
// Purpose: Normalizes persisted UI settings and maps them to server/provider options.
// Layer: Web settings state
// Exports: app setting schema, normalization helpers, provider option builders

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Option, Schema, SchemaGetter } from "effect";
import {
  type AssistantDeliveryMode,
  DesktopAppIcon,
  DEFAULT_GIT_TEXT_GENERATION_MODEL,
  DEFAULT_SERVER_SETTINGS_VIEW,
  TrimmedNonEmptyString,
  ProviderKind,
  type ProviderStartOptions,
  type ServerSettingsView,
  type ServerSettingsPatch,
} from "@caide/contracts";
import {
  getDefaultModel,
  getModelOptions,
  normalizeModelSlug,
  resolveSelectableModel,
} from "@caide/shared/model";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { EnvMode } from "./components/BranchToolbar.logic";
import { normalizeCursorModelVariantBaseId } from "./cursorModelVariants";
import { formatProviderModelOptionName, type ProviderModelOption } from "./providerModelOptions";
import {
  DEFAULT_PROVIDER_ORDER,
  normalizeHiddenProviders,
  normalizeProviderOrder,
} from "./providerOrdering";
import { ensureNativeApi } from "./nativeApi";
import { providerDiscoveryQueryKeys } from "./lib/providerDiscoveryReactQuery";
import { serverQueryKeys, serverSettingsQueryOptions } from "./lib/serverReactQuery";
import {
  DEFAULT_UI_DENSITY,
  UI_DENSITY_MODES,
  normalizeUiDensity as normalizeUiDensityValue,
} from "./lib/appDensity";

const APP_SETTINGS_STORAGE_KEY = "caide:app-settings:v1";
const SERVER_SETTINGS_MIGRATION_STORAGE_KEY = "caide:server-settings-migrated:v1";
const MAX_CUSTOM_MODEL_COUNT = 32;
export const MAX_CUSTOM_MODEL_LENGTH = 256;
export const MIN_CHAT_FONT_SIZE_PX = 11;
export const MAX_CHAT_FONT_SIZE_PX = 18;
export const DEFAULT_CHAT_FONT_SIZE_PX = 12;
export const MIN_TERMINAL_FONT_SIZE_PX = 10;
export const MAX_TERMINAL_FONT_SIZE_PX = 22;
export const DEFAULT_TERMINAL_FONT_SIZE_PX = 12;

// Terminal font is a free-form font-family value: the user can type any font
// installed on their machine. An empty value keeps the bundled default stack
// (defined in index.css). The list below is only autocomplete inspiration shown
// in the settings input — it does NOT restrict what can be entered.
export const DEFAULT_TERMINAL_FONT_FAMILY = "";

export const TERMINAL_FONT_FAMILY_SUGGESTIONS: ReadonlyArray<string> = [
  "JetBrains Mono",
  "Fira Code",
  "Cascadia Code",
  "SF Mono",
  "Menlo",
  "Source Code Pro",
  "IBM Plex Mono",
  "Hack",
  "Roboto Mono",
  "Ubuntu Mono",
  "Consolas",
];

export const TimestampFormat = Schema.Literals(["locale", "12-hour", "24-hour"]);
export type TimestampFormat = typeof TimestampFormat.Type;
export const DEFAULT_TIMESTAMP_FORMAT: TimestampFormat = "locale";
export const SidebarProjectSortOrder = Schema.Literals(["updated_at", "created_at", "manual"]);
export type SidebarProjectSortOrder = typeof SidebarProjectSortOrder.Type;
export const DEFAULT_SIDEBAR_PROJECT_SORT_ORDER: SidebarProjectSortOrder = "manual";
export const SidebarThreadSortOrder = Schema.Literals(["updated_at", "created_at"]);
export type SidebarThreadSortOrder = typeof SidebarThreadSortOrder.Type;
export const DEFAULT_SIDEBAR_THREAD_SORT_ORDER: SidebarThreadSortOrder = "updated_at";
export const FollowUpBehavior = Schema.Literals(["queue", "steer"]);
export type FollowUpBehavior = typeof FollowUpBehavior.Type;
export const DEFAULT_FOLLOW_UP_BEHAVIOR: FollowUpBehavior = "queue";
export const UiDensity = Schema.Literals(UI_DENSITY_MODES);
export type UiDensity = typeof UiDensity.Type;
export { DEFAULT_UI_DENSITY };

export function getDefaultNativeFontSmoothing(platform = globalThis.navigator?.platform ?? "") {
  return /mac|iphone|ipad|ipod/i.test(platform);
}

type CustomModelSettingsKey =
  | "customEngineModels"
  | "customGroqModels"
  | "customOpenCodeZenModels"
  | "customOpenCodeGoModels";
export type ProviderCustomModelConfig = {
  provider: ProviderKind;
  settingsKey: CustomModelSettingsKey;
  defaultSettingsKey: CustomModelSettingsKey;
  title: string;
  description: string;
  placeholder: string;
  example: string;
};

const BUILT_IN_MODEL_SLUGS_BY_PROVIDER: Record<ProviderKind, ReadonlySet<string>> = {
  engine: new Set(getModelOptions("engine").map((option) => option.slug)),
  groq: new Set(getModelOptions("groq").map((option) => option.slug)),
  opencodeZen: new Set(getModelOptions("opencodeZen").map((option) => option.slug)),
  opencodeGo: new Set(getModelOptions("opencodeGo").map((option) => option.slug)),
};

const withDefaults =
  <
    S extends Schema.Top & Schema.WithoutConstructorDefault,
    D extends S["~type.make.in"] & S["Encoded"],
  >(
    fallback: () => D,
  ) =>
  (schema: S) =>
    schema.pipe(
      Schema.withConstructorDefault(() => Option.some(fallback())),
      Schema.withDecodingDefault(() => fallback()),
    );

// Legacy localStorage payloads may carry removed provider kinds; fold anything
// unknown onto the default provider instead of failing the whole settings decode.
const PersistedProviderKind = Schema.String.pipe(
  Schema.decodeTo(ProviderKind, {
    decode: SchemaGetter.transform((provider: string): ProviderKind =>
      provider === "groq" || provider === "opencodeZen" || provider === "opencodeGo"
        ? provider
        : "groq",
    ),
    encode: SchemaGetter.transform((provider: ProviderKind): string => provider),
  }),
);

export const AppSettingsSchema = Schema.Struct({
  uiDensity: UiDensity.pipe(withDefaults(() => DEFAULT_UI_DENSITY)),
  chatFontSizePx: Schema.Number.pipe(withDefaults(() => DEFAULT_CHAT_FONT_SIZE_PX)),
  chatCodeFontFamily: Schema.String.check(Schema.isMaxLength(256)).pipe(withDefaults(() => "")),
  terminalFontSizePx: Schema.Number.pipe(withDefaults(() => DEFAULT_TERMINAL_FONT_SIZE_PX)),
  terminalFontFamily: Schema.String.check(Schema.isMaxLength(256)).pipe(
    withDefaults(() => DEFAULT_TERMINAL_FONT_FAMILY),
  ),
  engineApiKey: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  engineApiKeyConfigured: Schema.Boolean.pipe(withDefaults(() => false)),
  engineBaseUrl: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  engineModelId: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  engineFlutterSdkBin: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  groqApiKey: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  groqApiKeyConfigured: Schema.Boolean.pipe(withDefaults(() => false)),
  groqBaseUrl: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  opencodeZenApiKey: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  opencodeZenApiKeyConfigured: Schema.Boolean.pipe(withDefaults(() => false)),
  opencodeZenBaseUrl: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  opencodeGoApiKey: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  opencodeGoApiKeyConfigured: Schema.Boolean.pipe(withDefaults(() => false)),
  opencodeGoBaseUrl: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  defaultThreadEnvMode: EnvMode.pipe(withDefaults(() => "local" as const satisfies EnvMode)),
  confirmThreadDelete: Schema.Boolean.pipe(withDefaults(() => true)),
  confirmThreadArchive: Schema.Boolean.pipe(withDefaults(() => false)),
  confirmTerminalTabClose: Schema.Boolean.pipe(withDefaults(() => true)),
  diffWordWrap: Schema.Boolean.pipe(withDefaults(() => false)),
  showPullRequestDiffColors: Schema.Boolean.pipe(withDefaults(() => true)),
  // Local-only UI preference for hiding the standalone "Chats" list in the sidebar
  // footer (rootless chats not tied to a project).
  showChatsSection: Schema.Boolean.pipe(withDefaults(() => true)),
  // Local-only UI preferences: which optional sections of the chat Environment panel are
  // shown. The git block (Changes/Worktree/branch/Commit and Push) is always visible; these
  // toggle the sections beneath it via the panel header's gear menu.
  // When false (default), normal chats start with the Environment panel closed. User toggles
  // also write back here so the last explicit open/close survives reloads.
  environmentPanelDefaultOpen: Schema.Boolean.pipe(withDefaults(() => false)),
  showEnvironmentUsage: Schema.Boolean.pipe(withDefaults(() => true)),
  showEnvironmentRepository: Schema.Boolean.pipe(withDefaults(() => true)),
  showEnvironmentPullRequest: Schema.Boolean.pipe(withDefaults(() => true)),
  showEnvironmentEditor: Schema.Boolean.pipe(withDefaults(() => true)),
  showEnvironmentRecap: Schema.Boolean.pipe(withDefaults(() => true)),
  showEnvironmentPinned: Schema.Boolean.pipe(withDefaults(() => true)),
  showEnvironmentMarkers: Schema.Boolean.pipe(withDefaults(() => false)),
  showEnvironmentInstructions: Schema.Boolean.pipe(withDefaults(() => false)),
  showEnvironmentNotepad: Schema.Boolean.pipe(withDefaults(() => false)),
  followUpBehavior: FollowUpBehavior.pipe(withDefaults(() => DEFAULT_FOLLOW_UP_BEHAVIOR)),
  enableAssistantStreaming: Schema.Boolean.pipe(withDefaults(() => true)),
  enableProviderUpdateChecks: Schema.Boolean.pipe(withDefaults(() => true)),
  enableNativeFontSmoothing: Schema.Boolean.pipe(withDefaults(getDefaultNativeFontSmoothing)),
  desktopAppIcon: DesktopAppIcon.pipe(withDefaults(() => "default" as const)),
  enableTaskCompletionToasts: Schema.Boolean.pipe(withDefaults(() => true)),
  enableSystemTaskCompletionNotifications: Schema.Boolean.pipe(withDefaults(() => true)),
  sidebarProjectSortOrder: SidebarProjectSortOrder.pipe(
    withDefaults(() => DEFAULT_SIDEBAR_PROJECT_SORT_ORDER),
  ),
  sidebarThreadSortOrder: SidebarThreadSortOrder.pipe(
    withDefaults(() => DEFAULT_SIDEBAR_THREAD_SORT_ORDER),
  ),
  timestampFormat: TimestampFormat.pipe(withDefaults(() => DEFAULT_TIMESTAMP_FORMAT)),
  customEngineModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  customGroqModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  customOpenCodeZenModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  customOpenCodeGoModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  textGenerationProvider: PersistedProviderKind.pipe(withDefaults(() => "groq" as const)),
  textGenerationModel: Schema.optional(TrimmedNonEmptyString),
  uiFontFamily: Schema.String.check(Schema.isMaxLength(256)).pipe(withDefaults(() => "")),
  defaultProvider: PersistedProviderKind.pipe(withDefaults(() => "groq" as const)),
  // Local-only UI preference: providers explicitly hidden from the composer picker.
  // The active/locked provider for a thread is always shown regardless, so users
  // never get stuck on a thread whose provider they later chose to hide.
  hiddenProviders: Schema.Array(PersistedProviderKind).pipe(withDefaults(() => [])),
  // Local-only UI preference: top-level provider order in Settings and the composer picker.
  providerOrder: Schema.Array(PersistedProviderKind).pipe(
    withDefaults(() => [...DEFAULT_PROVIDER_ORDER]),
  ),
  // Deprecated local-only preference kept for backward-compatible decoding.
  // Model-level hiding caused too many edge cases, so the app now normalizes it away.
  hiddenModels: Schema.Array(
    Schema.Struct({
      provider: PersistedProviderKind,
      slug: Schema.String,
    }),
  ).pipe(withDefaults(() => [])),
});
export type AppSettings = typeof AppSettingsSchema.Type;

/** The settings values and mutation used by a mounted settings panel.
 * The route owns the subscription so extracted workflow panels do not create
 * duplicate local-storage/server-settings subscriptions. */
export type AppSettingsBinding = {
  readonly settings: AppSettings;
  readonly defaults: AppSettings;
  readonly updateSettings: (patch: Partial<AppSettings>) => void;
};

export function isGitTextGenerationSettingsDirty(
  settings: AppSettings,
  defaults: AppSettings,
): boolean {
  return (
    (settings.textGenerationProvider ?? "groq") !== (defaults.textGenerationProvider ?? "groq") ||
    (settings.textGenerationModel ?? DEFAULT_GIT_TEXT_GENERATION_MODEL) !==
      (defaults.textGenerationModel ?? DEFAULT_GIT_TEXT_GENERATION_MODEL)
  );
}

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };
type MutableServerSettingsPatch = Mutable<ServerSettingsPatch>;
type MutableServerSettingsProvidersPatch = Mutable<NonNullable<ServerSettingsPatch["providers"]>>;

export interface AppModelOption extends ProviderModelOption {
  provider: ProviderKind;
  isCustom: boolean;
}

const DEFAULT_APP_SETTINGS = AppSettingsSchema.makeUnsafe({});
let serverSettingsMigrationInFlight = false;

const PROVIDER_CUSTOM_MODEL_CONFIG: Record<ProviderKind, ProviderCustomModelConfig> = {
  engine: {
    provider: "engine",
    settingsKey: "customEngineModels",
    defaultSettingsKey: "customEngineModels",
    title: "Builder",
    description: "Save additional Builder engine model slugs for the picker.",
    placeholder: "your-engine-model-slug",
    example: "gpt-5.6-sol",
  },

  groq: {
    provider: "groq",
    settingsKey: "customGroqModels",
    defaultSettingsKey: "customGroqModels",
    title: "Groq",
    description: "Save additional Groq model slugs for the picker.",
    placeholder: "your-groq-model-slug",
    example: "llama-3.3-70b-versatile",
  },

  opencodeZen: {
    provider: "opencodeZen",
    settingsKey: "customOpenCodeZenModels",
    defaultSettingsKey: "customOpenCodeZenModels",
    title: "OpenCode Zen",
    description: "Save additional OpenCode Zen model slugs for the picker.",
    placeholder: "your-opencode-zen-model-slug",
    example: "deepseek-v4-flash-free",
  },
  opencodeGo: {
    provider: "opencodeGo",
    settingsKey: "customOpenCodeGoModels",
    defaultSettingsKey: "customOpenCodeGoModels",
    title: "OpenCode Go",
    description: "Save additional OpenCode Go model slugs for the picker.",
    placeholder: "your-opencode-go-model-slug",
    example: "deepseek-v4-flash-free",
  },
};

export const MODEL_PROVIDER_SETTINGS = Object.values(PROVIDER_CUSTOM_MODEL_CONFIG);

// Droid's ACP catalog is authoritative and rejects unknown slugs. Preserve its
// persisted config for compatibility, but do not offer an editor it cannot honor.
export const CUSTOM_MODEL_EDITOR_PROVIDER_SETTINGS = MODEL_PROVIDER_SETTINGS.filter(
  (config) => config.provider !== "groq",
);

export function normalizeCustomModelSlugs(
  models: Iterable<string | null | undefined> | null | undefined,
  provider: ProviderKind = "groq",
): string[] {
  const normalizedModels: string[] = [];
  const seen = new Set<string>();
  const builtInModelSlugs = BUILT_IN_MODEL_SLUGS_BY_PROVIDER[provider] ?? new Set<string>();

  for (const candidate of models ?? []) {
    const normalized = normalizeModelSlug(candidate, provider);
    if (
      !normalized ||
      normalized.length > MAX_CUSTOM_MODEL_LENGTH ||
      builtInModelSlugs.has(normalized) ||
      seen.has(normalized)
    ) {
      continue;
    }

    seen.add(normalized);
    normalizedModels.push(normalized);
    if (normalizedModels.length >= MAX_CUSTOM_MODEL_COUNT) {
      break;
    }
  }

  return normalizedModels;
}

export function normalizeChatFontSizePx(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_CHAT_FONT_SIZE_PX;
  }

  return Math.min(MAX_CHAT_FONT_SIZE_PX, Math.max(MIN_CHAT_FONT_SIZE_PX, Math.round(value)));
}

export function normalizeTerminalFontSizePx(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_TERMINAL_FONT_SIZE_PX;
  }

  return Math.min(
    MAX_TERMINAL_FONT_SIZE_PX,
    Math.max(MIN_TERMINAL_FONT_SIZE_PX, Math.round(value)),
  );
}

export function normalizeTerminalFontFamily(value: string | null | undefined): string {
  // Free-form font-family text. Only strip characters that can't legitimately
  // appear in a CSS font-family value so the typed name can't break out of the
  // custom property (`;`, `{}`, angle brackets, newlines) or smuggle in other
  // declarations. Whitespace is intentionally preserved here so multi-word names
  // ("Fira Code") remain typable in a controlled input; the CSS resolver trims.
  return (value ?? "").replace(/[;{}<>\n\r]/g, "").slice(0, 256);
}

// Build the CSS font-family stack written to `--terminal-font-family`, or null
// when the bundled default (defined in index.css) should stay in effect.
//
// Accepts either a single family name (`Fira Code`) or a full comma-separated
// stack (`"Fira Code", Menlo, monospace`). Single names are quoted when needed,
// and a `monospace` fallback is appended so an uninstalled font degrades.
export function resolveTerminalFontFamilyStack(value: string | null | undefined): string | null {
  const normalized = normalizeTerminalFontFamily(value).replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  const hasGenericFallback = /\b(?:monospace|serif|sans-serif|system-ui|ui-monospace)\b/.test(
    normalized,
  );

  if (normalized.includes(",")) {
    return hasGenericFallback ? normalized : `${normalized}, monospace`;
  }

  const isQuoted = /^(["']).*\1$/.test(normalized);
  const family = !isQuoted && /\s/.test(normalized) ? `"${normalized}"` : normalized;
  return hasGenericFallback ? family : `${family}, monospace`;
}

function normalizeAppSettings(settings: AppSettings): AppSettings {
  return {
    ...settings,
    // Password & API key fields are accepted only as write-only update patches. Never retain
    // reusable provider credentials in browser state or localStorage.
    groqApiKey: "",
    opencodeZenApiKey: "",
    opencodeGoApiKey: "",
    uiDensity: normalizeUiDensityValue(settings.uiDensity),
    chatFontSizePx: normalizeChatFontSizePx(settings.chatFontSizePx),
    terminalFontSizePx: normalizeTerminalFontSizePx(settings.terminalFontSizePx),
    terminalFontFamily: normalizeTerminalFontFamily(settings.terminalFontFamily),
    customEngineModels: normalizeCustomModelSlugs(settings.customEngineModels, "engine"),
    customGroqModels: normalizeCustomModelSlugs(settings.customGroqModels, "groq"),
    customOpenCodeZenModels: normalizeCustomModelSlugs(
      settings.customOpenCodeZenModels,
      "opencodeZen",
    ),
    customOpenCodeGoModels: normalizeCustomModelSlugs(
      settings.customOpenCodeGoModels,
      "opencodeGo",
    ),
    hiddenProviders: normalizeHiddenProviders(settings.hiddenProviders),
    providerOrder: normalizeProviderOrder(settings.providerOrder),
    hiddenModels: [],
  };
}

function serverSettingsToAppSettings(settings: ServerSettingsView): Partial<AppSettings> {
  // The persisted model-selection provider is a plain string (legacy payloads);
  // fold unknown values onto the default instead of poisoning local state.
  const textGenProvider = settings.textGenerationModelSelection.provider;
  const resolvedTextGenProvider =
    textGenProvider === "groq" ||
    textGenProvider === "opencodeZen" ||
    textGenProvider === "opencodeGo" ||
    textGenProvider === "engine"
      ? textGenProvider
      : undefined;
  return {
    defaultThreadEnvMode: settings.defaultThreadEnvMode,
    enableAssistantStreaming: settings.enableAssistantStreaming,
    enableProviderUpdateChecks: settings.enableProviderUpdateChecks,
    customEngineModels: settings.providers.engine.customModels,
    customGroqModels: settings.providers.groq.customModels,
    engineApiKeyConfigured: settings.providers.engine.apiKeyConfigured,
    engineBaseUrl: settings.providers.engine.baseUrl,
    engineModelId: settings.providers.engine.modelId,
    engineFlutterSdkBin: settings.providers.engine.flutterSdkBin,
    customOpenCodeZenModels: settings.providers.opencodeZen.customModels,
    groqApiKeyConfigured: settings.providers.groq.apiKeyConfigured,
    groqBaseUrl: settings.providers.groq.baseUrl,
    opencodeZenApiKeyConfigured: settings.providers.opencodeZen.apiKeyConfigured,
    opencodeZenBaseUrl: settings.providers.opencodeZen.baseUrl,
    opencodeGoApiKeyConfigured: settings.providers.opencodeGo.apiKeyConfigured,
    opencodeGoBaseUrl: settings.providers.opencodeGo.baseUrl,
    ...(resolvedTextGenProvider ? { textGenerationProvider: resolvedTextGenProvider } : {}),
    textGenerationModel: settings.textGenerationModelSelection.model,
  };
}

function resolveTextGenerationProvider(input: {
  readonly provider?: ProviderKind | null;
}): ProviderKind {
  return input.provider ?? "groq";
}

function hasOwn<Key extends keyof AppSettings>(patch: Partial<AppSettings>, key: Key): boolean {
  return Object.prototype.hasOwnProperty.call(patch, key);
}

function touchesProviderDiscoverySettings(patch: Partial<AppSettings>): boolean {
  return (
    hasOwn(patch, "groqApiKey") ||
    hasOwn(patch, "groqBaseUrl") ||
    hasOwn(patch, "opencodeZenApiKey") ||
    hasOwn(patch, "opencodeZenBaseUrl") ||
    hasOwn(patch, "opencodeGoApiKey") ||
    hasOwn(patch, "opencodeGoBaseUrl") ||
    hasOwn(patch, "engineApiKey") ||
    hasOwn(patch, "engineBaseUrl") ||
    hasOwn(patch, "engineModelId")
  );
}

function appSettingsPatchToServerSettingsPatch(patch: Partial<AppSettings>): ServerSettingsPatch {
  const providers: MutableServerSettingsProvidersPatch = {};
  const serverPatch: MutableServerSettingsPatch = {};

  if (hasOwn(patch, "enableAssistantStreaming")) {
    serverPatch.enableAssistantStreaming = Boolean(patch.enableAssistantStreaming);
  }
  if (hasOwn(patch, "enableProviderUpdateChecks")) {
    serverPatch.enableProviderUpdateChecks = Boolean(patch.enableProviderUpdateChecks);
  }
  if (patch.defaultThreadEnvMode === "local" || patch.defaultThreadEnvMode === "worktree") {
    serverPatch.defaultThreadEnvMode = patch.defaultThreadEnvMode;
  }
  if (hasOwn(patch, "textGenerationModel") || hasOwn(patch, "textGenerationProvider")) {
    const model = patch.textGenerationModel ?? DEFAULT_GIT_TEXT_GENERATION_MODEL;
    serverPatch.textGenerationModelSelection = {
      provider: resolveTextGenerationProvider(
        patch.textGenerationProvider === undefined ? {} : { provider: patch.textGenerationProvider },
      ),
      model,
    };
  }

  if (
    hasOwn(patch, "engineApiKey") ||
    hasOwn(patch, "engineBaseUrl") ||
    hasOwn(patch, "engineModelId") ||
    hasOwn(patch, "engineFlutterSdkBin") ||
    hasOwn(patch, "customEngineModels")
  ) {
    providers.engine = {
      ...(hasOwn(patch, "engineApiKey") ? { apiKey: patch.engineApiKey ?? "" } : {}),
      ...(hasOwn(patch, "engineBaseUrl") ? { baseUrl: patch.engineBaseUrl ?? "" } : {}),
      ...(hasOwn(patch, "engineModelId") ? { modelId: patch.engineModelId ?? "" } : {}),
      ...(hasOwn(patch, "engineFlutterSdkBin")
        ? { flutterSdkBin: patch.engineFlutterSdkBin ?? "" }
        : {}),
      ...(hasOwn(patch, "customEngineModels")
        ? { customModels: patch.customEngineModels ?? [] }
        : {}),
    };
  }

  if (
    hasOwn(patch, "groqApiKey") ||
    hasOwn(patch, "groqBaseUrl") ||
    hasOwn(patch, "customGroqModels")
  ) {
    providers.groq = {
      ...(hasOwn(patch, "groqApiKey") ? { apiKey: patch.groqApiKey ?? "" } : {}),
      ...(hasOwn(patch, "groqBaseUrl") ? { baseUrl: patch.groqBaseUrl ?? "" } : {}),
      ...(hasOwn(patch, "customGroqModels") ? { customModels: patch.customGroqModels ?? [] } : {}),
    };
  }

  if (
    hasOwn(patch, "opencodeZenApiKey") ||
    hasOwn(patch, "opencodeZenBaseUrl") ||
    hasOwn(patch, "customOpenCodeZenModels")
  ) {
    providers.opencodeZen = {
      ...(hasOwn(patch, "opencodeZenApiKey") ? { apiKey: patch.opencodeZenApiKey ?? "" } : {}),
      ...(hasOwn(patch, "opencodeZenBaseUrl") ? { baseUrl: patch.opencodeZenBaseUrl ?? "" } : {}),
      ...(hasOwn(patch, "customOpenCodeZenModels")
        ? { customModels: patch.customOpenCodeZenModels ?? [] }
        : {}),
    };
  }

  if (
    hasOwn(patch, "opencodeGoApiKey") ||
    hasOwn(patch, "opencodeGoBaseUrl") ||
    hasOwn(patch, "customOpenCodeGoModels")
  ) {
    providers.opencodeGo = {
      ...(hasOwn(patch, "opencodeGoApiKey") ? { apiKey: patch.opencodeGoApiKey ?? "" } : {}),
      ...(hasOwn(patch, "opencodeGoBaseUrl") ? { baseUrl: patch.opencodeGoBaseUrl ?? "" } : {}),
      ...(hasOwn(patch, "customOpenCodeGoModels")
        ? { customModels: patch.customOpenCodeGoModels ?? [] }
        : {}),
    };
  }

  if (Object.keys(providers).length > 0) {
    serverPatch.providers = providers;
  }
  return serverPatch;
}

function isServerSettingsPatchEmpty(patch: ServerSettingsPatch): boolean {
  return Object.keys(patch).length === 0;
}

function buildInitialServerSettingsMigrationPatch(settings: AppSettings): ServerSettingsPatch {
  const patch: Partial<Mutable<AppSettings>> = {};
  const normalizedSettings = normalizeAppSettings(settings);
  const defaults = DEFAULT_APP_SETTINGS;

  for (const key of [
    "defaultThreadEnvMode",
    "enableAssistantStreaming",
    "enableProviderUpdateChecks",

    "groqApiKey",
    "groqBaseUrl",
    "opencodeZenApiKey",
    "opencodeZenBaseUrl",
    "opencodeGoApiKey",
    "opencodeGoBaseUrl",
    "textGenerationModel",
    "textGenerationProvider",
  ] as const) {
    if (normalizedSettings[key] !== defaults[key]) {
      patch[key] = normalizedSettings[key] as never;
    }
  }

  // Migrate legacy browser-stored API keys once before normalizeAppSettings
  // scrubs them from local state. All subsequent reads use redacted server views.
  if (settings.groqApiKey.trim()) {
    patch.groqApiKey = settings.groqApiKey;
  }
  if (settings.opencodeZenApiKey.trim()) {
    patch.opencodeZenApiKey = settings.opencodeZenApiKey;
  }
  if (settings.opencodeGoApiKey.trim()) {
    patch.opencodeGoApiKey = settings.opencodeGoApiKey;
  }

  for (const key of [
    "customEngineModels",
    "customGroqModels",
    "customOpenCodeZenModels",
    "customOpenCodeGoModels",
  ] as const) {
    if (normalizedSettings[key].length > 0) {
      patch[key] = normalizedSettings[key] as never;
    }
  }

  return appSettingsPatchToServerSettingsPatch(patch);
}

export function normalizeStoredAppSettings(settings: AppSettings): AppSettings {
  return normalizeAppSettings(settings);
}

export function getCustomModelsForProvider(
  settings: Pick<AppSettings, CustomModelSettingsKey>,
  provider: ProviderKind,
): readonly string[] {
  return settings[PROVIDER_CUSTOM_MODEL_CONFIG[provider].settingsKey] ?? [];
}

export function getDefaultCustomModelsForProvider(
  defaults: Pick<AppSettings, CustomModelSettingsKey>,
  provider: ProviderKind,
): readonly string[] {
  return defaults[PROVIDER_CUSTOM_MODEL_CONFIG[provider].defaultSettingsKey] ?? [];
}

export function patchCustomModels(
  provider: ProviderKind,
  models: string[],
): Partial<Pick<AppSettings, CustomModelSettingsKey>> {
  return {
    [PROVIDER_CUSTOM_MODEL_CONFIG[provider].settingsKey]: models,
  };
}

export function getCustomModelsByProvider(
  settings: Pick<AppSettings, CustomModelSettingsKey>,
): Record<ProviderKind, readonly string[]> {
  return {
    engine: getCustomModelsForProvider(settings, "engine"),
    groq: getCustomModelsForProvider(settings, "groq"),
    opencodeZen: getCustomModelsForProvider(settings, "opencodeZen"),
    opencodeGo: getCustomModelsForProvider(settings, "opencodeGo"),
  };
}

export function getAppModelOptions(
  provider: ProviderKind,
  customModels: readonly string[],
  selectedModel?: string | null,
): AppModelOption[] {
  const options: AppModelOption[] = getModelOptions(provider).map(({ slug, name }) => ({
    provider,
    slug,
    name,
    isCustom: false,
  }));
  const seen = new Set(options.map((option) => option.slug));
  const trimmedSelectedModel = selectedModel?.trim().toLowerCase();

  for (const slug of normalizeCustomModelSlugs(customModels, provider)) {
    if (seen.has(slug)) {
      continue;
    }

    seen.add(slug);
    options.push({
      provider,
      slug,
      name: formatProviderModelOptionName({ provider, slug }),
      isCustom: true,
    });
  }

  const normalizedSelectedModel =
    provider === "groq"
      ? normalizeCursorModelVariantBaseId(selectedModel)
      : normalizeModelSlug(selectedModel, provider);
  const selectedModelMatchesExistingName =
    typeof trimmedSelectedModel === "string" &&
    options.some((option) => option.name.toLowerCase() === trimmedSelectedModel);
  if (
    normalizedSelectedModel &&
    !seen.has(normalizedSelectedModel) &&
    !selectedModelMatchesExistingName
  ) {
    options.push({
      provider,
      slug: normalizedSelectedModel,
      name: formatProviderModelOptionName({ provider, slug: normalizedSelectedModel }),
      isCustom: true,
    });
  }

  return options;
}

type GitTextGenerationDiscoveredProvider = "groq";

export function mapCatalogModelOptionsToAppModelOptions(
  provider: GitTextGenerationDiscoveredProvider,
  options: ReadonlyArray<ProviderModelOption & { isCustom?: boolean }>,
): AppModelOption[] {
  return options.map((option) => ({
    ...option,
    provider,
    isCustom: option.isCustom ?? false,
  }));
}

export function getGitTextGenerationModelOptions(
  settings: Pick<
    AppSettings,
    "customGroqModels" | "textGenerationModel" | "textGenerationProvider"
  >,
  discoveredOptionsByProvider?: Partial<
    Record<
      GitTextGenerationDiscoveredProvider,
      ReadonlyArray<ProviderModelOption & { isCustom?: boolean }>
    >
  >,
): AppModelOption[] {
  const options = [
    ...(discoveredOptionsByProvider?.groq
      ? mapCatalogModelOptionsToAppModelOptions("groq", discoveredOptionsByProvider.groq)
      : getAppModelOptions("groq", settings.customGroqModels)),
  ];
  const deduped: AppModelOption[] = [];
  const seen = new Set<string>();

  for (const option of options) {
    const key = `${option.provider}:${option.slug}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(option);
  }

  const selectedModel = settings.textGenerationModel?.trim();
  const selectedProvider = settings.textGenerationProvider ?? "groq";
  if (selectedModel && !seen.has(`${selectedProvider}:${selectedModel}`)) {
    deduped.push({
      provider: selectedProvider,
      slug: selectedModel,
      name: formatProviderModelOptionName({ provider: selectedProvider, slug: selectedModel }),
      isCustom: true,
    });
  }

  return deduped;
}

export function resolveAppModelSelection(
  provider: ProviderKind,
  customModels: Record<ProviderKind, readonly string[]>,
  selectedModel: string | null | undefined,
): string {
  const customModelsForProvider = customModels[provider];
  const options = getAppModelOptions(provider, customModelsForProvider, selectedModel);
  return (
    resolveSelectableModel(provider, selectedModel, options) ?? getDefaultModel(provider) ?? ""
  );
}

export function getCustomModelOptionsByProvider(
  settings: Pick<AppSettings, CustomModelSettingsKey>,
): Record<ProviderKind, ReadonlyArray<ProviderModelOption>> {
  const customModelsByProvider = getCustomModelsByProvider(settings);
  return {
    engine: getAppModelOptions("engine", customModelsByProvider.engine),
    groq: getAppModelOptions("groq", customModelsByProvider.groq),
    opencodeZen: getAppModelOptions("opencodeZen", customModelsByProvider.opencodeZen),
    opencodeGo: getAppModelOptions("opencodeGo", customModelsByProvider.opencodeGo),
  };
}

/**
 * Single source of truth for mapping the streaming preference onto the orchestration
 * delivery mode used when dispatching turns (composer, chat, and kanban share this).
 */
export function resolveAssistantDeliveryMode(
  settings: Pick<AppSettings, "enableAssistantStreaming">,
): AssistantDeliveryMode {
  return settings.enableAssistantStreaming ? "streaming" : "buffered";
}

/**
 * Resolves the dispatch mode for a composer submit. The preference applies only
 * while a turn is live; Ctrl/Cmd+Enter temporarily selects the opposite mode.
 */
export function resolveFollowUpDispatchMode(input: {
  behavior: FollowUpBehavior;
  hasLiveTurn: boolean;
  useOppositeBehavior?: boolean;
}): FollowUpBehavior {
  if (!input.hasLiveTurn) {
    return "queue";
  }
  if (!input.useOppositeBehavior) {
    return input.behavior;
  }
  return input.behavior === "queue" ? "steer" : "queue";
}

export function useAppSettings() {
  const queryClient = useQueryClient();
  const serverSettingsQuery = useQuery(serverSettingsQueryOptions());
  const [localSettings, setSettings] = useLocalStorage(
    APP_SETTINGS_STORAGE_KEY,
    DEFAULT_APP_SETTINGS,
    AppSettingsSchema,
  );
  const normalizedStoredSettingsRef = useRef(false);

  const defaults = normalizeAppSettings({
    ...DEFAULT_APP_SETTINGS,
    ...serverSettingsToAppSettings(DEFAULT_SERVER_SETTINGS_VIEW),
  });

  const settings = normalizeAppSettings({
    ...localSettings,
    ...(serverSettingsQuery.data ? serverSettingsToAppSettings(serverSettingsQuery.data) : {}),
  });

  useEffect(() => {
    if (normalizedStoredSettingsRef.current) {
      return;
    }
    normalizedStoredSettingsRef.current = true;

    setSettings((previous) => normalizeStoredAppSettings(previous));
  }, [setSettings]);

  useEffect(() => {
    if (!serverSettingsQuery.data || serverSettingsMigrationInFlight) {
      return;
    }
    if (globalThis.localStorage?.getItem(SERVER_SETTINGS_MIGRATION_STORAGE_KEY) === "1") {
      return;
    }

    const migrationPatch = buildInitialServerSettingsMigrationPatch(localSettings);
    if (isServerSettingsPatchEmpty(migrationPatch)) {
      globalThis.localStorage?.setItem(SERVER_SETTINGS_MIGRATION_STORAGE_KEY, "1");
      return;
    }

    serverSettingsMigrationInFlight = true;
    void ensureNativeApi()
      .server.updateSettings(migrationPatch)
      .then((nextSettings) => {
        queryClient.setQueryData(serverQueryKeys.settings(), nextSettings);
        globalThis.localStorage?.setItem(SERVER_SETTINGS_MIGRATION_STORAGE_KEY, "1");
      })
      .catch(() => {
        void queryClient.invalidateQueries({ queryKey: serverQueryKeys.settings() });
      })
      .finally(() => {
        serverSettingsMigrationInFlight = false;
      });
  }, [localSettings, queryClient, serverSettingsQuery.data]);

  const updateSettings = (patch: Partial<AppSettings>) => {
    setSettings((prev) =>
      normalizeAppSettings({
        ...prev,
        ...patch,
        ...(hasOwn(patch, "engineApiKey")
          ? { engineApiKeyConfigured: Boolean(patch.engineApiKey?.trim()) }
          : {}),
        ...(hasOwn(patch, "groqApiKey")
          ? { groqApiKeyConfigured: Boolean(patch.groqApiKey?.trim()) }
          : {}),
        ...(hasOwn(patch, "opencodeZenApiKey")
          ? { opencodeZenApiKeyConfigured: Boolean(patch.opencodeZenApiKey?.trim()) }
          : {}),
        ...(hasOwn(patch, "opencodeGoApiKey")
          ? { opencodeGoApiKeyConfigured: Boolean(patch.opencodeGoApiKey?.trim()) }
          : {}),
      }),
    );
    if (touchesProviderDiscoverySettings(patch)) {
      void queryClient.invalidateQueries({ queryKey: providerDiscoveryQueryKeys.all });
    }

    const serverPatch = appSettingsPatchToServerSettingsPatch(patch);
    if (isServerSettingsPatchEmpty(serverPatch)) {
      return;
    }

    void ensureNativeApi()
      .server.updateSettings(serverPatch)
      .then((nextSettings) => {
        queryClient.setQueryData(serverQueryKeys.settings(), nextSettings);
      })
      .catch(() => {
        void queryClient.invalidateQueries({ queryKey: serverQueryKeys.settings() });
      });
  };

  const resetSettings = () => {
    setSettings(DEFAULT_APP_SETTINGS);
    void queryClient.invalidateQueries({ queryKey: providerDiscoveryQueryKeys.all });
    const serverPatch = appSettingsPatchToServerSettingsPatch(defaults);
    void ensureNativeApi()
      .server.updateSettings(serverPatch)
      .then((nextSettings) => {
        queryClient.setQueryData(serverQueryKeys.settings(), nextSettings);
      })
      .catch(() => {
        void queryClient.invalidateQueries({ queryKey: serverQueryKeys.settings() });
      });
  };

  return {
    settings,
    serverSettings: serverSettingsQuery.data,
    updateSettings,
    resetSettings,
    defaults,
  } as const;
}
