import {
  DEFAULT_MODEL_BY_PROVIDER,
  type ModelSelection,
  type ProviderStartOptions,
  type ServerSettings,
  type ServerSettingsPatch,
} from "@caide/contracts";
import { deepMerge, type DeepPartial } from "./Struct";

function shouldReplaceTextGenerationModelSelection(
  patch: ServerSettingsPatch["textGenerationModelSelection"] | undefined,
): boolean {
  return Boolean(patch && (patch.provider !== undefined || patch.model !== undefined));
}

export function applyServerSettingsPatch(
  current: ServerSettings,
  patch: ServerSettingsPatch,
): ServerSettings {
  const selectionPatch = patch.textGenerationModelSelection;
  const next = deepMerge(current, patch as DeepPartial<ServerSettings>);
  if (!selectionPatch) {
    return next;
  }

  const provider = selectionPatch.provider ?? current.textGenerationModelSelection.provider;
  const model =
    selectionPatch.model ??
    (selectionPatch.provider &&
    (selectionPatch.provider as string) !== "pi" &&
    selectionPatch.provider !== "engine" &&
    selectionPatch.provider !== current.textGenerationModelSelection.provider
      ? (DEFAULT_MODEL_BY_PROVIDER as Record<string, string>)[selectionPatch.provider as string]
      : current.textGenerationModelSelection.model);
  const options = shouldReplaceTextGenerationModelSelection(selectionPatch)
    ? selectionPatch.options
    : (selectionPatch.options ?? current.textGenerationModelSelection.options);

  return {
    ...next,
    textGenerationModelSelection: {
      provider,
      model,
      ...(options !== undefined ? { options } : {}),
    } as ModelSelection,
  };
}

/** API-key providers whose launch options carry a chat-completions base URL. */
const API_START_OPTION_PROVIDERS = [
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
] as const satisfies readonly (keyof ProviderStartOptions)[];

/** Server-owned launch options derived from the persisted non-secret settings snapshot. */
export function providerStartOptionsFromServerSettings(
  settings: ServerSettings,
): ProviderStartOptions {
  const options: { -readonly [K in keyof ProviderStartOptions]?: ProviderStartOptions[K] } = {};
  for (const provider of API_START_OPTION_PROVIDERS) {
    const baseUrl = settings.providers[provider]?.baseUrl;
    if (baseUrl) {
      options[provider] = { baseUrl };
    }
  }
  const binaryPath = settings.providers.engine?.binaryPath;
  options.engine = binaryPath ? { binaryPath } : {};
  return options as ProviderStartOptions;
}
