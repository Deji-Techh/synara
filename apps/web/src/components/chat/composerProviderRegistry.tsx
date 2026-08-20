// FILE: composerProviderRegistry.tsx
// Purpose: Centralizes provider-specific composer state and trait picker rendering.
// Layer: Chat composer orchestration
// Depends on: shared model helpers, trait picker components, and runtime model discovery metadata.

import {
  type ModelSlug,
  type ProviderAgentDescriptor,
  type ProviderKind,
  type ProviderModelDescriptor,
  type ProviderModelOptions,
  type ThreadId,
} from "@caide/contracts";
import {
  getDefaultContextWindow,
  getDefaultEffort,
  hasContextWindowOption,
  hasEffortLevel,
  isClaudeUltrathinkPrompt,
  normalizeAntigravityModelOptions,
  normalizeClaudeModelOptions,
  normalizeOpenCodeModelOptions,
  normalizePiModelOptions,
  resolveLabeledOptionValue,
  trimOrNull,
} from "@caide/shared/model";
import type { ReactNode } from "react";
import { classifyCodexReasoningEffortSupport } from "../../lib/codexReasoningEffort";
import { TraitsMenuContent, TraitsPicker } from "./TraitsPicker";
import { getComposerTraitSelection, hasVisibleComposerTraitControls } from "./composerTraits";
import { getRuntimeAwareModelCapabilities } from "./runtimeModelCapabilities";

export type ComposerProviderStateInput = {
  provider: ProviderKind;
  model: ModelSlug;
  runtimeModel?: ProviderModelDescriptor | undefined;
  prompt: string;
  modelOptions: ProviderModelOptions | null | undefined;
};

export type ComposerProviderState = {
  provider: ProviderKind;
  promptEffort: string | null;
  modelOptionsForDispatch: ProviderModelOptions[ProviderKind] | undefined;
  composerFrameClassName?: string;
  composerSurfaceClassName?: string;
  modelPickerIconClassName?: string;
};

type ProviderTraitRenderInput = {
  threadId: ThreadId;
  model: ModelSlug;
  runtimeModel?: ProviderModelDescriptor | undefined;
  runtimeModels?: ReadonlyArray<ProviderModelDescriptor> | null | undefined;
  runtimeAgents?: ReadonlyArray<ProviderAgentDescriptor> | null | undefined;
  modelOptions: ProviderModelOptions[ProviderKind] | undefined;
  prompt: string;
  includeFastMode?: boolean;
  onPromptChange: (prompt: string) => void;
};

type ProviderTraitPickerRenderInput = ProviderTraitRenderInput & {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  shortcutLabel?: string | null;
};

type ProviderRegistryEntry = {
  getState: (input: ComposerProviderStateInput) => ComposerProviderState;
  renderTraitsMenuContent: (input: ProviderTraitRenderInput) => ReactNode;
  renderTraitsPicker: (input: ProviderTraitPickerRenderInput) => ReactNode;
};

function renderTraitsMenuContentForProvider(
  provider: ProviderKind,
  input: ProviderTraitRenderInput,
): ReactNode {
  return (
    <TraitsMenuContent
      provider={provider}
      threadId={input.threadId}
      model={input.model}
      runtimeModel={input.runtimeModel}
      runtimeModels={input.runtimeModels}
      runtimeAgents={input.runtimeAgents}
      modelOptions={input.modelOptions}
      prompt={input.prompt}
      {...(input.includeFastMode === undefined ? {} : { includeFastMode: input.includeFastMode })}
      onPromptChange={input.onPromptChange}
    />
  );
}

function renderTraitsPickerForProvider(
  provider: ProviderKind,
  input: ProviderTraitPickerRenderInput,
): ReactNode {
  return (
    <TraitsPicker
      provider={provider}
      threadId={input.threadId}
      model={input.model}
      runtimeModel={input.runtimeModel}
      runtimeModels={input.runtimeModels}
      runtimeAgents={input.runtimeAgents}
      modelOptions={input.modelOptions}
      prompt={input.prompt}
      {...(input.open !== undefined ? { open: input.open } : {})}
      {...(input.onOpenChange ? { onOpenChange: input.onOpenChange } : {})}
      {...(input.shortcutLabel !== undefined ? { shortcutLabel: input.shortcutLabel } : {})}
      {...(input.includeFastMode === undefined ? {} : { includeFastMode: input.includeFastMode })}
      onPromptChange={input.onPromptChange}
    />
  );
}

