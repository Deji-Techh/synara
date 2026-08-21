// FILE: providerModelPrefetch.test.ts
// Purpose: Verifies new-thread model prefetch resolves providers/cwds and hits
//          the same React Query keys ChatView uses for listModels.
// Layer: Web lib tests

import { API_PROVIDER_KINDS, type ProviderKind } from "@caide/contracts";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  prefetchProviderModelsForNewThread,
  providerModelsPrefetchQueryOptions,
  resolveNewThreadModelPrefetchCwd,
  resolveNewThreadModelPrefetchProvider,
  type ProviderModelPrefetchSettings,
} from "./providerModelPrefetch";
import { providerDiscoveryQueryKeys } from "./providerDiscoveryReactQuery";

afterEach(() => {
  vi.restoreAllMocks();
});

function makeSettings(
  overrides: Partial<ProviderModelPrefetchSettings> = {},
): ProviderModelPrefetchSettings {
  return {
    defaultProvider: "groq",
    ...overrides,
  };
}

describe("resolveNewThreadModelPrefetchProvider", () => {
  it("prefers draft, then sticky, then project default, then app default", () => {
    expect(
      resolveNewThreadModelPrefetchProvider({
        draftActiveProvider: "engine",
        stickyActiveProvider: "groq",
        projectDefaultProvider: "groq",
        defaultProvider: "groq",
      }),
    ).toBe("engine");

    expect(
      resolveNewThreadModelPrefetchProvider({
        draftActiveProvider: null,
        stickyActiveProvider: "groq",
        projectDefaultProvider: "groq",
        defaultProvider: "groq",
      }),
    ).toBe("groq");

    expect(
      resolveNewThreadModelPrefetchProvider({
        stickyActiveProvider: null,
        projectDefaultProvider: "opencodeZen",
        defaultProvider: "groq",
      }),
    ).toBe("opencodeZen");

    expect(
      resolveNewThreadModelPrefetchProvider({
        projectDefaultProvider: null,
        defaultProvider: "opencodeGo",
      }),
    ).toBe("opencodeGo");
  });
});

describe("resolveNewThreadModelPrefetchCwd", () => {
  it("prefers draft worktree, then project cwd, then server cwd", () => {
    expect(
      resolveNewThreadModelPrefetchCwd({
        draftWorktreePath: "/tmp/worktree",
        projectCwd: "/tmp/project",
        serverCwd: "/tmp/server",
      }),
    ).toBe("/tmp/worktree");

    expect(
      resolveNewThreadModelPrefetchCwd({
        draftWorktreePath: null,
        projectCwd: "/tmp/project",
        serverCwd: "/tmp/server",
      }),
    ).toBe("/tmp/project");

    expect(
      resolveNewThreadModelPrefetchCwd({
        projectCwd: null,
        serverCwd: "/tmp/server",
      }),
    ).toBe("/tmp/server");
  });
});

describe("providerModelsPrefetchQueryOptions", () => {
  it("returns real options for every API provider so prefetchQuery never receives undefined", () => {
    const settings = makeSettings();
    for (const provider of API_PROVIDER_KINDS) {
      const options = providerModelsPrefetchQueryOptions({ provider, settings });
      expect(options, `no options for ${provider}`).toBeDefined();
      expect(options.queryKey).toEqual(
        providerDiscoveryQueryKeys.models(provider, null, null, null, null),
      );
    }

    const engineOptions = providerModelsPrefetchQueryOptions({ provider: "engine", settings });
    expect(engineOptions.queryKey).toEqual(
      providerDiscoveryQueryKeys.models("engine", null, null, null, null),
    );
  });
});

describe("prefetchProviderModelsForNewThread", () => {
  it("prefetches models and composer capabilities for the resolved provider", async () => {
    const queryClient = new QueryClient();
    const prefetchQuery = vi.spyOn(queryClient, "prefetchQuery").mockResolvedValue(undefined);

    prefetchProviderModelsForNewThread(queryClient, {
      provider: "groq" satisfies ProviderKind,
      settings: makeSettings(),
      cwd: "/tmp/project",
    });

    expect(prefetchQuery).toHaveBeenCalledTimes(2);
    expect(prefetchQuery.mock.calls[0]?.[0].queryKey).toEqual(
      providerDiscoveryQueryKeys.models("groq", null, null, null, null),
    );
    expect(prefetchQuery.mock.calls[1]?.[0].queryKey).toEqual(
      providerDiscoveryQueryKeys.composerCapabilities("groq"),
    );
  });
});
