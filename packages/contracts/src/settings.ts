// @ts-nocheck — shell reset interim pure Caide
import { Schema } from "effect";
import { TrimmedString } from "./baseSchemas";
import { DEFAULT_GIT_TEXT_GENERATION_MODEL } from "./model";
import { ModelSelection, ProviderKind, ThreadEnvironmentMode } from "./orchestration";

const StringSetting = TrimmedString.check(Schema.isMaxLength(4096));
const CustomModels = Schema.Array(Schema.String.check(Schema.isMaxLength(256))).pipe(
  Schema.withDecodingDefault(() => []),
);

const ProviderSettingsBase = {
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(() => true)),
  binaryPath: StringSetting.pipe(Schema.withDecodingDefault(() => "")),
  customModels: CustomModels,
};

export const EngineServerProviderSettings = Schema.Struct({
  ...ProviderSettingsBase,
  binaryPath: StringSetting.pipe(Schema.withDecodingDefault(() => "caide-engine")),
  // The engine is an OpenAI-compatible chat endpoint for its agent loop.
  baseUrl: StringSetting.pipe(Schema.withDecodingDefault(() => "")),
  modelId: StringSetting.pipe(Schema.withDecodingDefault(() => "")),
  apiKeyConfigured: Schema.Boolean.pipe(Schema.withDecodingDefault(() => false)),
  // Absolute path to the flutter binary the engine spawns. Overrides
  // FLUTTER_SDK_BIN/PATH resolution so a pinned SDK keeps working even when
  // flutter is not on PATH (see flutterCommand.ts: resolveFlutterBinary).
  flutterSdkBin: StringSetting.pipe(Schema.withDecodingDefault(() => "")),
});
export type EngineServerProviderSettings = typeof EngineServerProviderSettings.Type;

// API-key providers authenticate over HTTP — no child process, hence no
// binary path. The key itself never leaves the secret store; the settings view
// only carries a boolean `apiKeyConfigured` flag, mirroring the engine's
// configured-flag handling.
const ApiProviderSettingsBase = {
  enabled: Schema.Boolean.pipe(Schema.withDecodingDefault(() => true)),
  customModels: CustomModels,
  // The chat-completions base URL. Ollama defaults to a local server; the rest
  // default to the vendor endpoint. Empty means "use the provider default".
  baseUrl: StringSetting.pipe(Schema.withDecodingDefault(() => "")),
  apiKeyConfigured: Schema.Boolean.pipe(Schema.withDecodingDefault(() => false)),
};

export const OpenAiServerProviderSettings = Schema.Struct(ApiProviderSettingsBase);
export type OpenAiServerProviderSettings = typeof OpenAiServerProviderSettings.Type;

export const AnthropicServerProviderSettings = Schema.Struct(ApiProviderSettingsBase);
export type AnthropicServerProviderSettings = typeof AnthropicServerProviderSettings.Type;

export const GoogleServerProviderSettings = Schema.Struct(ApiProviderSettingsBase);
export type GoogleServerProviderSettings = typeof GoogleServerProviderSettings.Type;

export const OpenRouterServerProviderSettings = Schema.Struct(ApiProviderSettingsBase);
export type OpenRouterServerProviderSettings = typeof OpenRouterServerProviderSettings.Type;

export const OllamaServerProviderSettings = Schema.Struct(ApiProviderSettingsBase);
export type OllamaServerProviderSettings = typeof OllamaServerProviderSettings.Type;

export const DeepseekServerProviderSettings = Schema.Struct(ApiProviderSettingsBase);
export type DeepseekServerProviderSettings = typeof DeepseekServerProviderSettings.Type;

export const GroqServerProviderSettings = Schema.Struct(ApiProviderSettingsBase);
export type GroqServerProviderSettings = typeof GroqServerProviderSettings.Type;

export const MistralServerProviderSettings = Schema.Struct(ApiProviderSettingsBase);
export type MistralServerProviderSettings = typeof MistralServerProviderSettings.Type;

export const TogetherServerProviderSettings = Schema.Struct(ApiProviderSettingsBase);
export type TogetherServerProviderSettings = typeof TogetherServerProviderSettings.Type;

export const CohereServerProviderSettings = Schema.Struct(ApiProviderSettingsBase);
export type CohereServerProviderSettings = typeof CohereServerProviderSettings.Type;

export const XaiServerProviderSettings = Schema.Struct(ApiProviderSettingsBase);
export type XaiServerProviderSettings = typeof XaiServerProviderSettings.Type;

export const FireworksServerProviderSettings = Schema.Struct(ApiProviderSettingsBase);
export type FireworksServerProviderSettings = typeof FireworksServerProviderSettings.Type;

export const OpenCodeZenServerProviderSettings = Schema.Struct(ApiProviderSettingsBase);
export type OpenCodeZenServerProviderSettings = typeof OpenCodeZenServerProviderSettings.Type;

