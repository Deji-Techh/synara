// FILE: index.ts
// Purpose: Barrel for the Dyad-transplant provider layer (free-entirely:
// direct connections, no gateway, no quotas, no subscription gates).

export {
  MODEL_OPTIONS,
  FREE_OPENROUTER_MODEL_NAMES,
  findModelOption,
  getContextWindow,
  GPT_5_6_SOL_MODEL_NAME,
  OPUS_4_8,
  type ModelOption,
} from "./catalog.ts";
export {
  PROVIDERS,
  PROVIDER_TO_ENV_VAR,
  OPENCODE_ZEN_API_BASE_URL,
  keylessProviders,
  type ProviderDef,
} from "./providers.ts";
export {
  resolveApiKeyOrThrow,
  InvalidProviderApiKeyError,
  normalizeProviderApiKeyInput,
  findInvalidProviderApiKeyCharacter,
  formatInvalidProviderApiKeyMessage,
} from "./apiKey.ts";
export {
  ProviderSecretsStore,
  sharedProviderSecrets,
  defaultSecretsPath,
  type StoredProviderEntry,
  type ProviderSecretsFile,
} from "./secrets.ts";
export {
  testProviderConnection,
  type ConnectionTestResult,
} from "./testConnection.ts";
export {
  resolveConnection,
  resolveAutoProvider,
  hasProviderKey,
  type ResolvedConnection,
  type ProviderSettingsInput,
  type SettingsLike,
} from "./routing.ts";
