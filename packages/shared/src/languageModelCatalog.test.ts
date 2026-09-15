import { describe, expect, it, vi, afterEach } from "vitest";
import {
  MODEL_OPTIONS,
  tasteForModelSlug,
  getBuiltInModelsForProvider,
  isOpenCodeZenFreeModelId,
  OPENCODE_ZEN_FREE_MODEL_IDS,
  KNOWN_BUILTIN_MODEL_ALIASES,
  parseRemoteCatalogResponse,
  getBuiltinLanguageModelCatalog,
  resolveBuiltinModelAlias,
  resetBuiltinCatalogForTests,
} from "./languageModelCatalog";

describe("model taste scores (item 29)", () => {
  it("annotates benchmarked flagships in the static catalog", () => {
    const find = (provider: string, name: string) =>
      MODEL_OPTIONS[provider]?.find((m) => m.name === name)?.taste;
    expect(find("anthropic", "claude-opus-4-8")).toBe(8);
    expect(find("anthropic", "claude-sonnet-4-6")).toBe(7);
    expect(find("openai", "gpt-5.6-sol")).toBe(5);
  });

  it("resolves taste from discovery slugs, parameterized included", () => {
    expect(tasteForModelSlug("claude-opus-4-8")).toBe(8);
    expect(tasteForModelSlug("anthropic/claude-sonnet-4-6")).toBe(7);
    expect(tasteForModelSlug("gpt-5.6-sol[high]")).toBe(5);
    expect(tasteForModelSlug("  ")).toBeUndefined();
    expect(tasteForModelSlug("some-unknown-model")).toBeUndefined();
  });
});

describe("unified catalog coverage (009 M1)", () => {
  it("covers every engine-routed provider with models", () => {
    for (const id of [
      "openai",
      "anthropic",
      "google",
      "vertex",
      "openrouter",
      "auto",
      "azure",
      "xai",
      "bedrock",
      "minimax",
      "deepseek",
      "groq",
      "opencode-zen",
      "opencode-go",
      "ollama",
      "lmstudio",
      "custom",
    ]) {
      expect(getBuiltInModelsForProvider(id).length, id).toBeGreaterThan(0);
    }
    // chatgpt + mistral/together/cohere/fireworks resolve via discovery or
    // custom endpoints — no static entries by design (documented, not drift).
    expect(getBuiltInModelsForProvider("chatgpt")).toEqual([]);
  });

  it("serves the canonical zen list under both spellings", () => {
    const kebab = getBuiltInModelsForProvider("opencode-zen");
    expect(getBuiltInModelsForProvider("opencodezen")).toEqual(kebab);
    expect(kebab.map((m) => m.name)).toContain("deepseek-v4-flash-free");
  });

  it("recognizes Zen free-tier ids (known set + -free suffix)", () => {
    expect(OPENCODE_ZEN_FREE_MODEL_IDS.length).toBeGreaterThanOrEqual(6);
    expect(isOpenCodeZenFreeModelId("big-pickle")).toBe(true);
    expect(isOpenCodeZenFreeModelId("some-future-model-free")).toBe(true);
    expect(isOpenCodeZenFreeModelId("gpt-5.6-sol")).toBe(false);
    expect(isOpenCodeZenFreeModelId("  ")).toBe(false);
  });

  it("lists all builtin alias ids", () => {
    expect(KNOWN_BUILTIN_MODEL_ALIASES).toContain("dyad/help-bot/default");
    expect(KNOWN_BUILTIN_MODEL_ALIASES).toContain("caide/theme-generator/deepseek");
  });
});

describe("remote catalog client (009 M1)", () => {
  afterEach(() => {
    resetBuiltinCatalogForTests();
    vi.unstubAllGlobals();
  });

  it("guards malformed payloads to fallback", () => {
    expect(parseRemoteCatalogResponse(null)).toBeNull();
    expect(parseRemoteCatalogResponse({})).toBeNull();
    expect(parseRemoteCatalogResponse({ version: "1", providers: [], aliases: [] })).toBeNull();
  });

  it("parses a minimal valid payload and merges required aliases", () => {
    const parsed = parseRemoteCatalogResponse({
      version: "9",
      providers: [{ id: "openai", displayName: "OpenAI", type: "cloud" }],
      modelsByProvider: {
        openai: [{ apiName: "gpt-x", displayName: "GPT X", description: "d" }],
      },
      aliases: [],
    });
    expect(parsed?.version).toBe("9");
    expect(parsed?.providers).toEqual([{ id: "openai", name: "OpenAI" }]);
    expect(parsed?.modelsByProvider.openai?.[0]).toMatchObject({ name: "gpt-x" });
    // Required donor aliases merge in even when the remote omits them.
    expect(parsed?.aliases.map((a) => a.id)).toContain("dyad/help-bot/default");
  });

  it("falls back when the remote endpoint fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, statusText: "err" })),
    );
    const catalog = await getBuiltinLanguageModelCatalog();
    expect(catalog.source).toBe("fallback");
    expect(catalog.aliases.map((a) => a.id)).toContain("dyad/auto/openai");
  });

  it("serves remote data and resolves aliases from it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          version: "7",
          providers: [{ id: "openai", displayName: "OpenAI", type: "cloud" }],
          modelsByProvider: {
            openai: [{ apiName: "gpt-remote", displayName: "GPT Remote", description: "r" }],
          },
          aliases: [
            {
              id: "dyad/help-bot/default",
              resolvedModel: { providerId: "openai", apiName: "gpt-remote" },
            },
          ],
        }),
      })),
    );
    const catalog = await getBuiltinLanguageModelCatalog();
    expect(catalog.source).toBe("remote");
    expect(catalog.modelsByProvider.openai?.[0]).toMatchObject({ name: "gpt-remote" });
    expect(await resolveBuiltinModelAlias("dyad/help-bot/default")).toEqual({
      providerId: "openai",
      apiName: "gpt-remote",
    });
  });

  it("resolves caide theme aliases without network", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("must not fetch");
      }),
    );
    await expect(resolveBuiltinModelAlias("caide/theme-generator/chatgpt")).resolves.toEqual({
      providerId: "chatgpt",
      apiName: "gpt-5.5",
    });
  });
});