export const OpenCodeGoServerProviderSettings = Schema.Struct({
  ...ProviderSettingsBase,
  apiKey: StringSetting.pipe(Schema.withDecodingDefault(() => "")),
  apiKeyConfigured: Schema.Boolean.pipe(Schema.withDecodingDefault(() => false)),
  baseUrl: StringSetting.pipe(Schema.withDecodingDefault(() => "")),
});
export type OpenCodeGoServerProviderSettings = typeof OpenCodeGoServerProviderSettings.Type;

const DisabledSkillNames = Schema.Array(Schema.String.check(Schema.isMaxLength(256))).pipe(
  Schema.withDecodingDefault(() => []),
);

// User-level skill toggles. Skills are keyed by lowercased name because the
// unified catalog dedupes provider copies of the same skill by name.
export const SkillsServerSettings = Schema.Struct({
  disabled: DisabledSkillNames,
});
export type SkillsServerSettings = typeof SkillsServerSettings.Type;

export const ServerSettings = Schema.Struct({
  enableAssistantStreaming: Schema.Boolean.pipe(Schema.withDecodingDefault(() => true)),
  enableProviderUpdateChecks: Schema.Boolean.pipe(Schema.withDecodingDefault(() => true)),
  defaultThreadEnvMode: ThreadEnvironmentMode.pipe(Schema.withDecodingDefault(() => "local")),
  textGenerationModelSelection: ModelSelection.pipe(
    Schema.withDecodingDefault(() => ({
      provider: "openai" as const,
      model: DEFAULT_GIT_TEXT_GENERATION_MODEL,
    })),
  ),
  providers: Schema.Struct({
    engine: EngineServerProviderSettings.pipe(Schema.withDecodingDefault(() => ({}))),
    openai: OpenAiServerProviderSettings.pipe(Schema.withDecodingDefault(() => ({}))),
    anthropic: AnthropicServerProviderSettings.pipe(Schema.withDecodingDefault(() => ({}))),
    google: GoogleServerProviderSettings.pipe(Schema.withDecodingDefault(() => ({}))),
    openrouter: OpenRouterServerProviderSettings.pipe(Schema.withDecodingDefault(() => ({}))),
    ollama: OllamaServerProviderSettings.pipe(Schema.withDecodingDefault(() => ({}))),
    deepseek: DeepseekServerProviderSettings.pipe(Schema.withDecodingDefault(() => ({}))),
    groq: GroqServerProviderSettings.pipe(Schema.withDecodingDefault(() => ({}))),
    mistral: MistralServerProviderSettings.pipe(Schema.withDecodingDefault(() => ({}))),
    together: TogetherServerProviderSettings.pipe(Schema.withDecodingDefault(() => ({}))),
    cohere: CohereServerProviderSettings.pipe(Schema.withDecodingDefault(() => ({}))),
    xai: XaiServerProviderSettings.pipe(Schema.withDecodingDefault(() => ({}))),
    fireworks: FireworksServerProviderSettings.pipe(Schema.withDecodingDefault(() => ({}))),
    opencodeZen: OpenCodeZenServerProviderSettings.pipe(Schema.withDecodingDefault(() => ({}))),
    opencodeGo: OpenCodeGoServerProviderSettings.pipe(Schema.withDecodingDefault(() => ({}))),
  }).pipe(Schema.withDecodingDefault(() => ({}))),
  skills: SkillsServerSettings.pipe(Schema.withDecodingDefault(() => ({}))),
});
export type ServerSettings = typeof ServerSettings.Type;

export const DEFAULT_SERVER_SETTINGS: ServerSettings = Schema.decodeSync(ServerSettings)({});

// Public settings are structurally separate so the RPC contract can remain an
// explicitly redacted boundary if server-only settings gain more fields later.
export const ServerSettingsView = ServerSettings;
export type ServerSettingsView = typeof ServerSettingsView.Type;

export const DEFAULT_SERVER_SETTINGS_VIEW: ServerSettingsView = Schema.decodeSync(
  ServerSettingsView,
)({});

const ModelSelectionPatch = Schema.Struct({
  provider: Schema.optionalKey(ProviderKind),
  model: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(256))),
  options: Schema.optionalKey(Schema.Unknown),
});

const ProviderSettingsBasePatch = {
  enabled: Schema.optionalKey(Schema.Boolean),
  binaryPath: Schema.optionalKey(StringSetting),
  customModels: Schema.optionalKey(CustomModels),
};

const ApiProviderSettingsPatchBase = {
  enabled: Schema.optionalKey(Schema.Boolean),
  customModels: Schema.optionalKey(CustomModels),
};

