// FILE: catalog.test.ts
// Purpose: 009 M1 gate — the server catalog is a re-export of the shared
// single source of truth (no divergent static copy), covering every
// engine-routed provider.

import { describe, expect, it } from "vitest";
import {
  MODEL_OPTIONS,
  FREE_OPENROUTER_MODEL_NAMES,
  findModelOption,
  getContextWindow,
} from "./catalog.ts";
import { MODEL_OPTIONS as SHARED_OPTIONS } from "@caide/shared/languageModelCatalog";

describe("unified model catalog (009 M1)", () => {
  it("re-exports the shared single source of truth", () => {
    expect(MODEL_OPTIONS).toEqual(SHARED_OPTIONS);
  });

  it("covers every engine-routed provider (static or documented discovery)", () => {
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
      "ollama",
      "lmstudio",
      "custom",
    ]) {
      expect(MODEL_OPTIONS[id]?.length ?? 0, id).toBeGreaterThan(0);
    }
    // chatgpt + mistral/together/cohere/fireworks resolve via OAuth device
    // flow, live local listing, or custom endpoints — no static entries.
    expect(MODEL_OPTIONS["chatgpt"] ?? []).toEqual([]);
    // Unified zen list carries the donor free tier.
    expect(MODEL_OPTIONS["opencode-zen"]?.map((m) => m.name)).toContain("deepseek-v4-flash-free");
  });

  it("keeps budget/taste lookups working on unified data", () => {
    expect(getContextWindow("openai", "gpt-5.6-sol")).toBe(372_000);
    expect(getContextWindow("azure", "gpt-5")).toBe(400_000);
    expect(getContextWindow("vertex", "gemini-2.5-pro")).toBe(1_048_576);
    expect(
      findModelOption("bedrock", "us.anthropic.claude-sonnet-4-5-20250929-v1:0")?.contextWindow,
    ).toBe(1_000_000);
    expect(FREE_OPENROUTER_MODEL_NAMES.length).toBeGreaterThan(0);
  });
});
