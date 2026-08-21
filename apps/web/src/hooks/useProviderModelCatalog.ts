// FILE: useProviderModelCatalog.ts
// Purpose: Shared provider→model option catalog (static + custom + runtime-discovered)
//          for composer-like surfaces outside ChatView, e.g. the kanban new-task dialog.
// Layer: Web hooks
// Exports: useProviderModelCatalog, ProviderModelCatalog

import type {
  ProviderAgentDescriptor,
  ProviderKind,
  ProviderModelDescriptor,
} from "@caide/contracts";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { getAppModelOptions, getCustomModelsByProvider, useAppSettings } from "../appSettings";
import { resolveRuntimeModelDescriptor } from "../components/chat/runtimeModelCapabilities";
import {
  isInitialModelDiscoveryPending,
  providerAgentsQueryOptions,
  providerModelsQueryOptions,
} from "../lib/providerDiscoveryReactQuery";
import { mergeDynamicModelOptions, type ProviderModelOption } from "../providerModelOptions";

export interface ProviderModelCatalog {
  customModelsByProvider: ReturnType<typeof getCustomModelsByProvider>;
  modelOptionsByProvider: Record<
    ProviderKind,
    ReadonlyArray<ProviderModelOption & { isCustom?: boolean }>
  >;
  /** Providers whose runtime model discovery is still pending (no usable list yet). */
  loadingModelProviders: Partial<Record<ProviderKind, boolean>>;
  /**
   * Runtime-discovered model descriptors per provider. Composer-style trait
   * controls (effort, fast mode, thinking, context window) are sourced from
   * these for cursor/codex/etc., so any surface that wants the effort picker
   * must feed them through (see {@link selectedRuntimeModel}).
   */
  runtimeModelsByProvider: Record<ProviderKind, ReadonlyArray<ProviderModelDescriptor>>;
  /** The runtime descriptor matching `selectedProvider` + its selected-model hint. */
  selectedRuntimeModel: ProviderModelDescriptor | undefined;
  /** Runtime-discovered agents/modes for the selected provider (kilo/opencode/claude/codex). */
  selectedRuntimeAgents: ReadonlyArray<ProviderAgentDescriptor>;
  /** Loading state used by the selected provider's bootstrap skeleton. */
  selectedProviderModelsLoading: boolean;
  /** Whether the selected provider requires and is still waiting on runtime models. */
  selectedProviderRuntimeModelDiscoveryPending: boolean;
}

const EMPTY_PROVIDER_AGENTS: ReadonlyArray<ProviderAgentDescriptor> = [];

