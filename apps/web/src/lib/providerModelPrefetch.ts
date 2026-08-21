// FILE: providerModelPrefetch.ts
// Purpose: Warm provider model discovery and composer capabilities into the
//          React Query cache before a new thread mounts ChatView, so the
//          composer can skip the "Loading models" skeleton and capability
//          round-trips on the common new-thread path.
// Layer: Web lib
// Exports: resolve + prefetch helpers that mirror ChatView's listModels query keys.

import type { ProviderKind } from "@caide/contracts";
import type { QueryClient } from "@tanstack/react-query";

import type { AppSettings } from "../appSettings";
import { resolveProviderDiscoveryCwd } from "./providerDiscovery";
import {
  providerComposerCapabilitiesQueryOptions,
  providerModelsQueryOptions,
} from "./providerDiscoveryReactQuery";

export type ProviderModelPrefetchSettings = Pick<AppSettings, "defaultProvider">;

export function resolveNewThreadModelPrefetchProvider(input: {
  draftActiveProvider?: ProviderKind | null | undefined;
  stickyActiveProvider?: ProviderKind | null | undefined;
  projectDefaultProvider?: ProviderKind | null | undefined;
  defaultProvider: ProviderKind;
}): ProviderKind {
  return (
    input.draftActiveProvider ??
    input.stickyActiveProvider ??
    input.projectDefaultProvider ??
    input.defaultProvider ?? "groq"
  );
}

export function resolveNewThreadModelPrefetchCwd(input: {
  draftWorktreePath?: string | null | undefined;
  projectCwd?: string | null | undefined;
  serverCwd?: string | null | undefined;
}): string | null {
  return resolveProviderDiscoveryCwd({
    activeThreadWorktreePath: input.draftWorktreePath ?? null,
    activeProjectCwd: input.projectCwd ?? null,
    serverCwd: input.serverCwd ?? null,
  });
}

/**
 * Build the same listModels query options ChatView uses for a provider, so a
 * prefetch lands on the exact cache key the composer will read on mount.
 */
export function providerModelsPrefetchQueryOptions(input: {
  provider: ProviderKind;
  settings: ProviderModelPrefetchSettings;
  cwd?: string | null;
}) {
  // API providers and the engine talk to HTTP endpoints with no CLI args; ChatView
  // issues the same generic discovery query for all of them, so the prefetch cache
  // key must match exactly.
  void input.settings;
  void input.cwd;
  return providerModelsQueryOptions({ provider: input.provider });
}

function providerAgentsPrefetchQueryOptions(input: {
  provider: ProviderKind;
  settings: ProviderModelPrefetchSettings;
  cwd?: string | null;
}) {
  // No surviving provider surfaces an agent/mode list from a CLI; kept as a
  // hook point for future providers.
  void input;
  return null;
}

export function prefetchProviderModelsForNewThread(
  queryClient: QueryClient,
  input: {
    provider: ProviderKind;
    settings: ProviderModelPrefetchSettings;
    cwd?: string | null;
  },
): void {
  const cwd = input.cwd ?? null;
  const modelsOptions = providerModelsPrefetchQueryOptions({
    provider: input.provider,
    settings: input.settings,
    cwd,
  });
  if (modelsOptions) {
    // Warm model discovery for the thread the user is about to open. The
    // options builder always returns a real options object, but keep the guard
    // so an unrecognized future provider kind degrades to a skipped prefetch
    // instead of a runtime throw inside prefetchQuery.
    void queryClient.prefetchQuery(modelsOptions);
  }

  // Agent/mode lists ride along for providers that surface them next to models.
  const agentsOptions = providerAgentsPrefetchQueryOptions({
    provider: input.provider,
    settings: input.settings,
    cwd,
  });
  if (agentsOptions) {
    void queryClient.prefetchQuery(agentsOptions);
  }

  // Composer capabilities gate composer affordances on ChatView mount; the query
  // has staleTime Infinity, so this costs one IPC per provider per session.
  void queryClient.prefetchQuery(providerComposerCapabilitiesQueryOptions(input.provider));
}
