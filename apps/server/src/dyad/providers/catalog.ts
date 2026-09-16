// FILE: catalog.ts
// Purpose: Single-source-of-truth model catalog lives in
// `@caide/shared/languageModelCatalog` (009 M1 unification — the server and
// web previously carried divergent static copies). This module re-exports
// the data + type and keeps the server-side helpers (lookup, taste routing,
// budget windows, name constants) operating on it. Everything stays free of
// Pro gating: no gateway prefixes, no quota-gated entries, no
// subscription-only models (`auto/free-pro` was removed per free-entirely;
// `dollarSigns` are informational cost hints for the user's own keys).

import { MODEL_OPTIONS, type ModelOption } from "@caide/shared/languageModelCatalog";
import { sharedCustomProviders } from "./customProviders.ts";

export { MODEL_OPTIONS, type ModelOption };

export const GPT_5_2_MODEL_NAME = "gpt-5.2";
export const GPT_5_5_MODEL_NAME = "gpt-5.5";
export const GPT_5_6_LUNA_MODEL_NAME = "gpt-5.6-luna";
export const GPT_5_6_SOL_MODEL_NAME = "gpt-5.6-sol";
export const SONNET_4_6 = "claude-sonnet-4-6";
export const OPUS_4_6 = "claude-opus-4-6";
export const OPUS_4_8 = "claude-opus-4-8";
export const GEMINI_3_5_FLASH = "gemini-3.5-flash";
export const GEMINI_3_FLASH = "gemini-3-flash-preview";
export const GEMINI_3_1_PRO_PREVIEW = "gemini-3.1-pro-preview";
export const NEMOTRON_3_SUPER_FREE = "nvidia/nemotron-3-super-120b-a12b:free";
export const GPT_5_NANO = "gpt-5-nano";

export const FREE_OPENROUTER_MODEL_NAMES = MODEL_OPTIONS.openrouter
  .filter((model) => model.name.endsWith(":free") || model.name.endsWith("/free"))
  .map((model) => model.name);

/** Find a model's catalog entry (limits, temperature) by provider + name. */
export function findModelOption(providerId: string, modelName: string): ModelOption | undefined {
  const builtin = MODEL_OPTIONS[providerId]?.find((m) => m.name === modelName);
  if (builtin) return builtin;
  // Stored custom models (009 M5): user-defined ids resolve with their
  // declared limits, falling back to engine defaults downstream.
  try {
    const custom = sharedCustomProviders()
      .getCustomModels(providerId)
      .find((m) => m.name === modelName);
    if (!custom) return undefined;
    return {
      name: custom.name,
      displayName: custom.displayName ?? custom.name,
      description: "Custom model on a user-configured provider.",
      ...(custom.contextWindow !== undefined ? { contextWindow: custom.contextWindow } : {}),
      ...(custom.maxOutputTokens !== undefined ? { maxOutputTokens: custom.maxOutputTokens } : {}),
      ...(custom.temperature !== undefined ? { temperature: custom.temperature } : {}),
    };
  } catch {
    return undefined;
  }
}

/**
 * Highest-taste candidate (item 29). Unknown taste counts as 0 so any
 * benchmarked model wins; ties keep input order. Returns undefined for an
 * empty list.
 */
export function highestTasteModel(
  candidates: Array<{ providerId: string; modelId: string }>,
): { providerId: string; modelId: string; taste: number } | undefined {
  let best: { providerId: string; modelId: string; taste: number } | undefined;
  for (const c of candidates) {
    const taste = findModelOption(c.providerId, c.modelId)?.taste ?? 0;
    if (!best || taste > best.taste) best = { ...c, taste };
  }
  return best;
}

/** Context window for budget checks; defaults to 128k when unknown. */
export function getContextWindow(providerId: string, modelName: string): number {
  return findModelOption(providerId, modelName)?.contextWindow ?? 128_000;
}
