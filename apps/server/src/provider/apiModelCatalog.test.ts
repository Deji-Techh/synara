// FILE: apiModelCatalog.test.ts
// Purpose: Proves live /models discovery normalization, live+static merging,
// TTL caching, API-key cache busting, and static fallback on failure.
// Layer: Provider domain test

import { describe, expect, it, vi } from "vitest";

import {
  listLiveApiProviderModels,
  mergeLiveWithBuiltInModels,
  normalizeApiProviderModels,
} from "./apiModelCatalog.ts";

const BUILT_INS = [
  { slug: "known-free", name: "Known Free" },
  { slug: "other-builtin", name: "Other Built-in" },
] as const;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("normalizeApiProviderModels", () => {
  it("maps ids to descriptors and opportunistically reads provider metadata", () => {
    const models = normalizeApiProviderModels({
      data: [
        { id: "zeta-model", display_name: "Zeta Model", context_window: 128_000 },
        { id: "alpha-model", name: "Alpha Model", description: "Fast and cheap" },
        { id: "plain-model" },
      ],
    });

    expect(models.map((model) => model.slug)).toEqual(["alpha-model", "plain-model", "zeta-model"]);
    expect(models.find((model) => model.slug === "zeta-model")).toMatchObject({
      name: "Zeta Model",
      defaultContextWindow: "128k",
    });
    expect(models.find((model) => model.slug === "alpha-model")).toMatchObject({
      name: "Alpha Model",
      description: "Fast and cheap",
    });
    expect(models.find((model) => model.slug === "plain-model")?.name).toBe("Plain Model");
  });

  it("drops malformed entries, duplicates, and rejects non-array data", () => {
    const models = normalizeApiProviderModels({
      data: [{ id: "dupe" }, { id: "dupe" }, { nope: true }, null, "junk"],
    });
    expect(models).toHaveLength(1);

    expect(() => normalizeApiProviderModels({ data: "nope" })).toThrow();
    expect(() => normalizeApiProviderModels({})).toThrow();
  });
});

describe("mergeLiveWithBuiltInModels", () => {
  it("keeps discovered models first and fills gaps with built-ins", () => {
    const merged = mergeLiveWithBuiltInModels(
      [{ slug: "live-only", name: "Live Only" }],
      [...BUILT_INS],
    );

    expect(merged.map((model) => model.slug)).toEqual(["live-only", "known-free", "other-builtin"]);
  });

  it("prefers the live descriptor when a built-in slug is rediscovered", () => {
    const merged = mergeLiveWithBuiltInModels(
      [{ slug: "known-free", name: "Fresh Name", description: "live" }],
      [...BUILT_INS],
    );

    expect(merged.filter((model) => model.slug === "known-free")).toHaveLength(1);
    expect(merged.find((model) => model.slug === "known-free")?.description).toBe("live");
  });
});

describe("listLiveApiProviderModels", () => {
  it("fetches live models once and serves subsequent calls from cache", async () => {
    const fetchImpl = vi.fn(async (input: Request | string | URL) => {
      expect(String(input)).toBe("https://provider.example/v1/models");
      return jsonResponse({ data: [{ id: "live-a" }, { id: "live-b" }] });
    });
    const input = {
      provider: "groq",
      baseUrl: "https://provider.example/v1",
      apiKey: "sk-live-cache-test",
      builtInModels: [...BUILT_INS],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    } as const;

    const first = await listLiveApiProviderModels(input);
    expect(first.source).toBe("live");
    expect(first.cached).toBe(false);
    expect(first.models.map((model) => model.slug)).toEqual([
      "live-a",
      "live-b",
      "known-free",
      "other-builtin",
    ]);

    const second = await listLiveApiProviderModels(input);
    expect(second.cached).toBe(true);
    expect(second.models.map((model) => model.slug)).toEqual(
      first.models.map((model) => model.slug),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("busts the cached entry when the API key changes", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [{ id: "keyed-model" }] }));
    const input = {
      provider: "opencodeGo",
      baseUrl: "https://go.example/v1",
      apiKey: "first-key",
      builtInModels: [],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    } as const;

    await listLiveApiProviderModels(input);
    const rotated = await listLiveApiProviderModels({ ...input, apiKey: "second-key" });

    expect(rotated.cached).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("falls back to the static catalog when discovery fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const failed = await listLiveApiProviderModels({
        provider: "opencodeZen",
        baseUrl: "https://zen.example/v1",
        apiKey: "sk-zen",
        builtInModels: [...BUILT_INS],
        fetchImpl: (async () =>
          jsonResponse({ message: "denied" }, 401)) as unknown as typeof fetch,
      });
      expect(failed).toEqual({ models: [...BUILT_INS], source: "static", cached: false });

      const rejected = await listLiveApiProviderModels({
        provider: "opencodeZen",
        baseUrl: "https://zen2.example/v1",
        apiKey: "sk-zen",
        builtInModels: [...BUILT_INS],
        fetchImpl: (async () => {
          throw new Error("network down");
        }) as unknown as typeof fetch,
      });
      expect(rejected.source).toBe("static");
      expect(rejected.models).toEqual([...BUILT_INS]);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("treats an empty catalogue like a failure and expires entries past the TTL", async () => {
    vi.useFakeTimers();
    try {
      let nowMs = 1_000_000;
      const dateSpy = vi.spyOn(Date, "now").mockImplementation(() => nowMs);
      const fetchImpl = vi.fn(async () => jsonResponse({ data: [{ id: "ttl-model" }] }));
      const input = {
        provider: "groq",
        baseUrl: "https://ttl.example/v1",
        apiKey: "sk-ttl",
        builtInModels: [],
        fetchImpl: fetchImpl as unknown as typeof fetch,
        cacheTtlMs: 60_000,
      } as const;

      expect(await listLiveApiProviderModels(input)).toMatchObject({ cached: false });
      nowMs += 59_000;
      expect(await listLiveApiProviderModels(input)).toMatchObject({ cached: true });
      nowMs += 2_000;
      const expired = await listLiveApiProviderModels(input);
      expect(expired.cached).toBe(false);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      dateSpy.mockRestore();

      const empty = await listLiveApiProviderModels({
        provider: "groq",
        baseUrl: "https://empty.example/v1",
        apiKey: "sk-empty",
        builtInModels: [...BUILT_INS],
        fetchImpl: (async () => jsonResponse({ data: [] })) as unknown as typeof fetch,
      });
      expect(empty.source).toBe("static");
    } finally {
      vi.useRealTimers();
    }
  });
});
