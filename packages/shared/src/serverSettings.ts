import {
  DEFAULT_MODEL_BY_PROVIDER,
  type ModelSelection,
  type ProviderStartOptions,
  type ServerSettings,
  type ServerSettingsPatch,
} from "@caide/contracts";
import { deepMerge, type DeepPartial } from "./Struct";

type ModelSelectionPatchInput = NonNullable<ServerSettingsPatch["textGenerationModelSelection"]>;

function shouldReplaceModelSelection(patch: ModelSelectionPatchInput | undefined): boolean {
  return Boolean(patch && (patch.provider !== undefined || patch.model !== undefined));
}

// Shared provider-swap normalization for the Git writing and chat-title model
// selections: switching providers resets the model to that provider's default
// instead of carrying a stale slug across vendors.
function resolveModelSelectionPatch(
  current: ModelSelection,
  patch: ModelSelectionPatchInput | undefined,
): ModelSelection {
  if (!patch) {
    return current;
  }
  const provider = patch.provider ?? current.provider;
  const model =
    patch.model ??
    (patch.provider &&
    (patch.provider as string) !== "pi" &&
    patch.provider !== "engine" &&
    patch.provider !== current.provider
      ? (DEFAULT_MODEL_BY_PROVIDER as Record<string, string>)[patch.provider as string]
      : current.model);
  const options = shouldReplaceModelSelection(patch)
    ? patch.options
    : (patch.options ?? current.options);

  return {
    provider,
    model,
    ...(options !== undefined ? { options } : {}),
  } as ModelSelection;
}

export function applyServerSettingsPatch(
  current: ServerSettings,
  patch: ServerSettingsPatch,
): ServerSettings {
  const next = deepMerge(current, patch as DeepPartial<ServerSettings>);
  if (!patch.textGenerationModelSelection && patch.chatTitleModelSelection === undefined) {
    return next;
  }

  const result = { ...next };
  if (patch.textGenerationModelSelection) {
    result.textGenerationModelSelection = resolveModelSelectionPatch(
      current.textGenerationModelSelection,
      patch.textGenerationModelSelection,
    );
  }
  // An absent chat-title override means "follow the Git writing model", so a
  // missing current value resolves against the (possibly just patched) Git default.
  if (patch.chatTitleModelSelection === null) {
    delete result.chatTitleModelSelection;
  } else if (patch.chatTitleModelSelection) {
    result.chatTitleModelSelection = resolveModelSelectionPatch(
      current.chatTitleModelSelection ?? result.textGenerationModelSelection,
      patch.chatTitleModelSelection,
    );
  }
  return result;
}

/** API-key providers whose launch options carry a chat-completions base URL. */
const API_START_OPTION_PROVIDERS = [
  "groq",
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
