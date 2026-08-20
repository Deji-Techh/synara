// FILE: appSettings.ts
// Purpose: Normalizes persisted UI settings and maps them to server/provider options.
// Layer: Web settings state
// Exports: app setting schema, normalization helpers, provider option builders

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Option, Schema, SchemaTransformation } from "effect";
import {
  type AssistantDeliveryMode,
  DesktopAppIcon,
  DEFAULT_GIT_TEXT_GENERATION_MODEL,
  DEFAULT_SERVER_SETTINGS,
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
  | "customCodexModels"
  | "customClaudeModels"
  | "customCursorModels"
  | "customAntigravityModels"
  | "customGrokModels"
  | "customDroidModels"
  | "customKiloModels"
  | "customOpenCodeModels"
  | "customPiModels"
  | "customEngineModels"
  | "customOpenAiModels"
  | "customAnthropicModels"
  | "customGoogleModels"
  | "customOpenRouterModels"
  | "customOllamaModels"
  | "customDeepseekModels"
  | "customGroqModels"
  | "customMistralModels"
  | "customTogetherModels"
  | "customCohereModels"
  | "customXaiModels"
  | "customFireworksModels"
  | "customOpenCodeZenModels";
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
  codex: new Set(getModelOptions("openai").map((option) => option.slug)),
  claudeAgent: new Set(getModelOptions("anthropic").map((option) => option.slug)),
  cursor: new Set(getModelOptions("openai").map((option) => option.slug)),
  antigravity: new Set(getModelOptions("google").map((option) => option.slug)),
  grok: new Set(getModelOptions("openai").map((option) => option.slug)),
  droid: new Set(getModelOptions("openai").map((option) => option.slug)),
  kilo: new Set(getModelOptions("openai").map((option) => option.slug)),
  opencode: new Set(getModelOptions("openai").map((option) => option.slug)),
  pi: new Set(getModelOptions("openai").map((option) => option.slug)),
  engine: new Set(getModelOptions("engine").map((option) => option.slug)),
  openai: new Set(getModelOptions("openai").map((option) => option.slug)),
  anthropic: new Set(getModelOptions("anthropic").map((option) => option.slug)),
  google: new Set(getModelOptions("google").map((option) => option.slug)),
  openrouter: new Set(getModelOptions("openrouter").map((option) => option.slug)),
  ollama: new Set(getModelOptions("ollama").map((option) => option.slug)),
  deepseek: new Set(getModelOptions("deepseek").map((option) => option.slug)),
  groq: new Set(getModelOptions("groq").map((option) => option.slug)),
  mistral: new Set(getModelOptions("mistral").map((option) => option.slug)),
  together: new Set(getModelOptions("together").map((option) => option.slug)),
  cohere: new Set(getModelOptions("cohere").map((option) => option.slug)),
  xai: new Set(getModelOptions("xai").map((option) => option.slug)),
  fireworks: new Set(getModelOptions("fireworks").map((option) => option.slug)),
  opencodeZen: new Set(getModelOptions("opencodeZen").map((option) => option.slug)),
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

const PersistedProviderKind = Schema.Literals([
  "openai",
  "anthropic",
  "openai",
  "google",
  "google",
  "openai",
  "openai",
  "openai",
  "openai",
  "openai",
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
]).pipe(
  Schema.decodeTo(
    ProviderKind,
    SchemaTransformation.transform({
      decode: (provider) => (provider === "google" ? "google" : provider),
      encode: (provider) => provider,
    }),
  ),
);

export const AppSettingsSchema = Schema.Struct({
  claudeBinaryPath: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  uiDensity: UiDensity.pipe(withDefaults(() => DEFAULT_UI_DENSITY)),
  chatFontSizePx: Schema.Number.pipe(withDefaults(() => DEFAULT_CHAT_FONT_SIZE_PX)),
  chatCodeFontFamily: Schema.String.check(Schema.isMaxLength(256)).pipe(withDefaults(() => "")),
  terminalFontSizePx: Schema.Number.pipe(withDefaults(() => DEFAULT_TERMINAL_FONT_SIZE_PX)),
  terminalFontFamily: Schema.String.check(Schema.isMaxLength(256)).pipe(
    withDefaults(() => DEFAULT_TERMINAL_FONT_FAMILY),
  ),
  codexBinaryPath: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  codexHomePath: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  cursorBinaryPath: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  cursorApiEndpoint: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  antigravityBinaryPath: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  // Deprecated Gemini keys remain decodable until normalization rewrites local storage.
  geminiBinaryPath: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(4096))),
  grokBinaryPath: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  droidBinaryPath: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  kiloBinaryPath: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  kiloServerUrl: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  kiloServerPassword: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  kiloServerPasswordConfigured: Schema.Boolean.pipe(withDefaults(() => false)),
  openCodeBinaryPath: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  piBinaryPath: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  piAgentDir: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  openCodeServerUrl: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  openCodeServerPassword: Schema.String.check(Schema.isMaxLength(4096)).pipe(
    withDefaults(() => ""),
  ),
  openCodeServerPasswordConfigured: Schema.Boolean.pipe(withDefaults(() => false)),
  openCodeExperimentalWebSockets: Schema.Boolean.pipe(withDefaults(() => false)),
  openaiApiKey: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  openaiApiKeyConfigured: Schema.Boolean.pipe(withDefaults(() => false)),
  openaiBaseUrl: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  anthropicApiKey: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  anthropicApiKeyConfigured: Schema.Boolean.pipe(withDefaults(() => false)),
  anthropicBaseUrl: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  googleApiKey: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  googleApiKeyConfigured: Schema.Boolean.pipe(withDefaults(() => false)),
  googleBaseUrl: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  openrouterApiKey: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  openrouterApiKeyConfigured: Schema.Boolean.pipe(withDefaults(() => false)),
  openrouterBaseUrl: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  ollamaApiKey: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  ollamaApiKeyConfigured: Schema.Boolean.pipe(withDefaults(() => false)),
  ollamaBaseUrl: Schema.String.check(Schema.isMaxLength(4096)).pipe(
    withDefaults(() => "http://127.0.0.1:11434/v1"),
  ),
  fireworksApiKey: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  fireworksApiKeyConfigured: Schema.Boolean.pipe(withDefaults(() => false)),
  fireworksBaseUrl: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  xaiApiKey: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  xaiApiKeyConfigured: Schema.Boolean.pipe(withDefaults(() => false)),
  xaiBaseUrl: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  cohereApiKey: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  cohereApiKeyConfigured: Schema.Boolean.pipe(withDefaults(() => false)),
  cohereBaseUrl: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  togetherApiKey: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  togetherApiKeyConfigured: Schema.Boolean.pipe(withDefaults(() => false)),
  togetherBaseUrl: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  mistralApiKey: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  mistralApiKeyConfigured: Schema.Boolean.pipe(withDefaults(() => false)),
  mistralBaseUrl: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  groqApiKey: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  groqApiKeyConfigured: Schema.Boolean.pipe(withDefaults(() => false)),
  groqBaseUrl: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  deepseekApiKey: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  deepseekApiKeyConfigured: Schema.Boolean.pipe(withDefaults(() => false)),
  deepseekBaseUrl: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  opencodeZenApiKey: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  opencodeZenApiKeyConfigured: Schema.Boolean.pipe(withDefaults(() => false)),
  opencodeZenBaseUrl: Schema.String.check(Schema.isMaxLength(4096)).pipe(withDefaults(() => "")),
  defaultThreadEnvMode: EnvMode.pipe(withDefaults(() => "local" as const satisfies EnvMode)),
  confirmThreadDelete: Schema.Boolean.pipe(withDefaults(() => true)),
  confirmThreadArchive: Schema.Boolean.pipe(withDefaults(() => false)),
  confirmTerminalTabClose: Schema.Boolean.pipe(withDefaults(() => true)),
  diffWordWrap: Schema.Boolean.pipe(withDefaults(() => false)),
  showPullRequestDiffColors: Schema.Boolean.pipe(withDefaults(() => true)),
  // Local-only UI preferences for hiding sidebar surfaces a user doesn't want.
  // `showChatsSection` controls the standalone "Chats" list in the sidebar footer
  // (rootless chats not tied to a project). `showStudioSection` controls the
  // optional Studio tab in the section switcher.
  showChatsSection: Schema.Boolean.pipe(withDefaults(() => true)),
  showStudioSection: Schema.Boolean.pipe(withDefaults(() => true)),
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
  customCodexModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  customClaudeModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  customCursorModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  customAntigravityModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  customGeminiModels: Schema.optionalKey(Schema.Array(Schema.String)),
  customGrokModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  customDroidModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  customKiloModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  customOpenCodeModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  customPiModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  customEngineModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  customOpenAiModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  customAnthropicModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  customGoogleModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  customOpenRouterModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  customOllamaModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  customDeepseekModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  customGroqModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  customMistralModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  customTogetherModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  customCohereModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  customXaiModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  customFireworksModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  customOpenCodeZenModels: Schema.Array(Schema.String).pipe(withDefaults(() => [])),
  textGenerationProvider: PersistedProviderKind.pipe(withDefaults(() => "openai" as const)),
  textGenerationModel: Schema.optional(TrimmedNonEmptyString),
  uiFontFamily: Schema.String.check(Schema.isMaxLength(256)).pipe(withDefaults(() => "")),
  defaultProvider: PersistedProviderKind.pipe(withDefaults(() => "openai" as const)),
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
    (settings.textGenerationProvider ?? "openai") !== (defaults.textGenerationProvider ?? "openai") ||
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
  codex: {
    provider: "openai",
    settingsKey: "customCodexModels",
    defaultSettingsKey: "customCodexModels",
    title: "Codex",
    description: "Save additional Codex model slugs for the picker and `/model` command.",
    placeholder: "your-codex-model-slug",
    example: "gpt-6.7-codex-ultra-preview",
  },
  claudeAgent: {
    provider: "anthropic",
    settingsKey: "customClaudeModels",
    defaultSettingsKey: "customClaudeModels",
    title: "Claude",
    description: "Save additional Claude model slugs for the picker and `/model` command.",
    placeholder: "your-claude-model-slug",
    example: "claude-custom-model",
  },
  cursor: {
    provider: "openai",
    settingsKey: "customCursorModels",
    defaultSettingsKey: "customCursorModels",
    title: "Cursor",
    description: "Save additional Cursor model slugs for the picker and provider runtime.",
    placeholder: "cursor-model-slug",
    example: "composer-2",
  },
  antigravity: {
    provider: "google",
    settingsKey: "customAntigravityModels",
    defaultSettingsKey: "customAntigravityModels",
    title: "Antigravity",
    description: "Save additional Antigravity CLI base model names for the picker.",
    placeholder: "Model Name",
    example: "Gemini 4 Pro",
  },
  grok: {
    provider: "openai",
    settingsKey: "customGrokModels",
    defaultSettingsKey: "customGrokModels",
    title: "Grok",
    description: "Save additional Grok model slugs for the picker and `/model` command.",
    placeholder: "your-grok-model-slug",
    example: "grok-build-0.1",
  },
  droid: {
    provider: "openai",
    settingsKey: "customDroidModels",
    defaultSettingsKey: "customDroidModels",
    title: "Droid",
    description: "Save additional Droid model slugs for the picker and `/model` command.",
    placeholder: "your-droid-model-slug",
    example: "claude-opus-4-8",
  },
  kilo: {
    provider: "openai",
    settingsKey: "customKiloModels",
    defaultSettingsKey: "customKiloModels",
    title: "Kilo",
    description: "Save additional Kilo model slugs for the picker and provider runtime.",
    placeholder: "provider/model",
    example: "kilo/kilo-auto/free",
  },
  opencode: {
    provider: "openai",
    settingsKey: "customOpenCodeModels",
    defaultSettingsKey: "customOpenCodeModels",
    title: "OpenCode",
    description: "Save additional OpenCode model slugs for the picker and provider runtime.",
    placeholder: "provider/model",
    example: "openai/gpt-5",
  },
  pi: {
    provider: "openai",
    settingsKey: "customPiModels",
    defaultSettingsKey: "customPiModels",
    title: "Pi",
    description: "Save additional Pi model slugs for the picker and provider runtime.",
    placeholder: "provider/model",
    example: "anthropic/claude-sonnet-4-5",
  },
  engine: {
    provider: "engine",
    settingsKey: "customEngineModels",
    defaultSettingsKey: "customEngineModels",
    title: "Builder",
    description: "Save additional Builder engine model slugs for the picker.",
    placeholder: "your-engine-model-slug",
    example: "gpt-5.6-sol",
  },
  openai: {
    provider: "openai",
    settingsKey: "customOpenAiModels",
    defaultSettingsKey: "customOpenAiModels",
    title: "OpenAI",
    description: "Save additional OpenAI model slugs for the picker.",
    placeholder: "gpt-5.5",
    example: "gpt-6-mini",
  },
  anthropic: {
    provider: "anthropic",
    settingsKey: "customAnthropicModels",
    defaultSettingsKey: "customAnthropicModels",
    title: "Anthropic",
    description: "Save additional Anthropic model slugs for the picker.",
    placeholder: "claude-sonnet-5",
    example: "claude-custom-model",
  },
  google: {
    provider: "google",
    settingsKey: "customGoogleModels",
    defaultSettingsKey: "customGoogleModels",
    title: "Google",
    description: "Save additional Google model slugs for the picker.",
    placeholder: "gemini-3-flash",
    example: "gemini-3-ultra",
  },
  openrouter: {
    provider: "openrouter",
    settingsKey: "customOpenRouterModels",
    defaultSettingsKey: "customOpenRouterModels",
    title: "OpenRouter",
    description: "Save additional OpenRouter model slugs for the picker.",
    placeholder: "provider/model",
    example: "anthropic/claude-sonnet-5",
  },
  ollama: {
    provider: "ollama",
    settingsKey: "customOllamaModels",
    defaultSettingsKey: "customOllamaModels",
    title: "Ollama",
    description: "Save additional Ollama model names for the picker.",
    placeholder: "model-name",
    example: "llama3.3",
  },
  deepseek: {
    provider: "deepseek",
    settingsKey: "customDeepseekModels",
    defaultSettingsKey: "customDeepseekModels",
    title: "DeepSeek",
    description: "Save additional DeepSeek model slugs for the picker.",
    placeholder: "your-deepseek-model-slug",
    example: "deepseek-v3",
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
  mistral: {
    provider: "mistral",
    settingsKey: "customMistralModels",
    defaultSettingsKey: "customMistralModels",
    title: "Mistral",
    description: "Save additional Mistral model slugs for the picker.",
    placeholder: "your-mistral-model-slug",
    example: "mistral-large-latest",
  },
  together: {
    provider: "together",
    settingsKey: "customTogetherModels",
    defaultSettingsKey: "customTogetherModels",
    title: "Together",
    description: "Save additional Together model slugs for the picker.",
    placeholder: "provider/model",
    example: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  },
  cohere: {
    provider: "cohere",
    settingsKey: "customCohereModels",
    defaultSettingsKey: "customCohereModels",
    title: "Cohere",
    description: "Save additional Cohere model slugs for the picker.",
    placeholder: "your-cohere-model-slug",
    example: "command-r-plus",
  },
  xai: {
    provider: "xai",
    settingsKey: "customXaiModels",
    defaultSettingsKey: "customXaiModels",
    title: "xAI",
    description: "Save additional xAI model slugs for the picker.",
    placeholder: "your-xai-model-slug",
    example: "grok-3",
  },
  fireworks: {
    provider: "fireworks",
    settingsKey: "customFireworksModels",
    defaultSettingsKey: "customFireworksModels",
    title: "Fireworks",
    description: "Save additional Fireworks model slugs for the picker.",
    placeholder: "provider/model",
    example: "accounts/fireworks/models/llama-v3-70b-instruct",
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
};

export const MODEL_PROVIDER_SETTINGS = Object.values(PROVIDER_CUSTOM_MODEL_CONFIG);

// Droid's ACP catalog is authoritative and rejects unknown slugs. Preserve its
// persisted config for compatibility, but do not offer an editor it cannot honor.
export const CUSTOM_MODEL_EDITOR_PROVIDER_SETTINGS = MODEL_PROVIDER_SETTINGS.filter(
  (config) => config.provider !== "openai",
);

export function normalizeCustomModelSlugs(
  models: Iterable<string | null | undefined> | null | undefined,
  provider: ProviderKind = "openai",
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

function normalizeProviderBinaryPathOverride(
  provider: ProviderKind,
  value: string | null | undefined,
): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed === (DEFAULT_SERVER_SETTINGS.providers as any)[provider]?.binaryPath) {
    return "";
  }
  return trimmed;
}

function normalizeAppSettings(settings: AppSettings): AppSettings {
  const {
    geminiBinaryPath: legacyGeminiBinaryPath,
    customGeminiModels: legacyCustomGeminiModels,
    ...currentSettings
  } = settings;
  return {
    ...currentSettings,
    // Password & API key fields are accepted only as write-only update patches. Never retain
    // reusable provider credentials in browser state or localStorage.
    kiloServerPassword: "",
    openCodeServerPassword: "",
    openaiApiKey: "",
    anthropicApiKey: "",
    googleApiKey: "",
    openrouterApiKey: "",
    ollamaApiKey: "",
    fireworksApiKey: "",
    xaiApiKey: "",
    cohereApiKey: "",
    togetherApiKey: "",
    mistralApiKey: "",
    groqApiKey: "",
    deepseekApiKey: "",
    opencodeZenApiKey: "",
    claudeBinaryPath: normalizeProviderBinaryPathOverride("anthropic", settings.claudeBinaryPath),
    codexBinaryPath: normalizeProviderBinaryPathOverride("openai", settings.codexBinaryPath),
    cursorBinaryPath: normalizeProviderBinaryPathOverride("openai", settings.cursorBinaryPath),
    antigravityBinaryPath: normalizeProviderBinaryPathOverride(
      "google",
      settings.antigravityBinaryPath || legacyGeminiBinaryPath,
    ),
    grokBinaryPath: normalizeProviderBinaryPathOverride("openai", settings.grokBinaryPath),
    droidBinaryPath: normalizeProviderBinaryPathOverride("openai", settings.droidBinaryPath),
    kiloBinaryPath: normalizeProviderBinaryPathOverride("openai", settings.kiloBinaryPath),
    openCodeBinaryPath: normalizeProviderBinaryPathOverride(
      "openai",
      settings.openCodeBinaryPath,
    ),
    piBinaryPath: normalizeProviderBinaryPathOverride("openai", settings.piBinaryPath),
    uiDensity: normalizeUiDensityValue(settings.uiDensity),
    chatFontSizePx: normalizeChatFontSizePx(settings.chatFontSizePx),
    terminalFontSizePx: normalizeTerminalFontSizePx(settings.terminalFontSizePx),
    terminalFontFamily: normalizeTerminalFontFamily(settings.terminalFontFamily),
    customCodexModels: normalizeCustomModelSlugs(settings.customCodexModels, "openai"),
    customClaudeModels: normalizeCustomModelSlugs(settings.customClaudeModels, "anthropic"),
    customCursorModels: normalizeCustomModelSlugs(settings.customCursorModels, "openai"),
    customAntigravityModels: normalizeCustomModelSlugs(
      [...settings.customAntigravityModels, ...(legacyCustomGeminiModels ?? [])],
      "google",
    ),
    customGrokModels: normalizeCustomModelSlugs(settings.customGrokModels, "openai"),
    customDroidModels: normalizeCustomModelSlugs(settings.customDroidModels, "openai"),
    customKiloModels: normalizeCustomModelSlugs(settings.customKiloModels, "openai"),
    customOpenCodeModels: normalizeCustomModelSlugs(settings.customOpenCodeModels, "openai"),
    customPiModels: normalizeCustomModelSlugs(settings.customPiModels, "openai"),
    customOpenAiModels: normalizeCustomModelSlugs(settings.customOpenAiModels, "openai"),
    customAnthropicModels: normalizeCustomModelSlugs(settings.customAnthropicModels, "anthropic"),
    customGoogleModels: normalizeCustomModelSlugs(settings.customGoogleModels, "google"),
    customOpenRouterModels: normalizeCustomModelSlugs(
      settings.customOpenRouterModels,
      "openrouter",
    ),
    customOllamaModels: normalizeCustomModelSlugs(settings.customOllamaModels, "ollama"),
    customDeepseekModels: normalizeCustomModelSlugs(settings.customDeepseekModels, "deepseek"),
    customGroqModels: normalizeCustomModelSlugs(settings.customGroqModels, "groq"),
    customMistralModels: normalizeCustomModelSlugs(settings.customMistralModels, "mistral"),
    customTogetherModels: normalizeCustomModelSlugs(settings.customTogetherModels, "together"),
    customCohereModels: normalizeCustomModelSlugs(settings.customCohereModels, "cohere"),
    customXaiModels: normalizeCustomModelSlugs(settings.customXaiModels, "xai"),
    customFireworksModels: normalizeCustomModelSlugs(settings.customFireworksModels, "fireworks"),
    customOpenCodeZenModels: normalizeCustomModelSlugs(
      settings.customOpenCodeZenModels,
      "opencodeZen",
    ),
    hiddenProviders: normalizeHiddenProviders(settings.hiddenProviders),
    providerOrder: normalizeProviderOrder(settings.providerOrder),
    hiddenModels: [],
  };
}

function serverSettingsToAppSettings(settings: ServerSettingsView): Partial<AppSettings> {
  return {
    claudeBinaryPath: (settings.providers as any).claudeAgent?.binaryPath,
    codexBinaryPath: (settings.providers as any).codex?.binaryPath,
    codexHomePath: (settings.providers as any).codex?.homePath,
    cursorApiEndpoint: (settings.providers as any).cursor?.apiEndpoint,
    cursorBinaryPath: (settings.providers as any).cursor?.binaryPath,
    defaultThreadEnvMode: settings.defaultThreadEnvMode,
    enableAssistantStreaming: settings.enableAssistantStreaming,
    enableProviderUpdateChecks: settings.enableProviderUpdateChecks,
    antigravityBinaryPath: (settings.providers as any).antigravity?.binaryPath,
    grokBinaryPath: (settings.providers as any).grok?.binaryPath,
    droidBinaryPath: (settings.providers as any).droid?.binaryPath,
    kiloBinaryPath: (settings.providers as any).kilo?.binaryPath,
    kiloServerPasswordConfigured: (settings.providers as any).kilo?.serverPasswordConfigured,
    kiloServerUrl: (settings.providers as any).kilo?.serverUrl,
    openCodeBinaryPath: (settings.providers as any).opencode?.binaryPath,
    openCodeExperimentalWebSockets: (settings.providers as any).opencode?.experimentalWebSockets,
    openCodeServerPasswordConfigured: (settings.providers as any).opencode?.serverPasswordConfigured,
    openCodeServerUrl: (settings.providers as any).opencode?.serverUrl,
    piAgentDir: (settings.providers as any).pi?.agentDir,
    piBinaryPath: (settings.providers as any).pi?.binaryPath,
    customCodexModels: (settings.providers as any).codex?.customModels,
    customClaudeModels: (settings.providers as any).claudeAgent?.customModels,
    customCursorModels: (settings.providers as any).cursor?.customModels,
    customAntigravityModels: (settings.providers as any).antigravity?.customModels,
    customGrokModels: (settings.providers as any).grok?.customModels,
    customDroidModels: (settings.providers as any).droid?.customModels,
    customKiloModels: (settings.providers as any).kilo?.customModels,
    customOpenCodeModels: (settings.providers as any).opencode?.customModels,
    customPiModels: (settings.providers as any).pi?.customModels,
    customOpenAiModels: settings.providers.openai.customModels,
    customAnthropicModels: settings.providers.anthropic.customModels,
    customGoogleModels: settings.providers.google.customModels,
    customOpenRouterModels: settings.providers.openrouter.customModels,
    customOllamaModels: settings.providers.ollama.customModels,
    customDeepseekModels: settings.providers.deepseek.customModels,
    customGroqModels: settings.providers.groq.customModels,
    customMistralModels: settings.providers.mistral.customModels,
    customTogetherModels: settings.providers.together.customModels,
    customCohereModels: settings.providers.cohere.customModels,
    customXaiModels: settings.providers.xai.customModels,
    customFireworksModels: settings.providers.fireworks.customModels,
    customOpenCodeZenModels: settings.providers.opencodeZen.customModels,
    openaiApiKeyConfigured: settings.providers.openai.apiKeyConfigured,
    openaiBaseUrl: settings.providers.openai.baseUrl,
    anthropicApiKeyConfigured: settings.providers.anthropic.apiKeyConfigured,
    anthropicBaseUrl: settings.providers.anthropic.baseUrl,
    googleApiKeyConfigured: settings.providers.google.apiKeyConfigured,
    googleBaseUrl: settings.providers.google.baseUrl,
    openrouterApiKeyConfigured: settings.providers.openrouter.apiKeyConfigured,
    openrouterBaseUrl: settings.providers.openrouter.baseUrl,
    ollamaApiKeyConfigured: settings.providers.ollama.apiKeyConfigured,
    ollamaBaseUrl: settings.providers.ollama.baseUrl,
    fireworksApiKeyConfigured: settings.providers.fireworks.apiKeyConfigured,
    fireworksBaseUrl: settings.providers.fireworks.baseUrl,
    xaiApiKeyConfigured: settings.providers.xai.apiKeyConfigured,
    xaiBaseUrl: settings.providers.xai.baseUrl,
    cohereApiKeyConfigured: settings.providers.cohere.apiKeyConfigured,
    cohereBaseUrl: settings.providers.cohere.baseUrl,
    togetherApiKeyConfigured: settings.providers.together.apiKeyConfigured,
    togetherBaseUrl: settings.providers.together.baseUrl,
    mistralApiKeyConfigured: settings.providers.mistral.apiKeyConfigured,
    mistralBaseUrl: settings.providers.mistral.baseUrl,
    groqApiKeyConfigured: settings.providers.groq.apiKeyConfigured,
    groqBaseUrl: settings.providers.groq.baseUrl,
    deepseekApiKeyConfigured: settings.providers.deepseek.apiKeyConfigured,
    deepseekBaseUrl: settings.providers.deepseek.baseUrl,
    opencodeZenApiKeyConfigured: settings.providers.opencodeZen.apiKeyConfigured,
    opencodeZenBaseUrl: settings.providers.opencodeZen.baseUrl,
    textGenerationProvider: settings.textGenerationModelSelection.provider,
    textGenerationModel: settings.textGenerationModelSelection.model,
  };
}

function resolveTextGenerationProvider(input: {
  readonly provider?: ProviderKind | null;
  readonly model?: string | null;
}): ProviderKind {
  if (input.provider) {
    return input.provider;
  }
  const model = input.model;
  return model?.includes("/") ? "openai" : "openai";
}

function hasOwn<Key extends keyof AppSettings>(patch: Partial<AppSettings>, key: Key): boolean {
  return Object.prototype.hasOwnProperty.call(patch, key);
}

function touchesProviderDiscoverySettings(patch: Partial<AppSettings>): boolean {
  return (
    hasOwn(patch, "kiloBinaryPath") ||
    hasOwn(patch, "kiloServerPassword") ||
    hasOwn(patch, "kiloServerUrl") ||
    hasOwn(patch, "openCodeBinaryPath") ||
    hasOwn(patch, "openCodeExperimentalWebSockets") ||
    hasOwn(patch, "openCodeServerPassword") ||
    hasOwn(patch, "openCodeServerUrl") ||
    hasOwn(patch, "piAgentDir") ||
    hasOwn(patch, "openaiApiKey") ||
    hasOwn(patch, "openaiBaseUrl") ||
    hasOwn(patch, "anthropicApiKey") ||
    hasOwn(patch, "anthropicBaseUrl") ||
    hasOwn(patch, "googleApiKey") ||
    hasOwn(patch, "googleBaseUrl") ||
    hasOwn(patch, "openrouterApiKey") ||
    hasOwn(patch, "openrouterBaseUrl") ||
    hasOwn(patch, "ollamaApiKey") ||
    hasOwn(patch, "ollamaBaseUrl") ||
    hasOwn(patch, "deepseekApiKey") ||
    hasOwn(patch, "deepseekBaseUrl") ||
    hasOwn(patch, "opencodeZenApiKey") ||
    hasOwn(patch, "opencodeZenBaseUrl")
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
      provider: resolveTextGenerationProvider({
        ...(patch.textGenerationProvider !== undefined
          ? { provider: patch.textGenerationProvider }
          : {}),
        model,
      }),
      model,
    };
  }

  if (
    hasOwn(patch, "codexBinaryPath") ||
    hasOwn(patch, "codexHomePath") ||
    hasOwn(patch, "customCodexModels")
  ) {
    (providers as any).codex = {
      ...(hasOwn(patch, "codexBinaryPath") ? { binaryPath: patch.codexBinaryPath ?? "" } : {}),
      ...(hasOwn(patch, "codexHomePath") ? { homePath: patch.codexHomePath ?? "" } : {}),
      ...(hasOwn(patch, "customCodexModels")
        ? { customModels: patch.customCodexModels ?? [] }
        : {}),
    };
  }
  if (hasOwn(patch, "claudeBinaryPath") || hasOwn(patch, "customClaudeModels")) {
    (providers as any).claudeAgent = {
      ...(hasOwn(patch, "claudeBinaryPath") ? { binaryPath: patch.claudeBinaryPath ?? "" } : {}),
      ...(hasOwn(patch, "customClaudeModels")
        ? { customModels: patch.customClaudeModels ?? [] }
        : {}),
    };
  }
  if (
    hasOwn(patch, "cursorApiEndpoint") ||
    hasOwn(patch, "cursorBinaryPath") ||
    hasOwn(patch, "customCursorModels")
  ) {
    (providers as any).cursor = {
      ...(hasOwn(patch, "cursorApiEndpoint") ? { apiEndpoint: patch.cursorApiEndpoint ?? "" } : {}),
      ...(hasOwn(patch, "cursorBinaryPath") ? { binaryPath: patch.cursorBinaryPath ?? "" } : {}),
      ...(hasOwn(patch, "customCursorModels")
        ? { customModels: patch.customCursorModels ?? [] }
        : {}),
    };
  }
  if (hasOwn(patch, "antigravityBinaryPath") || hasOwn(patch, "customAntigravityModels")) {
    (providers as any).antigravity = {
      ...(hasOwn(patch, "antigravityBinaryPath")
        ? { binaryPath: patch.antigravityBinaryPath ?? "" }
        : {}),
      ...(hasOwn(patch, "customAntigravityModels")
        ? { customModels: patch.customAntigravityModels ?? [] }
        : {}),
    };
  }
  if (hasOwn(patch, "grokBinaryPath") || hasOwn(patch, "customGrokModels")) {
    (providers as any).grok = {
      ...(hasOwn(patch, "grokBinaryPath") ? { binaryPath: patch.grokBinaryPath ?? "" } : {}),
      ...(hasOwn(patch, "customGrokModels") ? { customModels: patch.customGrokModels ?? [] } : {}),
    };
  }
  if (hasOwn(patch, "droidBinaryPath") || hasOwn(patch, "customDroidModels")) {
    (providers as any).droid = {
      ...(hasOwn(patch, "droidBinaryPath") ? { binaryPath: patch.droidBinaryPath ?? "" } : {}),
      ...(hasOwn(patch, "customDroidModels")
        ? { customModels: patch.customDroidModels ?? [] }
        : {}),
    };
  }
  if (
    hasOwn(patch, "kiloBinaryPath") ||
    hasOwn(patch, "kiloServerUrl") ||
    hasOwn(patch, "kiloServerPassword") ||
    hasOwn(patch, "customKiloModels")
  ) {
    (providers as any).kilo = {
      ...(hasOwn(patch, "kiloBinaryPath") ? { binaryPath: patch.kiloBinaryPath ?? "" } : {}),
      ...(hasOwn(patch, "kiloServerUrl") ? { serverUrl: patch.kiloServerUrl ?? "" } : {}),
      ...(hasOwn(patch, "kiloServerPassword")
        ? { serverPassword: patch.kiloServerPassword ?? "" }
        : {}),
      ...(hasOwn(patch, "customKiloModels") ? { customModels: patch.customKiloModels ?? [] } : {}),
    };
  }
  if (
    hasOwn(patch, "openCodeBinaryPath") ||
    hasOwn(patch, "openCodeExperimentalWebSockets") ||
    hasOwn(patch, "openCodeServerUrl") ||
    hasOwn(patch, "openCodeServerPassword") ||
    hasOwn(patch, "customOpenCodeModels")
  ) {
    (providers as any).opencode = {
      ...(hasOwn(patch, "openCodeBinaryPath")
        ? { binaryPath: patch.openCodeBinaryPath ?? "" }
        : {}),
      ...(hasOwn(patch, "openCodeExperimentalWebSockets")
        ? { experimentalWebSockets: Boolean(patch.openCodeExperimentalWebSockets) }
        : {}),
      ...(hasOwn(patch, "openCodeServerUrl") ? { serverUrl: patch.openCodeServerUrl ?? "" } : {}),
      ...(hasOwn(patch, "openCodeServerPassword")
        ? { serverPassword: patch.openCodeServerPassword ?? "" }
        : {}),
      ...(hasOwn(patch, "customOpenCodeModels")
        ? { customModels: patch.customOpenCodeModels ?? [] }
        : {}),
    };
  }
  if (
    hasOwn(patch, "piAgentDir") ||
    hasOwn(patch, "piBinaryPath") ||
    hasOwn(patch, "customPiModels")
  ) {
    (providers as any).pi = {
      ...(hasOwn(patch, "piAgentDir") ? { agentDir: patch.piAgentDir ?? "" } : {}),
      ...(hasOwn(patch, "piBinaryPath") ? { binaryPath: patch.piBinaryPath ?? "" } : {}),
      ...(hasOwn(patch, "customPiModels") ? { customModels: patch.customPiModels ?? [] } : {}),
    };
  }
  if (
    hasOwn(patch, "openaiApiKey") ||
    hasOwn(patch, "openaiBaseUrl") ||
    hasOwn(patch, "customOpenAiModels")
  ) {
    providers.openai = {
      ...(hasOwn(patch, "openaiApiKey") ? { apiKey: patch.openaiApiKey ?? "" } : {}),
      ...(hasOwn(patch, "openaiBaseUrl") ? { baseUrl: patch.openaiBaseUrl ?? "" } : {}),
      ...(hasOwn(patch, "customOpenAiModels")
        ? { customModels: patch.customOpenAiModels ?? [] }
        : {}),
    };
  }
  if (
    hasOwn(patch, "anthropicApiKey") ||
    hasOwn(patch, "anthropicBaseUrl") ||
    hasOwn(patch, "customAnthropicModels")
  ) {
    providers.anthropic = {
      ...(hasOwn(patch, "anthropicApiKey") ? { apiKey: patch.anthropicApiKey ?? "" } : {}),
      ...(hasOwn(patch, "anthropicBaseUrl") ? { baseUrl: patch.anthropicBaseUrl ?? "" } : {}),
      ...(hasOwn(patch, "customAnthropicModels")
        ? { customModels: patch.customAnthropicModels ?? [] }
        : {}),
    };
  }
  if (
    hasOwn(patch, "googleApiKey") ||
    hasOwn(patch, "googleBaseUrl") ||
    hasOwn(patch, "customGoogleModels")
  ) {
    providers.google = {
      ...(hasOwn(patch, "googleApiKey") ? { apiKey: patch.googleApiKey ?? "" } : {}),
      ...(hasOwn(patch, "googleBaseUrl") ? { baseUrl: patch.googleBaseUrl ?? "" } : {}),
      ...(hasOwn(patch, "customGoogleModels")
        ? { customModels: patch.customGoogleModels ?? [] }
        : {}),
    };
  }
  if (
    hasOwn(patch, "openrouterApiKey") ||
    hasOwn(patch, "openrouterBaseUrl") ||
    hasOwn(patch, "customOpenRouterModels")
  ) {
    providers.openrouter = {
      ...(hasOwn(patch, "openrouterApiKey") ? { apiKey: patch.openrouterApiKey ?? "" } : {}),
      ...(hasOwn(patch, "openrouterBaseUrl") ? { baseUrl: patch.openrouterBaseUrl ?? "" } : {}),
      ...(hasOwn(patch, "customOpenRouterModels")
        ? { customModels: patch.customOpenRouterModels ?? [] }
        : {}),
    };
  }
  if (
    hasOwn(patch, "ollamaApiKey") ||
    hasOwn(patch, "ollamaBaseUrl") ||
    hasOwn(patch, "customOllamaModels")
  ) {
    providers.ollama = {
      ...(hasOwn(patch, "ollamaApiKey") ? { apiKey: patch.ollamaApiKey ?? "" } : {}),
      ...(hasOwn(patch, "ollamaBaseUrl") ? { baseUrl: patch.ollamaBaseUrl ?? "" } : {}),
      ...(hasOwn(patch, "customOllamaModels")
        ? { customModels: patch.customOllamaModels ?? [] }
        : {}),
    };
  }

  if (
    hasOwn(patch, "groqApiKey") ||
    hasOwn(patch, "groqBaseUrl")
  ) {
    providers.groq = {
      ...(hasOwn(patch, "groqApiKey") ? { apiKey: patch.groqApiKey ?? "" } : {}),
      ...(hasOwn(patch, "groqBaseUrl") ? { baseUrl: patch.groqBaseUrl ?? "" } : {}),
    };
  }

  if (
    hasOwn(patch, "mistralApiKey") ||
    hasOwn(patch, "mistralBaseUrl")
  ) {
    providers.mistral = {
      ...(hasOwn(patch, "mistralApiKey") ? { apiKey: patch.mistralApiKey ?? "" } : {}),
      ...(hasOwn(patch, "mistralBaseUrl") ? { baseUrl: patch.mistralBaseUrl ?? "" } : {}),
    };
  }

  if (
    hasOwn(patch, "togetherApiKey") ||
    hasOwn(patch, "togetherBaseUrl")
  ) {
    providers.together = {
      ...(hasOwn(patch, "togetherApiKey") ? { apiKey: patch.togetherApiKey ?? "" } : {}),
      ...(hasOwn(patch, "togetherBaseUrl") ? { baseUrl: patch.togetherBaseUrl ?? "" } : {}),
    };
  }

  if (
    hasOwn(patch, "cohereApiKey") ||
    hasOwn(patch, "cohereBaseUrl")
  ) {
    providers.cohere = {
      ...(hasOwn(patch, "cohereApiKey") ? { apiKey: patch.cohereApiKey ?? "" } : {}),
      ...(hasOwn(patch, "cohereBaseUrl") ? { baseUrl: patch.cohereBaseUrl ?? "" } : {}),
    };
  }

  if (
    hasOwn(patch, "xaiApiKey") ||
    hasOwn(patch, "xaiBaseUrl")
  ) {
    providers.xai = {
      ...(hasOwn(patch, "xaiApiKey") ? { apiKey: patch.xaiApiKey ?? "" } : {}),
      ...(hasOwn(patch, "xaiBaseUrl") ? { baseUrl: patch.xaiBaseUrl ?? "" } : {}),
    };
  }

  if (
    hasOwn(patch, "fireworksApiKey") ||
    hasOwn(patch, "fireworksBaseUrl")
  ) {
    providers.fireworks = {
      ...(hasOwn(patch, "fireworksApiKey") ? { apiKey: patch.fireworksApiKey ?? "" } : {}),
      ...(hasOwn(patch, "fireworksBaseUrl") ? { baseUrl: patch.fireworksBaseUrl ?? "" } : {}),
    };
  }

  if (
    hasOwn(patch, "opencodeZenApiKey") ||
    hasOwn(patch, "opencodeZenBaseUrl")
  ) {
    providers.opencodeZen = {
      ...(hasOwn(patch, "opencodeZenApiKey") ? { apiKey: patch.opencodeZenApiKey ?? "" } : {}),
      ...(hasOwn(patch, "opencodeZenBaseUrl")
        ? { baseUrl: patch.opencodeZenBaseUrl ?? "" }
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
    "claudeBinaryPath",
    "codexBinaryPath",
    "codexHomePath",
    "cursorApiEndpoint",
    "cursorBinaryPath",
    "defaultThreadEnvMode",
    "enableAssistantStreaming",
    "enableProviderUpdateChecks",
    "antigravityBinaryPath",
    "grokBinaryPath",
    "droidBinaryPath",
    "kiloBinaryPath",
    "kiloServerPassword",
    "kiloServerUrl",
    "openCodeBinaryPath",
    "openCodeExperimentalWebSockets",
    "openCodeServerPassword",
    "openCodeServerUrl",
    "piAgentDir",
    "piBinaryPath",
    "openaiApiKey",
    "openaiBaseUrl",
    "anthropicApiKey",
    "anthropicBaseUrl",
    "googleApiKey",
    "googleBaseUrl",
    "openrouterApiKey",
    "openrouterBaseUrl",
    "ollamaApiKey",
    "ollamaBaseUrl",
    "fireworksApiKey",
    "fireworksBaseUrl",
    "xaiApiKey",
    "xaiBaseUrl",
    "cohereApiKey",
    "cohereBaseUrl",
    "togetherApiKey",
    "togetherBaseUrl",
    "mistralApiKey",
    "mistralBaseUrl",
    "groqApiKey",
    "groqBaseUrl",
    "deepseekApiKey",
    "deepseekBaseUrl",
    "opencodeZenApiKey",
    "opencodeZenBaseUrl",
    "textGenerationModel",
    "textGenerationProvider",
  ] as const) {
    if (normalizedSettings[key] !== defaults[key]) {
      patch[key] = normalizedSettings[key] as never;
    }
  }

  // Migrate legacy browser-stored passwords once before normalizeAppSettings
  // scrubs them from local state. All subsequent reads use redacted server views.
  if (settings.kiloServerPassword.trim()) {
    patch.kiloServerPassword = settings.kiloServerPassword;
  }
  if (settings.openCodeServerPassword.trim()) {
    patch.openCodeServerPassword = settings.openCodeServerPassword;
  }
  if (settings.openaiApiKey.trim()) {
    patch.openaiApiKey = settings.openaiApiKey;
  }
  if (settings.anthropicApiKey.trim()) {
    patch.anthropicApiKey = settings.anthropicApiKey;
  }
  if (settings.googleApiKey.trim()) {
    patch.googleApiKey = settings.googleApiKey;
  }
  if (settings.openrouterApiKey.trim()) {
    patch.openrouterApiKey = settings.openrouterApiKey;
  }
  if (settings.ollamaApiKey.trim()) {
    patch.ollamaApiKey = settings.ollamaApiKey;
  }
  if (settings.fireworksApiKey.trim()) {
    patch.fireworksApiKey = settings.fireworksApiKey;
  }
  if (settings.xaiApiKey.trim()) {
    patch.xaiApiKey = settings.xaiApiKey;
  }
  if (settings.cohereApiKey.trim()) {
    patch.cohereApiKey = settings.cohereApiKey;
  }
  if (settings.togetherApiKey.trim()) {
    patch.togetherApiKey = settings.togetherApiKey;
  }
  if (settings.mistralApiKey.trim()) {
    patch.mistralApiKey = settings.mistralApiKey;
  }
  if (settings.groqApiKey.trim()) {
    patch.groqApiKey = settings.groqApiKey;
  }
  if (settings.deepseekApiKey.trim()) {
    patch.deepseekApiKey = settings.deepseekApiKey;
  }
  if (settings.opencodeZenApiKey.trim()) {
    patch.opencodeZenApiKey = settings.opencodeZenApiKey;
  }

  for (const key of [
    "customCodexModels",
    "customClaudeModels",
    "customCursorModels",
    "customAntigravityModels",
    "customGrokModels",
    "customDroidModels",
    "customKiloModels",
    "customOpenCodeModels",
    "customPiModels",
    "customOpenAiModels",
    "customAnthropicModels",
    "customGoogleModels",
    "customOpenRouterModels",
    "customOllamaModels",
    "customDeepseekModels",
    "customGroqModels",
    "customMistralModels",
    "customTogetherModels",
    "customCohereModels",
    "customXaiModels",
    "customFireworksModels",
    "customOpenCodeZenModels",
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
    codex: getCustomModelsForProvider(settings, "openai"),
    claudeAgent: getCustomModelsForProvider(settings, "anthropic"),
    cursor: getCustomModelsForProvider(settings, "openai"),
    antigravity: getCustomModelsForProvider(settings, "google"),
    grok: getCustomModelsForProvider(settings, "openai"),
    droid: getCustomModelsForProvider(settings, "openai"),
    kilo: getCustomModelsForProvider(settings, "openai"),
    opencode: getCustomModelsForProvider(settings, "openai"),
    pi: getCustomModelsForProvider(settings, "openai"),
    engine: getCustomModelsForProvider(settings, "engine"),
    openai: getCustomModelsForProvider(settings, "openai"),
    anthropic: getCustomModelsForProvider(settings, "anthropic"),
    google: getCustomModelsForProvider(settings, "google"),
    openrouter: getCustomModelsForProvider(settings, "openrouter"),
    ollama: getCustomModelsForProvider(settings, "ollama"),
    deepseek: getCustomModelsForProvider(settings, "deepseek"),
    groq: getCustomModelsForProvider(settings, "groq"),
    mistral: getCustomModelsForProvider(settings, "mistral"),
    together: getCustomModelsForProvider(settings, "together"),
    cohere: getCustomModelsForProvider(settings, "cohere"),
    xai: getCustomModelsForProvider(settings, "xai"),
    fireworks: getCustomModelsForProvider(settings, "fireworks"),
    opencodeZen: getCustomModelsForProvider(settings, "opencodeZen"),
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
    provider === "openai"
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

type GitTextGenerationDiscoveredProvider = "openai" | "openai" | "openai";

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
    | "customCodexModels"
    | "customKiloModels"
    | "customOpenCodeModels"
    | "textGenerationModel"
    | "textGenerationProvider"
  >,
  discoveredOptionsByProvider?: Partial<
    Record<
      GitTextGenerationDiscoveredProvider,
      ReadonlyArray<ProviderModelOption & { isCustom?: boolean }>
    >
  >,
): AppModelOption[] {
  const options = [
    ...(discoveredOptionsByProvider?.codex
      ? mapCatalogModelOptionsToAppModelOptions("openai", discoveredOptionsByProvider.codex)
      : getAppModelOptions("openai", settings.customCodexModels)),
    ...(discoveredOptionsByProvider?.kilo
      ? mapCatalogModelOptionsToAppModelOptions("openai", discoveredOptionsByProvider.kilo)
      : getAppModelOptions("openai", settings.customKiloModels)),
    ...(discoveredOptionsByProvider?.opencode
      ? mapCatalogModelOptionsToAppModelOptions("openai", discoveredOptionsByProvider.opencode)
      : getAppModelOptions("openai", settings.customOpenCodeModels)),
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
  const selectedProvider =
    settings.textGenerationProvider ??
    resolveTextGenerationProvider(selectedModel !== undefined ? { model: selectedModel } : {});
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
    codex: getAppModelOptions("openai", customModelsByProvider.codex),
    claudeAgent: getAppModelOptions("anthropic", customModelsByProvider.claudeAgent),
    cursor: getAppModelOptions("openai", customModelsByProvider.cursor),
    antigravity: getAppModelOptions("google", customModelsByProvider.antigravity),
    grok: getAppModelOptions("openai", customModelsByProvider.grok),
    droid: getAppModelOptions("openai", customModelsByProvider.droid),
    kilo: getAppModelOptions("openai", customModelsByProvider.kilo),
    opencode: getAppModelOptions("openai", customModelsByProvider.opencode),
    pi: getAppModelOptions("openai", customModelsByProvider.pi),
    engine: getAppModelOptions("engine", customModelsByProvider.engine),
    openai: getAppModelOptions("openai", customModelsByProvider.openai),
    anthropic: getAppModelOptions("anthropic", customModelsByProvider.anthropic),
    google: getAppModelOptions("google", customModelsByProvider.google),
    openrouter: getAppModelOptions("openrouter", customModelsByProvider.openrouter),
    ollama: getAppModelOptions("ollama", customModelsByProvider.ollama),
    deepseek: getAppModelOptions("deepseek", customModelsByProvider.deepseek),
    groq: getAppModelOptions("groq", customModelsByProvider.groq),
    mistral: getAppModelOptions("mistral", customModelsByProvider.mistral),
    together: getAppModelOptions("together", customModelsByProvider.together),
    cohere: getAppModelOptions("cohere", customModelsByProvider.cohere),
    xai: getAppModelOptions("xai", customModelsByProvider.xai),
    fireworks: getAppModelOptions("fireworks", customModelsByProvider.fireworks),
    opencodeZen: getAppModelOptions("opencodeZen", customModelsByProvider.opencodeZen),
  };
}

export function getProviderStartOptions(
  settings: Pick<
    AppSettings,
    | "claudeBinaryPath"
    | "codexBinaryPath"
    | "codexHomePath"
    | "cursorApiEndpoint"
    | "cursorBinaryPath"
    | "antigravityBinaryPath"
    | "grokBinaryPath"
    | "droidBinaryPath"
    | "kiloBinaryPath"
    | "kiloServerUrl"
    | "openCodeBinaryPath"
    | "openCodeExperimentalWebSockets"
    | "openCodeServerUrl"
    | "piAgentDir"
    | "piBinaryPath"
  >,
): ProviderStartOptions | undefined {
  const claudeBinaryPath = normalizeProviderBinaryPathOverride(
    "anthropic",
    settings.claudeBinaryPath,
  );
  const codexBinaryPath = normalizeProviderBinaryPathOverride("openai", settings.codexBinaryPath);
  const cursorBinaryPath = normalizeProviderBinaryPathOverride("openai", settings.cursorBinaryPath);
  const antigravityBinaryPath = normalizeProviderBinaryPathOverride(
    "google",
    settings.antigravityBinaryPath,
  );
  const grokBinaryPath = normalizeProviderBinaryPathOverride("openai", settings.grokBinaryPath);
  const droidBinaryPath = normalizeProviderBinaryPathOverride("openai", settings.droidBinaryPath);
  const kiloBinaryPath = normalizeProviderBinaryPathOverride("openai", settings.kiloBinaryPath);
  const openCodeBinaryPath = normalizeProviderBinaryPathOverride(
    "openai",
    settings.openCodeBinaryPath,
  );
  const piBinaryPath = normalizeProviderBinaryPathOverride("openai", settings.piBinaryPath);
  const hasOpenCodeStartOptions = Boolean(
    openCodeBinaryPath || settings.openCodeExperimentalWebSockets || settings.openCodeServerUrl,
  );
  const providerOptions: ProviderStartOptions = {
    ...(codexBinaryPath || settings.codexHomePath
      ? {
          codex: {
            ...(codexBinaryPath ? { binaryPath: codexBinaryPath } : {}),
            ...(settings.codexHomePath ? { homePath: settings.codexHomePath } : {}),
          },
        }
      : {}),
    ...(claudeBinaryPath
      ? {
          claudeAgent: {
            binaryPath: claudeBinaryPath,
          },
        }
      : {}),
    ...(cursorBinaryPath || settings.cursorApiEndpoint
      ? {
          cursor: {
            ...(cursorBinaryPath ? { binaryPath: cursorBinaryPath } : {}),
            ...(settings.cursorApiEndpoint ? { apiEndpoint: settings.cursorApiEndpoint } : {}),
          },
        }
      : {}),
    ...(antigravityBinaryPath
      ? {
          antigravity: {
            binaryPath: antigravityBinaryPath,
          },
        }
      : {}),
    ...(grokBinaryPath
      ? {
          grok: {
            binaryPath: grokBinaryPath,
          },
        }
      : {}),
    ...(droidBinaryPath
      ? {
          droid: {
            binaryPath: droidBinaryPath,
          },
        }
      : {}),
    ...(kiloBinaryPath || settings.kiloServerUrl
      ? {
          kilo: {
            ...(kiloBinaryPath ? { binaryPath: kiloBinaryPath } : {}),
            ...(settings.kiloServerUrl ? { serverUrl: settings.kiloServerUrl } : {}),
          },
        }
      : {}),
    ...(hasOpenCodeStartOptions
      ? {
          opencode: {
            ...(openCodeBinaryPath ? { binaryPath: openCodeBinaryPath } : {}),
            ...(settings.openCodeExperimentalWebSockets ? { experimentalWebSockets: true } : {}),
            ...(settings.openCodeServerUrl ? { serverUrl: settings.openCodeServerUrl } : {}),
          },
        }
      : {}),
    ...(piBinaryPath || settings.piAgentDir
      ? {
          pi: {
            ...(piBinaryPath ? { binaryPath: piBinaryPath } : {}),
            ...(settings.piAgentDir ? { agentDir: settings.piAgentDir } : {}),
          },
        }
      : {}),
  };

  return Object.keys(providerOptions).length > 0 ? providerOptions : undefined;
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

export function getCustomBinaryPathForProvider(
  settings: Pick<
    AppSettings,
    | "claudeBinaryPath"
    | "codexBinaryPath"
    | "cursorBinaryPath"
    | "antigravityBinaryPath"
    | "grokBinaryPath"
    | "droidBinaryPath"
    | "kiloBinaryPath"
    | "openCodeBinaryPath"
    | "piBinaryPath"
  >,
  provider: ProviderKind,
): string {
  switch (provider) {
    case "openai":
      return normalizeProviderBinaryPathOverride(provider, settings.codexBinaryPath);
    case "anthropic":
      return normalizeProviderBinaryPathOverride(provider, settings.claudeBinaryPath);
    case "openai":
      return normalizeProviderBinaryPathOverride(provider, settings.cursorBinaryPath);
    case "google":
      return normalizeProviderBinaryPathOverride(provider, settings.antigravityBinaryPath);
    case "openai":
      return normalizeProviderBinaryPathOverride(provider, settings.grokBinaryPath);
    case "openai":
      return normalizeProviderBinaryPathOverride(provider, settings.droidBinaryPath);
    case "openai":
      return normalizeProviderBinaryPathOverride(provider, settings.kiloBinaryPath);
    case "openai":
      return normalizeProviderBinaryPathOverride(provider, settings.openCodeBinaryPath);
    case "openai":
      return normalizeProviderBinaryPathOverride(provider, settings.piBinaryPath);
    case "engine":
      return "";
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
      return "";
  }
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
        ...(hasOwn(patch, "kiloServerPassword")
          ? { kiloServerPasswordConfigured: Boolean(patch.kiloServerPassword?.trim()) }
          : {}),
        ...(hasOwn(patch, "openCodeServerPassword")
          ? { openCodeServerPasswordConfigured: Boolean(patch.openCodeServerPassword?.trim()) }
          : {}),
        ...(hasOwn(patch, "openaiApiKey")
          ? { openaiApiKeyConfigured: Boolean(patch.openaiApiKey?.trim()) }
          : {}),
        ...(hasOwn(patch, "anthropicApiKey")
          ? { anthropicApiKeyConfigured: Boolean(patch.anthropicApiKey?.trim()) }
          : {}),
        ...(hasOwn(patch, "googleApiKey")
          ? { googleApiKeyConfigured: Boolean(patch.googleApiKey?.trim()) }
          : {}),
        ...(hasOwn(patch, "openrouterApiKey")
          ? { openrouterApiKeyConfigured: Boolean(patch.openrouterApiKey?.trim()) }
          : {}),
        ...(hasOwn(patch, "ollamaApiKey")
          ? { ollamaApiKeyConfigured: Boolean(patch.ollamaApiKey?.trim()) }
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