function getProviderStateFromCapabilities(
  input: ComposerProviderStateInput,
): ComposerProviderState {
  const { provider, model, runtimeModel, prompt, modelOptions } = input;
  const caps = getRuntimeAwareModelCapabilities({ provider, model, runtimeModel });

  let rawEffort: string | null = null;
  let normalizedOptions: ProviderModelOptions[ProviderKind] | undefined;

  switch (provider) {
    case "openai": {
      const providerOptions = modelOptions?.codex;
      rawEffort = trimOrNull(providerOptions?.reasoningEffort);
      const defaultReasoningEffort = getDefaultEffort(caps);
      const reasoningEffortSupport = classifyCodexReasoningEffortSupport({
        model,
        effort: rawEffort,
        ...(runtimeModel ? { runtimeModel } : {}),
      });
      const reasoningEffort =
        rawEffort &&
        reasoningEffortSupport !== "unsupported" &&
        rawEffort !== defaultReasoningEffort
          ? rawEffort
          : undefined;
      const fastModeEnabled = caps.supportsFastMode && providerOptions?.fastMode === true;
      const nextOptions = {
        ...(reasoningEffort ? { reasoningEffort } : {}),
        ...(fastModeEnabled ? { fastMode: true } : {}),
      };
      normalizedOptions = Object.keys(nextOptions).length > 0 ? nextOptions : undefined;
      break;
    }
    case "anthropic": {
      const providerOptions = modelOptions?.claudeAgent;
      rawEffort = trimOrNull(providerOptions?.effort);
      normalizedOptions = normalizeClaudeModelOptions(model, providerOptions);
      break;
    }
    case "openai": {
      const providerOptions = modelOptions?.cursor;
      rawEffort = trimOrNull(providerOptions?.reasoningEffort);
      const defaultReasoningEffort = getDefaultEffort(caps);
      const reasoningEffort =
        rawEffort && hasEffortLevel(caps, rawEffort) && rawEffort !== defaultReasoningEffort
          ? rawEffort
          : undefined;
      const rawContextWindow = trimOrNull(providerOptions?.contextWindow);
      const defaultContextWindow = getDefaultContextWindow(caps);
      const contextWindow =
        rawContextWindow &&
        hasContextWindowOption(caps, rawContextWindow) &&
        rawContextWindow !== defaultContextWindow
          ? rawContextWindow
          : undefined;
      const fastModeEnabled = caps.supportsFastMode && providerOptions?.fastMode === true;
      const thinking =
        caps.supportsThinkingToggle && providerOptions?.thinking !== undefined
          ? providerOptions.thinking
          : undefined;
      const nextOptions = {
        ...(reasoningEffort ? { reasoningEffort } : {}),
        ...(fastModeEnabled ? { fastMode: true } : {}),
        ...(thinking !== undefined ? { thinking } : {}),
        ...(contextWindow ? { contextWindow } : {}),
      };
      normalizedOptions = Object.keys(nextOptions).length > 0 ? nextOptions : undefined;
      break;
    }
    case "google": {
      const providerOptions = modelOptions?.antigravity;
      rawEffort = trimOrNull(providerOptions?.reasoningEffort);
      normalizedOptions = normalizeAntigravityModelOptions(model, providerOptions, caps);
      break;
    }
    case "openai": {
      const providerOptions = modelOptions?.grok;
      rawEffort = trimOrNull(providerOptions?.reasoningEffort);
      const defaultReasoningEffort = getDefaultEffort(caps);
      const reasoningEffort =
        rawEffort && hasEffortLevel(caps, rawEffort) && rawEffort !== defaultReasoningEffort
          ? providerOptions?.reasoningEffort
          : undefined;
      normalizedOptions = reasoningEffort ? { reasoningEffort } : undefined;
      break;
    }
    case "openai": {
      const providerOptions = modelOptions?.droid;
      rawEffort = trimOrNull(providerOptions?.reasoningEffort);
      // Droid's advertised "default" is the mutable current CLI preference.
      // Once the user selects an effort, always dispatch it explicitly.
      const reasoningEffort =
        rawEffort && hasEffortLevel(caps, rawEffort) ? providerOptions?.reasoningEffort : undefined;
      normalizedOptions = reasoningEffort ? { reasoningEffort } : undefined;
      break;
    }
    case "openai":
    case "openai": {
      const providerOptions = provider === "openai" ? modelOptions?.kilo : modelOptions?.opencode;
      rawEffort = trimOrNull(providerOptions?.variant);
      const variantOptions = caps.variantOptions ?? [];
      const reasoningVariant =
        rawEffort && variantOptions.some((option) => option.value === rawEffort)
          ? rawEffort
          : undefined;
      const agent = trimOrNull(providerOptions?.agent);
      if (variantOptions.length > 0) {
        const nextOptions = {
          ...(reasoningVariant ? { variant: reasoningVariant } : {}),
          ...(agent ? { agent } : {}),
        };
        normalizedOptions = Object.keys(nextOptions).length > 0 ? nextOptions : undefined;
        break;
      }
      normalizedOptions = normalizeOpenCodeModelOptions(providerOptions);
      break;
    }
    case "openai": {
      const providerOptions = modelOptions?.pi;
      rawEffort = trimOrNull(providerOptions?.thinkingLevel);
      normalizedOptions = normalizePiModelOptions(providerOptions);
      break;
    }
    case "openai":
    case "anthropic":
    case "google":
    case "openrouter":
    case "ollama": {
      const providerOptions = modelOptions?.[provider];
      rawEffort = trimOrNull(providerOptions?.reasoningEffort);
      const defaultReasoningEffort = getDefaultEffort(caps);
      const reasoningEffort =
        rawEffort && hasEffortLevel(caps, rawEffort) && rawEffort !== defaultReasoningEffort
          ? providerOptions?.reasoningEffort
          : undefined;
      const fastModeEnabled = caps.supportsFastMode && providerOptions?.fastMode === true;
      const thinking =
        caps.supportsThinkingToggle && providerOptions?.thinking !== undefined
          ? providerOptions.thinking
          : undefined;
      const nextOptions = {
        ...(reasoningEffort ? { reasoningEffort } : {}),
        ...(fastModeEnabled ? { fastMode: true } : {}),
        ...(thinking !== undefined ? { thinking } : {}),
      };
      normalizedOptions = Object.keys(nextOptions).length > 0 ? nextOptions : undefined;
      break;
    }
  }

  const draftEffort = trimOrNull(rawEffort);
  const defaultEffort = getDefaultEffort(caps);
  const isPromptInjected = draftEffort
    ? caps.promptInjectedEffortLevels.includes(draftEffort)
    : false;
  const promptEffort =
    provider === "openai" || provider === "openai"
      ? resolveLabeledOptionValue(caps.variantOptions, draftEffort)
      : draftEffort &&
          !isPromptInjected &&
          (provider === "openai"
            ? classifyCodexReasoningEffortSupport({
                model,
                effort: draftEffort,
                ...(runtimeModel ? { runtimeModel } : {}),
              }) !== "unsupported"
            : hasEffortLevel(caps, draftEffort))
        ? draftEffort
        : defaultEffort && hasEffortLevel(caps, defaultEffort)
          ? defaultEffort
          : null;

  const ultrathinkActive =
    caps.promptInjectedEffortLevels.length > 0 && isClaudeUltrathinkPrompt(prompt);

  return {
    provider,
    promptEffort,
    modelOptionsForDispatch: normalizedOptions,
    ...(ultrathinkActive ? { composerFrameClassName: "ultrathink-frame" } : {}),
    ...(ultrathinkActive ? { modelPickerIconClassName: "ultrathink-chroma" } : {}),
  };
}

