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
    defaultProvider: "openai",
    cursorBinaryPath: "",
    cursorApiEndpoint: "",
    antigravityBinaryPath: "",
    grokBinaryPath: "",
    droidBinaryPath: "",
    kiloBinaryPath: "",
    openCodeBinaryPath: "",
    piBinaryPath: "",
    piAgentDir: "",
    ...overrides,
  };
}

describe("resolveNewThreadModelPrefetchProvider", () => {
  it("prefers draft, then sticky, then project default, then app default", () => {
    expect(
      resolveNewThreadModelPrefetchProvider({
        draftActiveProvider: "openai",
        stickyActiveProvider: "openai",
        projectDefaultProvider: "openai",
        defaultProvider: "openai",
      }),
    ).toBe("openai");

    expect(
      resolveNewThreadModelPrefetchProvider({
        draftActiveProvider: null,
        stickyActiveProvider: "openai",
        projectDefaultProvider: "openai",
        defaultProvider: "openai",
      }),
    ).toBe("openai");

    expect(
      resolveNewThreadModelPrefetchProvider({
        stickyActiveProvider: null,
        projectDefaultProvider: "openai",
        defaultProvider: "openai",
      }),
    ).toBe("openai");

    expect(
      resolveNewThreadModelPrefetchProvider({
        projectDefaultProvider: null,
        defaultProvider: "anthropic",
      }),
    ).toBe("anthropic");
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
  it("matches ChatView cache keys for cwd-scoped and binary-scoped providers", () => {
    const settings = makeSettings({
      cursorBinaryPath: "/bin/agent",
      cursorApiEndpoint: "https://api.example",
      antigravityBinaryPath: "/bin/antigravity",
      openCodeBinaryPath: "/bin/opencode",
      piBinaryPath: "/bin/pi",
      piAgentDir: "/tmp/pi-agent",
    });

    const cursorOptions = providerModelsPrefetchQueryOptions({
      provider: "openai",
      settings,
    });
    expect(cursorOptions.queryKey).toEqual(
      providerDiscoveryQueryKeys.models("openai", "/bin/agent", "https://api.example", null, null),
    );

    const openCodeOptions = providerModelsPrefetchQueryOptions({
      provider: "openai",
      settings,
      cwd: "/tmp/project",
    });
    expect(openCodeOptions.queryKey).toEqual(
      providerDiscoveryQueryKeys.models("openai", "/bin/opencode", null, null, "/tmp/project"),
    );

    const piOptions = providerModelsPrefetchQueryOptions({
      provider: "openai",
      settings,
      cwd: "/tmp/project",
    });
    expect(piOptions.queryKey).toEqual(
      providerDiscoveryQueryKeys.models("openai", "/bin/pi", null, "/tmp/pi-agent", "/tmp/project"),
    );

    const antigravityOptions = providerModelsPrefetchQueryOptions({
      provider: "google",
      settings,
      cwd: "/tmp/project",
    });
    expect(antigravityOptions.queryKey).toEqual(
      providerDiscoveryQueryKeys.models("google", "/bin/antigravity", null, null, "/tmp/project"),
    );

    const codexOptions = providerModelsPrefetchQueryOptions({
      provider: "openai",
      settings,
    });
    expect(codexOptions.queryKey).toEqual(
      providerDiscoveryQueryKeys.models("openai", null, null, null, null),
    );
  });

  it("returns real options for every API provider so prefetchQuery never receives undefined", () => {
    const settings = makeSettings();
    for (const provider of API_PROVIDER_KINDS) {
      const options = providerModelsPrefetchQueryOptions({ provider, settings });
      expect(options, `no options for ${provider}`).toBeDefined();
      expect(options.queryKey).toEqual(
        providerDiscoveryQueryKeys.models(provider, null, null, null, null),
      );
    }
  });
});

describe("prefetchProviderModelsForNewThread", () => {
  it("prefetches models and agents for the resolved provider", async () => {
    const queryClient = new QueryClient();
    const prefetchQuery = vi.spyOn(queryClient, "prefetchQuery").mockResolvedValue(undefined);

    prefetchProviderModelsForNewThread(queryClient, {
      provider: "openai" satisfies ProviderKind,
      settings: makeSettings({
        kiloBinaryPath: "/bin/kilo",
      }),
      cwd: "/tmp/project",
    });

    expect(prefetchQuery).toHaveBeenCalledTimes(3);
    expect(prefetchQuery.mock.calls[0]?.[0].queryKey).toEqual(
      providerDiscoveryQueryKeys.models("openai", "/bin/kilo", null, null, "/tmp/project"),
    );
    expect(prefetchQuery.mock.calls[1]?.[0].queryKey).toEqual(
      providerDiscoveryQueryKeys.agents("openai", "/bin/kilo", "/tmp/project"),
    );
    expect(prefetchQuery.mock.calls[2]?.[0].queryKey).toEqual(
      providerDiscoveryQueryKeys.composerCapabilities("openai"),
    );
  });

  it("prefetches only models for providers without agent discovery", async () => {
    const queryClient = new QueryClient();
    const prefetchQuery = vi.spyOn(queryClient, "prefetchQuery").mockResolvedValue(undefined);

    prefetchProviderModelsForNewThread(queryClient, {
      provider: "openai",
      settings: makeSettings({ cursorBinaryPath: "/bin/agent" }),
    });

    expect(prefetchQuery).toHaveBeenCalledTimes(2);
    expect(prefetchQuery.mock.calls[0]?.[0].queryKey).toEqual(
      providerDiscoveryQueryKeys.models("openai", "/bin/agent", null, null, null),
    );
    expect(prefetchQuery.mock.calls[1]?.[0].queryKey).toEqual(
      providerDiscoveryQueryKeys.composerCapabilities("openai"),
    );
  });
});
