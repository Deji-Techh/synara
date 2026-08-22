// FILE: useProviderModelCatalog.test.tsx
// Purpose: Locks the shared provider-model catalog's memoization and discovery policy.
// Layer: Web hook tests

import {
  DEFAULT_SERVER_SETTINGS,
  type ProviderKind,
  type ProviderModelDescriptor,
} from "@caide/contracts";
import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProviderModelCatalog } from "./useProviderModelCatalog";
import { useProviderModelCatalog } from "./useProviderModelCatalog";

const mocks = vi.hoisted(() => ({
  useAppSettings: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useQuery: mocks.useQuery };
});

vi.mock("../appSettings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../appSettings")>();
  return { ...actual, useAppSettings: mocks.useAppSettings };
});

interface QueryOptionsLike {
  readonly queryKey: readonly unknown[];
  readonly enabled?: boolean;
}

interface QueryResultLike {
  readonly data?: {
    readonly agents?: ReadonlyArray<{ name: string; displayName: string }>;
    readonly cached?: boolean;
    readonly models?: ReadonlyArray<ProviderModelDescriptor>;
    readonly source?: string;
  };
  readonly isFetching: boolean;
  readonly isLoading: boolean;
  readonly isPlaceholderData: boolean;
}

const EMPTY_QUERY: QueryResultLike = {
  isFetching: false,
  isLoading: false,
  isPlaceholderData: false,
};
const modelQueries = new Map<ProviderKind, QueryResultLike>();
const agentQueries = new Map<ProviderKind, QueryResultLike>();
const MODEL_HINTS = { groq: "llama-3.3-70b" } as const;
const SETTINGS = {
  customGroqModels: ["groq-custom"],
  hiddenProviders: [],
};

function readCatalogRenders(
  input: Parameters<typeof useProviderModelCatalog>[0],
): ProviderModelCatalog[] {
  const results: ProviderModelCatalog[] = [];

  function Probe() {
    const [renderIndex, setRenderIndex] = useState(0);
    results.push(useProviderModelCatalog(input));
    if (renderIndex === 0) {
      setRenderIndex(1);
    }
    return null;
  }

  renderToStaticMarkup(<Probe />);
  expect(results).toHaveLength(2);
  return results;
}

function readAgentQueryEnabled(provider: ProviderKind): boolean | undefined {
  const call = mocks.useQuery.mock.calls.find(([value]) => {
    const queryKey = (value as QueryOptionsLike).queryKey;
    return queryKey[1] === "agents" && queryKey[2] === provider;
  });
  return call ? (call[0] as QueryOptionsLike).enabled : undefined;
}

function readModelQueryEnabled(provider: ProviderKind): boolean | undefined {
  const call = mocks.useQuery.mock.calls.find(([value]) => {
    const queryKey = (value as QueryOptionsLike).queryKey;
    return queryKey[1] === "models" && queryKey[2] === provider;
  });
  return call ? (call[0] as QueryOptionsLike).enabled : undefined;
}

beforeEach(() => {
  modelQueries.clear();
  agentQueries.clear();
  mocks.useAppSettings
    .mockReset()
    .mockReturnValue({ settings: SETTINGS, serverSettings: DEFAULT_SERVER_SETTINGS });
  mocks.useQuery.mockReset().mockImplementation((value: QueryOptionsLike) => {
    const [, resource, provider] = value.queryKey;
    if (resource === "models") {
      return modelQueries.get(provider as ProviderKind) ?? EMPTY_QUERY;
    }
    if (resource === "agents") {
      return agentQueries.get(provider as ProviderKind) ?? EMPTY_QUERY;
    }
    throw new Error(`Unexpected provider catalog query: ${String(resource)}`);
  });
});