const composerProviderRegistry: Record<ProviderKind, ProviderRegistryEntry> = {
  codex: {
    getState: (input) => getProviderStateFromCapabilities(input),
    renderTraitsMenuContent: (input) => renderTraitsMenuContentForProvider("openai", input),
    renderTraitsPicker: (input) => renderTraitsPickerForProvider("openai", input),
  },
  claudeAgent: {
    getState: (input) => getProviderStateFromCapabilities(input),
    renderTraitsMenuContent: (input) => renderTraitsMenuContentForProvider("anthropic", input),
    renderTraitsPicker: (input) => renderTraitsPickerForProvider("anthropic", input),
  },
  cursor: {
    getState: (input) => getProviderStateFromCapabilities(input),
    renderTraitsMenuContent: (input) => renderTraitsMenuContentForProvider("openai", input),
    renderTraitsPicker: (input) => renderTraitsPickerForProvider("openai", input),
  },
  antigravity: {
    getState: (input) => getProviderStateFromCapabilities(input),
    renderTraitsMenuContent: (input) => renderTraitsMenuContentForProvider("google", input),
    renderTraitsPicker: (input) => renderTraitsPickerForProvider("google", input),
  },
  grok: {
    getState: (input) => getProviderStateFromCapabilities(input),
    renderTraitsMenuContent: (input) => renderTraitsMenuContentForProvider("openai", input),
    renderTraitsPicker: (input) => renderTraitsPickerForProvider("openai", input),
  },
  droid: {
    getState: (input) => getProviderStateFromCapabilities(input),
    renderTraitsMenuContent: (input) => renderTraitsMenuContentForProvider("openai", input),
    renderTraitsPicker: (input) => renderTraitsPickerForProvider("openai", input),
  },
  kilo: {
    getState: (input) => getProviderStateFromCapabilities(input),
    renderTraitsMenuContent: (input) => renderTraitsMenuContentForProvider("openai", input),
    renderTraitsPicker: (input) => renderTraitsPickerForProvider("openai", input),
  },
  opencode: {
    getState: (input) => getProviderStateFromCapabilities(input),
    renderTraitsMenuContent: (input) => renderTraitsMenuContentForProvider("openai", input),
    renderTraitsPicker: (input) => renderTraitsPickerForProvider("openai", input),
  },
  pi: {
    getState: (input) => getProviderStateFromCapabilities(input),
    renderTraitsMenuContent: (input) => renderTraitsMenuContentForProvider("openai", input),
    renderTraitsPicker: (input) => renderTraitsPickerForProvider("openai", input),
  },
  engine: {
    getState: (input) => getProviderStateFromCapabilities(input),
    renderTraitsMenuContent: (input) => renderTraitsMenuContentForProvider("engine", input),
    renderTraitsPicker: (input) => renderTraitsPickerForProvider("engine", input),
  },
  openai: {
    getState: (input) => getProviderStateFromCapabilities(input),
    renderTraitsMenuContent: (input) => renderTraitsMenuContentForProvider("openai", input),
    renderTraitsPicker: (input) => renderTraitsPickerForProvider("openai", input),
  },
  anthropic: {
    getState: (input) => getProviderStateFromCapabilities(input),
    renderTraitsMenuContent: (input) => renderTraitsMenuContentForProvider("anthropic", input),
    renderTraitsPicker: (input) => renderTraitsPickerForProvider("anthropic", input),
  },
  google: {
    getState: (input) => getProviderStateFromCapabilities(input),
    renderTraitsMenuContent: (input) => renderTraitsMenuContentForProvider("google", input),
    renderTraitsPicker: (input) => renderTraitsPickerForProvider("google", input),
  },
  openrouter: {
    getState: (input) => getProviderStateFromCapabilities(input),
    renderTraitsMenuContent: (input) => renderTraitsMenuContentForProvider("openrouter", input),
    renderTraitsPicker: (input) => renderTraitsPickerForProvider("openrouter", input),
  },
  ollama: {
    getState: (input) => getProviderStateFromCapabilities(input),
    renderTraitsMenuContent: (input) => renderTraitsMenuContentForProvider("ollama", input),
    renderTraitsPicker: (input) => renderTraitsPickerForProvider("ollama", input),
  },
  deepseek: {
    getState: (input) => getProviderStateFromCapabilities(input),
    renderTraitsMenuContent: (input) => renderTraitsMenuContentForProvider("deepseek", input),
    renderTraitsPicker: (input) => renderTraitsPickerForProvider("deepseek", input),
  },
  groq: {
    getState: (input) => getProviderStateFromCapabilities(input),
    renderTraitsMenuContent: (input) => renderTraitsMenuContentForProvider("groq", input),
    renderTraitsPicker: (input) => renderTraitsPickerForProvider("groq", input),
  },
  mistral: {
    getState: (input) => getProviderStateFromCapabilities(input),
    renderTraitsMenuContent: (input) => renderTraitsMenuContentForProvider("mistral", input),
    renderTraitsPicker: (input) => renderTraitsPickerForProvider("mistral", input),
  },
  together: {
    getState: (input) => getProviderStateFromCapabilities(input),
    renderTraitsMenuContent: (input) => renderTraitsMenuContentForProvider("together", input),
    renderTraitsPicker: (input) => renderTraitsPickerForProvider("together", input),
  },
  cohere: {
    getState: (input) => getProviderStateFromCapabilities(input),
    renderTraitsMenuContent: (input) => renderTraitsMenuContentForProvider("cohere", input),
    renderTraitsPicker: (input) => renderTraitsPickerForProvider("cohere", input),
  },
  xai: {
    getState: (input) => getProviderStateFromCapabilities(input),
    renderTraitsMenuContent: (input) => renderTraitsMenuContentForProvider("xai", input),
    renderTraitsPicker: (input) => renderTraitsPickerForProvider("xai", input),
  },
  fireworks: {
    getState: (input) => getProviderStateFromCapabilities(input),
    renderTraitsMenuContent: (input) => renderTraitsMenuContentForProvider("fireworks", input),
    renderTraitsPicker: (input) => renderTraitsPickerForProvider("fireworks", input),
  },
  opencodeZen: {
    getState: (input) => getProviderStateFromCapabilities(input),
    renderTraitsMenuContent: (input) => renderTraitsMenuContentForProvider("opencodeZen", input),
    renderTraitsPicker: (input) => renderTraitsPickerForProvider("opencodeZen", input),
  },
};

