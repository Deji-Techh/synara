// FILE: modelFavorites.ts
// Purpose: Shared storage keys + readers for per-provider favorite model slugs.
// Layer: Web local-storage helpers used by the model picker and model cycle shortcuts.

import type { ProviderKind } from "@caide/contracts";
import { Schema } from "effect";

export const FAVORITE_MODEL_STORAGE_KEYS = {
  engine: "caide:engine-favourite-models:v1",
  openrouter: "caide:openrouter-favourite-models:v1",
  ollama: "caide:ollama-favourite-models:v1",
  groq: "caide:groq-favourite-models:v1",
  opencodeZen: "caide:opencodeZen-favourite-models:v1",
  opencodeGo: "caide:opencodeGo-favourite-models:v1",
} as const;

export type FavoriteModelProvider = keyof typeof FAVORITE_MODEL_STORAGE_KEYS;

const FavoriteModelSlugsSchema = Schema.Array(Schema.String);

export function supportsModelFavorites(provider: ProviderKind): provider is FavoriteModelProvider {
  return provider in FAVORITE_MODEL_STORAGE_KEYS;
}

// Read favorite slugs for cycle order. Failures (SSR, parse errors) return [].
export function readFavoriteModelSlugs(provider: ProviderKind): string[] {
  if (!supportsModelFavorites(provider) || typeof globalThis.localStorage === "undefined") {
    return [];
  }
  try {
    const key = FAVORITE_MODEL_STORAGE_KEYS[provider];
    const raw = globalThis.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    const decoded = Schema.decodeUnknownSync(FavoriteModelSlugsSchema)(parsed);
    return decoded.filter((entry) => entry.trim().length > 0);
  } catch {
    return [];
  }
}