describe("useProviderModelCatalog", () => {
  it("keeps aggregate identities stable when inputs and query data are unchanged", () => {
    const [first, second] = readCatalogRenders({
      selectedProvider: "groq",
      discoveryEnabled: true,
      modelHintByProvider: MODEL_HINTS,
    });

    expect(second).toBe(first);
    expect(second?.customModelsByProvider).toBe(first?.customModelsByProvider);
    expect(second?.modelOptionsByProvider).toBe(first?.modelOptionsByProvider);
    expect(second?.loadingModelProviders).toBe(first?.loadingModelProviders);
    expect(second?.runtimeModelsByProvider).toBe(first?.runtimeModelsByProvider);
    expect(second?.selectedRuntimeAgents).toBe(first?.selectedRuntimeAgents);
  });

  it("discovers core agents only when selected unless eager-core is requested", () => {
    readCatalogRenders({ selectedProvider: "groq", discoveryEnabled: false });
    expect(readAgentQueryEnabled("anthropic")).toBe(false);
    expect(readAgentQueryEnabled("openai")).toBe(false);

    mocks.useQuery.mockClear();
    readCatalogRenders({
      selectedProvider: "groq",
      discoveryEnabled: false,
      agentDiscoveryPolicy: "eager-core",
    });
    expect(readAgentQueryEnabled("anthropic")).toBe(true);
    expect(readAgentQueryEnabled("openai")).toBe(true);
  });

  it("does not prefetch providers hidden from picker surfaces", () => {
    mocks.useAppSettings.mockReturnValue({
      settings: { ...SETTINGS, hiddenProviders: ["groq"] },
      serverSettings: DEFAULT_SERVER_SETTINGS,
    });

    readCatalogRenders({ selectedProvider: "groq", discoveryEnabled: true });

    expect(readModelQueryEnabled("groq")).toBe(true);
    expect(readModelQueryEnabled("opencodeZen")).toBe(true);
  });

  it("keeps an enabled selected provider discoverable when it is hidden", () => {
    mocks.useAppSettings.mockReturnValue({
      settings: { ...SETTINGS, hiddenProviders: ["groq"] },
      serverSettings: DEFAULT_SERVER_SETTINGS,
    });

    readCatalogRenders({ selectedProvider: "groq", discoveryEnabled: false });

    expect(readModelQueryEnabled("groq")).toBe(true);
  });

  it("does not discover a disabled provider even when it is selected", () => {
    mocks.useAppSettings.mockReturnValue({
      settings: SETTINGS,
      serverSettings: {
        ...DEFAULT_SERVER_SETTINGS,
        providers: {
          ...DEFAULT_SERVER_SETTINGS.providers,
          groq: {
            ...DEFAULT_SERVER_SETTINGS.providers.groq,
            enabled: false,
          },
        },
      },
    });

    readCatalogRenders({ selectedProvider: "groq", discoveryEnabled: true });

    expect(readModelQueryEnabled("groq")).toBe(false);
  });

  it("keeps discovering while the server settings are unavailable", () => {
    mocks.useAppSettings.mockReturnValue({ settings: SETTINGS, serverSettings: undefined });

    readCatalogRenders({ selectedProvider: "groq", discoveryEnabled: true });

    expect(readModelQueryEnabled("groq")).toBe(true);
  });

  it("keeps discovering the selected provider when the settings omit it", () => {
    const { groq: _groq, ...providersWithoutGroq } = DEFAULT_SERVER_SETTINGS.providers;
    mocks.useAppSettings.mockReturnValue({
      settings: SETTINGS,
      serverSettings: { ...DEFAULT_SERVER_SETTINGS, providers: providersWithoutGroq as any },
    });

    readCatalogRenders({ selectedProvider: "groq", discoveryEnabled: false });

    expect(readModelQueryEnabled("groq")).toBe(true);
  });

  it("merges a settled runtime catalog with custom models without reporting loading", () => {
    modelQueries.set("groq", {
      data: {
        models: [{ slug: "llama-3.3-70b", name: "Llama 3.3 70B" }],
        source: "groq.api",
        cached: false,
      },
      isFetching: true,
      isLoading: false,
      isPlaceholderData: true,
    });

    const catalog = readCatalogRenders({
      selectedProvider: "groq",
      discoveryEnabled: true,
      modelHintByProvider: MODEL_HINTS,
    }).at(-1);

    expect(catalog?.modelOptionsByProvider.groq.map((model) => model.slug)).toContain("llama-3.3-70b");
    expect(catalog?.loadingModelProviders.groq).toBe(false);
    expect(catalog?.selectedProviderModelsLoading).toBe(false);
    expect(catalog?.runtimeModelsByProvider.groq).toEqual([
      { slug: "llama-3.3-70b", name: "Llama 3.3 70B" },
    ]);
  });
});
