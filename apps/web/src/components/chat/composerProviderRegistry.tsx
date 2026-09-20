// @ts-nocheck
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
  PROVIDER_KINDS,
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

  if (provider === "engine") {
    const providerOptions = modelOptions?.engine;
    rawEffort = trimOrNull(providerOptions?.thinkingLevel);
    normalizedOptions = normalizePiModelOptions(providerOptions);
  } else {
    const providerOptions = (modelOptions as any)?.[provider];
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
  }

  const draftEffort = trimOrNull(rawEffort);
  const defaultEffort = getDefaultEffort(caps);
  const isPromptInjected = draftEffort
    ? caps.promptInjectedEffortLevels.includes(draftEffort)
    : false;
  const promptEffort =
    draftEffort && !isPromptInjected && hasEffortLevel(caps, draftEffort)
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

function createRegistryEntry(provider: ProviderKind): ProviderRegistryEntry {
  return {
    getState: (input) => getProviderStateFromCapabilities(input),
    renderTraitsMenuContent: (input) => renderTraitsMenuContentForProvider(provider, input),
    renderTraitsPicker: (input) => renderTraitsPickerForProvider(provider, input),
  };
}

const composerProviderRegistry: Record<ProviderKind, ProviderRegistryEntry> = Object.fromEntries(
  PROVIDER_KINDS.map((kind) => [kind, createRegistryEntry(kind)]),
) as Record<ProviderKind, ProviderRegistryEntry>;

export function getComposerProviderState(input: ComposerProviderStateInput): ComposerProviderState {
  const entry = composerProviderRegistry[input.provider];
  if (entry) {
    return entry.getState(input);
  }
  return getProviderStateFromCapabilities(input);
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
    (input.runtimeAgents?.length ?? 0) === 0
  ) {
    return null;
  }
  const entry = composerProviderRegistry[input.provider];
  if (entry) {
    return entry.renderTraitsMenuContent(input);
  }
  return renderTraitsMenuContentForProvider(input.provider, input);
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
    (input.runtimeAgents?.length ?? 0) === 0
  ) {
    return null;
  }
  const entry = composerProviderRegistry[input.provider];
  if (entry) {
    return entry.renderTraitsPicker(input);
  }
  return renderTraitsPickerForProvider(input.provider, input);
}