export function getComposerProviderState(input: ComposerProviderStateInput): ComposerProviderState {
  return composerProviderRegistry[input.provider].getState(input);
}

export function renderProviderTraitsMenuContent(input: {
  provider: ProviderKind;
  threadId: ThreadId;
  model: ModelSlug;
  runtimeModel?: ProviderModelDescriptor | undefined;
  runtimeModels?: ReadonlyArray<ProviderModelDescriptor> | null | undefined;
  runtimeAgents?: ReadonlyArray<ProviderAgentDescriptor> | null | undefined;
  modelOptions: ProviderModelOptions[ProviderKind] | undefined;
  prompt: string;
  includeFastMode?: boolean;
  onPromptChange: (prompt: string) => void;
}): ReactNode {
  const selection = getComposerTraitSelection(
    input.provider,
    input.model,
    input.prompt,
    input.modelOptions,
    input.runtimeModel,
  );
  if (
    !hasVisibleComposerTraitControls(
      selection,
      input.includeFastMode === undefined ? undefined : { includeFastMode: input.includeFastMode },
    ) &&
    ((input.provider !== "openai" && input.provider !== "openai") ||
      (input.runtimeAgents?.length ?? 0) === 0)
  ) {
    return null;
  }
  return composerProviderRegistry[input.provider].renderTraitsMenuContent(input);
}

export function renderProviderTraitsPicker(input: {
  provider: ProviderKind;
  threadId: ThreadId;
  model: ModelSlug;
  runtimeModel?: ProviderModelDescriptor | undefined;
  runtimeModels?: ReadonlyArray<ProviderModelDescriptor> | null | undefined;
  runtimeAgents?: ReadonlyArray<ProviderAgentDescriptor> | null | undefined;
  modelOptions: ProviderModelOptions[ProviderKind] | undefined;
  prompt: string;
  includeFastMode?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  shortcutLabel?: string | null;
  onPromptChange: (prompt: string) => void;
}): ReactNode {
  const selection = getComposerTraitSelection(
    input.provider,
    input.model,
    input.prompt,
    input.modelOptions,
    input.runtimeModel,
  );
  if (
    !hasVisibleComposerTraitControls(
      selection,
      input.includeFastMode === undefined ? undefined : { includeFastMode: input.includeFastMode },
    ) &&
    ((input.provider !== "openai" && input.provider !== "openai") ||
      (input.runtimeAgents?.length ?? 0) === 0)
  ) {
    return null;
  }
  return composerProviderRegistry[input.provider].renderTraitsPicker(input);
}
