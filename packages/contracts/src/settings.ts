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

// API-key providers authenticate over HTTP. The key itself never leaves the
// secret store; the settings view only carries a boolean `apiKeyConfigured`
// flag, mirroring the engine's configured-flag handling.
const ApiProviderSettingsBase = {
  ...ProviderSettingsBase,
  // The chat-completions base URL. Ollama defaults to a local server; the rest
  // default to the vendor endpoint. Empty means "use the provider default".
  baseUrl: StringSetting.pipe(Schema.withDecodingDefault(() => "")),
  apiKeyConfigured: Schema.Boolean.pipe(Schema.withDecodingDefault(() => false)),
};

export const GroqServerProviderSettings = Schema.Struct({
  ...ApiProviderSettingsBase,
  binaryPath: StringSetting.pipe(Schema.withDecodingDefault(() => "")),
});
export type GroqServerProviderSettings = typeof GroqServerProviderSettings.Type;

export const OpenCodeZenServerProviderSettings = Schema.Struct({
  ...ApiProviderSettingsBase,
  binaryPath: StringSetting.pipe(Schema.withDecodingDefault(() => "")),
});
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
  addProjectBaseDirectory: StringSetting.pipe(Schema.withDecodingDefault(() => "")),
  textGenerationModelSelection: ModelSelection.pipe(
    Schema.withDecodingDefault(() => ({
      provider: "groq" as const,
      model: DEFAULT_GIT_TEXT_GENERATION_MODEL,
    })),
  ),
  providers: Schema.Struct({
    engine: EngineServerProviderSettings.pipe(Schema.withDecodingDefault(() => ({}))),
    groq: GroqServerProviderSettings.pipe(Schema.withDecodingDefault(() => ({}))),
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

export const ServerSettingsPatch = Schema.Struct({
  enableAssistantStreaming: Schema.optionalKey(Schema.Boolean),
  enableProviderUpdateChecks: Schema.optionalKey(Schema.Boolean),
  defaultThreadEnvMode: Schema.optionalKey(ThreadEnvironmentMode),
  addProjectBaseDirectory: Schema.optionalKey(StringSetting),
  textGenerationModelSelection: Schema.optionalKey(ModelSelectionPatch),
  providers: Schema.optionalKey(
    Schema.Struct({
      groq: Schema.optionalKey(
        Schema.Struct({
          ...ProviderSettingsBasePatch,
          baseUrl: Schema.optionalKey(StringSetting),
          apiKey: Schema.optionalKey(StringSetting),
        }),
      ),
      opencodeZen: Schema.optionalKey(
        Schema.Struct({
          ...ProviderSettingsBasePatch,
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
