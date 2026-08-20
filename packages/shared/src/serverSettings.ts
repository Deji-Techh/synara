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
    selectionPatch.provider !== "pi" &&
    selectionPatch.provider !== "engine" &&
    selectionPatch.provider !== current.textGenerationModelSelection.provider
      ? DEFAULT_MODEL_BY_PROVIDER[selectionPatch.provider]
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
  const { providers } = settings;
  return {
    codex: {
      ...((providers as any).codex?.binaryPath ? { binaryPath: (providers as any).codex?.binaryPath } : {}),
      ...((providers as any).codex?.homePath ? { homePath: (providers as any).codex?.homePath } : {}),
    },
    claudeAgent: {
      ...((providers as any).claudeAgent?.binaryPath ? { binaryPath: (providers as any).claudeAgent?.binaryPath } : {}),
    },
    cursor: {
      ...((providers as any).cursor?.binaryPath ? { binaryPath: (providers as any).cursor?.binaryPath } : {}),
      ...((providers as any).cursor?.apiEndpoint ? { apiEndpoint: (providers as any).cursor?.apiEndpoint } : {}),
    },
    antigravity: {
      ...((providers as any).antigravity?.binaryPath ? { binaryPath: (providers as any).antigravity?.binaryPath } : {}),
    },
    grok: {
      ...((providers as any).grok?.binaryPath ? { binaryPath: (providers as any).grok?.binaryPath } : {}),
    },
    droid: {
      ...((providers as any).droid?.binaryPath ? { binaryPath: (providers as any).droid?.binaryPath } : {}),
    },
    kilo: {
      ...((providers as any).kilo?.binaryPath ? { binaryPath: (providers as any).kilo?.binaryPath } : {}),
      ...((providers as any).kilo?.serverUrl ? { serverUrl: (providers as any).kilo?.serverUrl } : {}),
    },
    opencode: {
      ...((providers as any).opencode?.binaryPath ? { binaryPath: (providers as any).opencode?.binaryPath } : {}),
      ...((providers as any).opencode?.serverUrl ? { serverUrl: (providers as any).opencode?.serverUrl } : {}),
      experimentalWebSockets: (providers as any).opencode?.experimentalWebSockets,
    },
    pi: {
      ...((providers as any).pi?.binaryPath ? { binaryPath: (providers as any).pi?.binaryPath } : {}),
      ...((providers as any).pi?.agentDir ? { agentDir: (providers as any).pi?.agentDir } : {}),
    },
    engine: {
      ...(providers.engine.binaryPath ? { binaryPath: providers.engine.binaryPath } : {}),
    },
  };
}
