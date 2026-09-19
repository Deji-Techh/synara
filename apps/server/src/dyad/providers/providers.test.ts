// FILE: providers.test.ts
// Purpose: M1 gate — free-entirely provider layer: full catalog, direct
// routing, zero Pro surface.

import { describe, expect, it } from "vitest";
import {
  MODEL_OPTIONS,
  FREE_OPENROUTER_MODEL_NAMES,
  getContextWindow,
  highestTasteModel,
  findModelOption,
} from "./catalog.ts";
import { PROVIDERS, PROVIDER_TO_ENV_VAR, validateProviderSettings } from "./providers.ts";
import {
  resolveConnection,
  resolveAutoProvider,
  resolveProviderDefaultModel,
  hasProviderKey,
} from "./routing.ts";
import { resolveApiKeyOrThrow } from "./apiKey.ts";

describe("dyad providers transplant (m1, free-entirely)", () => {
  it("catalog covers all donor providers with limits", () => {
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
    ]) {
      expect(MODEL_OPTIONS[id]?.length ?? 0).toBeGreaterThan(0);
    }
    expect(getContextWindow("openai", "gpt-5.6-sol")).toBe(372_000);
    expect(getContextWindow("anthropic", "claude-opus-4-8")).toBe(1_000_000);
    expect(getContextWindow("nope", "nope")).toBe(128_000);
  });

  it("scores flagship taste and ranks candidates (item 29)", () => {
    expect(findModelOption("anthropic", "claude-opus-4-8")?.taste).toBe(8);
    expect(findModelOption("anthropic", "claude-sonnet-4-6")?.taste).toBe(7);
    expect(findModelOption("openai", "gpt-5.6-sol")?.taste).toBe(5);
    expect(findModelOption("google", "gemini-2.5-pro")?.taste).toBeUndefined();
    expect(
      highestTasteModel([
        { providerId: "openai", modelId: "gpt-5.6-sol" },
        { providerId: "anthropic", modelId: "claude-opus-4-8" },
      ]),
    ).toMatchObject({ providerId: "anthropic", modelId: "claude-opus-4-8", taste: 8 });
    expect(highestTasteModel([])).toBeUndefined();
  });

  it("carries zero Pro surface: no gateway prefixes, no free-pro gate", () => {
    expect(JSON.stringify(MODEL_OPTIONS)).not.toContain("gatewayPrefix");
    expect(MODEL_OPTIONS.auto.map((m) => m.name)).not.toContain("free-pro");
    expect(JSON.stringify(PROVIDERS)).not.toContain("gatewayPrefix");
    expect(JSON.stringify(PROVIDERS)).not.toMatch(/subscription|Dyad Pro/i);
    expect(FREE_OPENROUTER_MODEL_NAMES.length).toBeGreaterThan(0);
  });

  it("registry has direct base URLs for every streamable provider", () => {
    for (const [id, def] of Object.entries(PROVIDERS)) {
      if (def.transport !== "streamable") continue;
      if (id === "auto" || id === "custom" || id === "azure") continue;
      expect(def.baseUrl, id).toMatch(/^https?:\/\//);
    }
    expect(PROVIDER_TO_ENV_VAR.openai).toBe("OPENAI_API_KEY");
    expect(PROVIDER_TO_ENV_VAR.minimax).toBe("MINIMAX_API_KEY");
  });

  it("resolves direct connections: settings key wins, env fallback, keyless local", () => {
    const openai = resolveConnection("openai", "gpt-5.6-sol", {
      providerSettings: { openai: { apiKey: { value: " sk-test " } } },
    });
    expect(openai.apiKey).toBe("sk-test");
    expect(openai.endpoint).toBe("responses");
    expect(openai.baseUrl).toBe("https://api.openai.com/v1");

    const anthropic = resolveConnection("anthropic", "claude-opus-4-8", {
      providerSettings: { anthropic: { apiKey: "sk-ant-test" } },
    });
    expect(anthropic.endpoint).toBe("messages");

    const ollama = resolveConnection("ollama", "qwen3:8b", {});
    expect(ollama.apiKey).toBeUndefined();

    expect(() => resolveConnection("openai", "gpt-5", { providerSettings: {} })).toThrow(
      /API key is required/,
    );
  });

  it("rejects pasted non-key text and missing azure/custom config", () => {
    expect(() => resolveApiKeyOrThrow("sk-abc def", "OpenAI")).toThrow(/invalid character/);
    expect(() => resolveConnection("azure", "gpt-5", {})).toThrow(/resource name is required/);
    expect(() => resolveConnection("custom", "x", {})).toThrow(/API Base URL/);
    expect(() => resolveConnection("bedrock", "x", {})).toThrow(/not on fetch streaming yet/);
    expect(() => resolveConnection("nope", "x", {})).toThrow(/Unsupported/);
  });

  it("auto resolves first keyed provider, else keyless local runtimes", () => {
    expect(
      resolveAutoProvider({
        providerSettings: {
          google: { apiKey: "g-test" },
          openai: { apiKey: "sk-test" },
        },
      }),
    ).toBe("openai");
    expect(hasProviderKey("ollama", {})).toBe(true);
    expect(resolveAutoProvider({})).toBe("ollama");
    expect(resolveAutoProvider({ providerSettings: { vertex: {} } })).toBe("ollama");
  });

  it("resolveProviderDefaultModel never yields placeholder slugs", () => {
    expect(resolveProviderDefaultModel("openai", "gpt-5")).toBe("gpt-5");
    for (const placeholder of ["", "auto", "default", undefined, null]) {
      const resolved = resolveProviderDefaultModel("openai", placeholder as string | undefined);
      expect(resolved).toBeTruthy();
      expect(["auto", "default"]).not.toContain(resolved);
    }
    expect(resolveProviderDefaultModel("nope", "auto")).toBeUndefined();
  });
});

describe("provider settings validation (donor schema parity)", () => {
  it("accepts regular providers, flags azure/custom/vertex gaps", () => {
    expect(validateProviderSettings("openai", { apiKey: "sk-x" })).toMatchObject({ ok: true });
    expect(validateProviderSettings("ollama", {})).toMatchObject({ ok: true });
    expect(validateProviderSettings("nope", { apiKey: "k" })).toMatchObject({ ok: false });
    expect(validateProviderSettings("azure", { apiKey: "k" }).message).toMatch(/Resource Name/);
    expect(validateProviderSettings("azure", { apiKey: "k", resourceName: "r" }).ok).toBe(true);
    expect(validateProviderSettings("custom", {}).message).toMatch(/Base URL/);
    expect(validateProviderSettings("custom", { apiBaseUrl: "https://x/v1" }).ok).toBe(true);
    expect(validateProviderSettings("vertex", {}).message).toMatch(/service-account/i);
  });
});