export function useProviderModelCatalog(input: {
  selectedProvider: ProviderKind;
  /**
   * Enables discovery for the on-demand providers (cursor/grok/droid/kilo/opencode/pi)
   * even when they are not selected — pass the picker's open state so their lists
   * are warm by the time the user browses them.
   */
  discoveryEnabled: boolean;
  /** Effective cwd for providers whose model catalog can be extended by project resources. */
  cwd?: string | null;
  /** Per-provider selected-model hints so an unknown selection still lists itself. */
  modelHintByProvider?: Partial<Record<ProviderKind, string | null>>;
  /**
   * Restrict background discovery to the providers used by a non-picker surface.
   * Picker surfaces can omit this to use the visible-provider list from settings.
   */
  prefetchProviders?: ReadonlyArray<ProviderKind>;
  /** Preserve eager Claude/Codex agent discovery on surfaces that already prefetch both. */
  agentDiscoveryPolicy?: "selected" | "eager-core";
}): ProviderModelCatalog {
  const { selectedProvider, discoveryEnabled, modelHintByProvider } = input;
  const agentDiscoveryPolicy = input.agentDiscoveryPolicy ?? "selected";
  const discoveryCwd = input.cwd ?? null;
  const { settings, serverSettings } = useAppSettings();
  const customModelsByProvider = useMemo(() => getCustomModelsByProvider(settings), [settings]);
  const hiddenProviderSet = useMemo(
    () => new Set<ProviderKind>(settings.hiddenProviders),
    [settings.hiddenProviders],
  );
  const prefetchProviderSet = useMemo(
    () =>
      input.prefetchProviders === undefined ? null : new Set<ProviderKind>(input.prefetchProviders),
    [input.prefetchProviders],
  );
  const shouldDiscoverProvider = (
    provider: ProviderKind,
    prefetchRequested = discoveryEnabled,
  ): boolean => {
    // The enabled flag is a short-circuit, not a precondition. `serverSettings` is
    // undefined while the settings query is in flight and stays undefined if it
    // fails — and it never refetches on its own (`staleTime: Infinity`). Treating
    // that as "disabled" would silence discovery for every provider, including the
    // selected one, which is precisely the "my model disappeared" symptom. Mirrors
    // the server-side fallback in ProviderDiscoveryService.listModels.
    if (serverSettings?.providers[provider]?.enabled === false) {
      return false;
    }
    if (provider === selectedProvider) {
      return true;
    }
    if (!prefetchRequested) {
      return false;
    }
    return prefetchProviderSet?.has(provider) ?? !hiddenProviderSet.has(provider);
  };

  const groqModelDiscoveryEnabled = shouldDiscoverProvider("groq");
  const opencodeZenModelDiscoveryEnabled = shouldDiscoverProvider("opencodeZen");
  const opencodeGoModelDiscoveryEnabled = shouldDiscoverProvider("opencodeGo");

  const groqDynamicModelsQuery = useQuery(
    providerModelsQueryOptions({
      provider: "groq",
      enabled: groqModelDiscoveryEnabled,
    }),
  );
  const opencodeZenDynamicModelsQuery = useQuery(
    providerModelsQueryOptions({
      provider: "opencodeZen",
      enabled: opencodeZenModelDiscoveryEnabled,
    }),
  );
  const opencodeGoDynamicModelsQuery = useQuery(
    providerModelsQueryOptions({
      provider: "opencodeGo",
      enabled: opencodeGoModelDiscoveryEnabled,
    }),
  );

  // Agent/mode discovery (kilo/opencode "Mode"/"Agent" picker, claude/codex subagents).

  const groqModelDiscoveryPending =
    groqModelDiscoveryEnabled && isInitialModelDiscoveryPending(groqDynamicModelsQuery);
  const opencodeZenModelDiscoveryPending =
    opencodeZenModelDiscoveryEnabled && isInitialModelDiscoveryPending(opencodeZenDynamicModelsQuery);
  const opencodeGoModelDiscoveryPending =
    opencodeGoModelDiscoveryEnabled && isInitialModelDiscoveryPending(opencodeGoDynamicModelsQuery);

  const modelOptionsByProvider = useMemo(() => {
    const staticOptions: Record<ProviderKind, ReturnType<typeof getAppModelOptions>> = {
      groq: getAppModelOptions("groq", customModelsByProvider.groq, modelHintByProvider?.groq),
      opencodeZen: getAppModelOptions(
        "opencodeZen",
        customModelsByProvider.opencodeZen,
        modelHintByProvider?.opencodeZen,
      ),
      opencodeGo: getAppModelOptions(
        "opencodeGo",
        customModelsByProvider.opencodeGo,
        modelHintByProvider?.opencodeGo,
      ),
      engine: getAppModelOptions(
        "engine",
        customModelsByProvider.engine,
        modelHintByProvider?.engine,
      ),
    };
    const result: Record<
      ProviderKind,
      ReadonlyArray<ProviderModelOption & { isCustom?: boolean }>
    > = { ...staticOptions };
    const dynamicSources: Record<ProviderKind, typeof groqDynamicModelsQuery.data> = {
      groq: groqDynamicModelsQuery.data,
      opencodeZen: opencodeZenDynamicModelsQuery.data,
      opencodeGo: opencodeGoDynamicModelsQuery.data,
      engine: undefined,
    };
    for (const provider of ["groq", "opencodeZen", "opencodeGo"] as const) {
      const dynamicModels = dynamicSources[provider]?.models;
      if (dynamicModels && dynamicModels.length > 0) {
        result[provider] = mergeDynamicModelOptions({
          provider,
          staticOptions: staticOptions[provider],
          dynamicModels,
        });
      }
    }
    return result;
  }, [
    customModelsByProvider,
    groqDynamicModelsQuery.data,
    modelHintByProvider,
    opencodeGoDynamicModelsQuery.data,
    opencodeZenDynamicModelsQuery.data,
  ]);

  const loadingModelProviders = useMemo<Partial<Record<ProviderKind, boolean>>>(
    () => ({
      groq: groqModelDiscoveryPending,
      opencodeZen: opencodeZenModelDiscoveryPending,
      opencodeGo: opencodeGoModelDiscoveryPending,
    }),
    [
      groqModelDiscoveryPending,
      opencodeZenModelDiscoveryPending,
      opencodeGoModelDiscoveryPending,
    ],
  );

  const runtimeModelsByProvider = useMemo<
    Record<ProviderKind, ReadonlyArray<ProviderModelDescriptor>>
  >(
    () => ({
      groq: groqDynamicModelsQuery.data?.models ?? [],
      opencodeZen: opencodeZenDynamicModelsQuery.data?.models ?? [],
      opencodeGo: opencodeGoDynamicModelsQuery.data?.models ?? [],
      engine: [],
    }),
    [
      groqDynamicModelsQuery.data?.models,
      opencodeZenDynamicModelsQuery.data?.models,
      opencodeGoDynamicModelsQuery.data?.models,
    ],
  );

  const selectedRuntimeModel = useMemo(
    () =>
      resolveRuntimeModelDescriptor({
        provider: selectedProvider,
        model: modelHintByProvider?.[selectedProvider] ?? null,
        runtimeModels: runtimeModelsByProvider[selectedProvider],
      }),
    [modelHintByProvider, runtimeModelsByProvider, selectedProvider],
  );

  const selectedDynamicAgents = EMPTY_PROVIDER_AGENTS;
  const selectedRuntimeAgents = useMemo<ReadonlyArray<ProviderAgentDescriptor>>(
    () =>
      selectedDynamicAgents.map((agent) =>
        agent.description
          ? { name: agent.name, displayName: agent.displayName, description: agent.description }
          : { name: agent.name, displayName: agent.displayName },
      ),
    [selectedDynamicAgents],
  );

  const selectedProviderModelsQuery =
    selectedProvider === "groq"
      ? groqDynamicModelsQuery
      : selectedProvider === "opencodeZen"
        ? opencodeZenDynamicModelsQuery
        : opencodeGoDynamicModelsQuery;
  const selectedProviderModelsLoading =
    selectedProviderRuntimeModelDiscoveryPending ||
    (loadingModelProviders[selectedProvider] === undefined &&
      (selectedProviderModelsQuery.isLoading ||
        (selectedProviderModelsQuery.isFetching &&
          selectedProviderModelsQuery.data === undefined)));

  return useMemo(
    () => ({
      customModelsByProvider,
      modelOptionsByProvider,
      loadingModelProviders,
      runtimeModelsByProvider,
      selectedRuntimeModel,
      selectedRuntimeAgents,
      selectedProviderModelsLoading,
      selectedProviderRuntimeModelDiscoveryPending,
    }),
    [
      customModelsByProvider,
      loadingModelProviders,
      modelOptionsByProvider,
      runtimeModelsByProvider,
      selectedProviderModelsLoading,
      selectedProviderRuntimeModelDiscoveryPending,
      selectedRuntimeAgents,
      selectedRuntimeModel,
    ],
  );
}