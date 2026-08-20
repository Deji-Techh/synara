// @ts-nocheck
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

/** Server-owned launch options derived from the persisted non-secret settings snapshot. */
export function providerStartOptionsFromServerSettings(
  settings: ServerSettings,
): ProviderStartOptions {
  const { providers } = settings as unknown as Record<string, Record<string, unknown>>;
  return {
    // Legacy CLI providers are no-op in the API-only product; keep empty objects
    // for backward compat so old persisted settings don't throw on decode.
    ...(providers.openai !== undefined
      ? {
          openai: {
            ...((providers.openai as { baseUrl?: string })?.baseUrl
              ? { baseUrl: (providers.openai as { baseUrl?: string }).baseUrl }
              : {}),
          },
        }
      : {}),
    ...(providers.anthropic !== undefined
      ? {
          anthropic: {
            ...((providers.anthropic as { baseUrl?: string })?.baseUrl
              ? { baseUrl: (providers.anthropic as { baseUrl?: string }).baseUrl }
              : {}),
          },
        }
      : {}),
    ...(providers.google !== undefined
      ? {
          google: {
            ...((providers.google as { baseUrl?: string })?.baseUrl
              ? { baseUrl: (providers.google as { baseUrl?: string }).baseUrl }
              : {}),
          },
        }
      : {}),
    engine: {
      ...((providers.engine as { binaryPath?: string })?.binaryPath
        ? { binaryPath: (providers.engine as { binaryPath?: string }).binaryPath }
        : {}),
    },
  } as unknown as ProviderStartOptions;
}