export const ServerSettingsPatch = Schema.Struct({
  enableAssistantStreaming: Schema.optionalKey(Schema.Boolean),
  enableProviderUpdateChecks: Schema.optionalKey(Schema.Boolean),
  defaultThreadEnvMode: Schema.optionalKey(ThreadEnvironmentMode),
  textGenerationModelSelection: Schema.optionalKey(ModelSelectionPatch),
  providers: Schema.optionalKey(
    Schema.Struct({
      engine: Schema.optionalKey(
        Schema.Struct({
          ...ProviderSettingsBasePatch,
          baseUrl: Schema.optionalKey(StringSetting),
          modelId: Schema.optionalKey(StringSetting),
          apiKey: Schema.optionalKey(StringSetting),
          flutterSdkBin: Schema.optionalKey(StringSetting),
        }),
      ),
      openai: Schema.optionalKey(
        Schema.Struct({
          ...ApiProviderSettingsPatchBase,
          baseUrl: Schema.optionalKey(StringSetting),
          apiKey: Schema.optionalKey(StringSetting),
        }),
      ),
      anthropic: Schema.optionalKey(
        Schema.Struct({
          ...ApiProviderSettingsPatchBase,
          baseUrl: Schema.optionalKey(StringSetting),
          apiKey: Schema.optionalKey(StringSetting),
        }),
      ),
      google: Schema.optionalKey(
        Schema.Struct({
          ...ApiProviderSettingsPatchBase,
          baseUrl: Schema.optionalKey(StringSetting),
          apiKey: Schema.optionalKey(StringSetting),
        }),
      ),
      openrouter: Schema.optionalKey(
        Schema.Struct({
          ...ApiProviderSettingsPatchBase,
          baseUrl: Schema.optionalKey(StringSetting),
          apiKey: Schema.optionalKey(StringSetting),
        }),
      ),
      ollama: Schema.optionalKey(
        Schema.Struct({
          ...ApiProviderSettingsPatchBase,
          baseUrl: Schema.optionalKey(StringSetting),
          apiKey: Schema.optionalKey(StringSetting),
        }),
      ),
      deepseek: Schema.optionalKey(
        Schema.Struct({
          ...ApiProviderSettingsPatchBase,
          baseUrl: Schema.optionalKey(StringSetting),
          apiKey: Schema.optionalKey(StringSetting),
        }),
      ),
      groq: Schema.optionalKey(
        Schema.Struct({
          ...ApiProviderSettingsPatchBase,
          baseUrl: Schema.optionalKey(StringSetting),
          apiKey: Schema.optionalKey(StringSetting),
        }),
      ),
      mistral: Schema.optionalKey(
        Schema.Struct({
          ...ApiProviderSettingsPatchBase,
          baseUrl: Schema.optionalKey(StringSetting),
          apiKey: Schema.optionalKey(StringSetting),
        }),
      ),
      together: Schema.optionalKey(
        Schema.Struct({
          ...ApiProviderSettingsPatchBase,
          baseUrl: Schema.optionalKey(StringSetting),
          apiKey: Schema.optionalKey(StringSetting),
        }),
      ),
      cohere: Schema.optionalKey(
        Schema.Struct({
          ...ApiProviderSettingsPatchBase,
          baseUrl: Schema.optionalKey(StringSetting),
          apiKey: Schema.optionalKey(StringSetting),
        }),
      ),
      xai: Schema.optionalKey(
        Schema.Struct({
          ...ApiProviderSettingsPatchBase,
          baseUrl: Schema.optionalKey(StringSetting),
          apiKey: Schema.optionalKey(StringSetting),
        }),
      ),
      fireworks: Schema.optionalKey(
        Schema.Struct({
          ...ApiProviderSettingsPatchBase,
          baseUrl: Schema.optionalKey(StringSetting),
          apiKey: Schema.optionalKey(StringSetting),
        }),
      ),
      opencodeZen: Schema.optionalKey(
        Schema.Struct({
          ...ApiProviderSettingsPatchBase,
          baseUrl: Schema.optionalKey(StringSetting),
          apiKey: Schema.optionalKey(StringSetting),
        }),
      ),
      opencodeGo: Schema.optionalKey(
        Schema.Struct({
          ...ProviderSettingsBasePatch,
          baseUrl: Schema.optionalKey(StringSetting),
          apiKey: Schema.optionalKey(StringSetting),
        }),
      ),
    }),
  ),
  skills: Schema.optionalKey(
    Schema.Struct({
      disabled: Schema.optionalKey(Schema.Array(Schema.String.check(Schema.isMaxLength(256)))),
    }),
  ),
});
export type ServerSettingsPatch = typeof ServerSettingsPatch.Type;

export class ServerSettingsError extends Schema.TaggedErrorClass<ServerSettingsError>()(
  "ServerSettingsError",
  {
    settingsPath: Schema.String,
    detail: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {
  override get message(): string {
    return `Server settings error at ${this.settingsPath}: ${this.detail}`;
  }
}
