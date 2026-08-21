// FILE: apiModelCatalog.ts
// Purpose: Live `/models` discovery for OpenAI-compatible API-key providers with a
//          TTL cache keyed by provider+baseUrl and cache-busting on API key changes.
// Layer: Server provider domain

import { createHash } from "node:crypto";

import type {
  ApiProviderKind,
  ProviderListModelsResult,
  ProviderModelDescriptor,
} from "@caide/contracts";
import { humanizeModelSlug } from "@caide/shared/model";

const MODEL_LIST_TIMEOUT_MS = 8_000;
export const MODEL_LIST_CACHE_TTL_MS = 5 * 60_000;

interface ApiModelCatalogCacheEntry {
  readonly models: ReadonlyArray<ProviderModelDescriptor>;
  readonly fetchedAtMs: number;
  readonly keyFingerprint: string;
}

const cache = new Map<string, ApiModelCatalogCacheEntry>();

export function apiKeyFingerprint(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

/**
 * Tolerant shape for OpenAI-compatible `GET /v1/models` payloads. Only `id` is
 * required; optional fields commonly present across providers (OpenRouter's
 * `name`/`description`, Groq's `context_window`) are surfaced when present.
 */
type OpenAiCompatibleModelEntry = {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly display_name?: unknown;
  readonly description?: unknown;
  readonly context_window?: unknown;
  readonly context_length?: unknown;
};

type OpenAiCompatibleModelsPayload = {
  readonly data?: unknown;
};

const asTrimmedNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const asPositiveInteger = (value: unknown): number | undefined => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.floor(value);
};

function formatContextWindowLabel(contextWindow: number): string {
  if (contextWindow >= 1_000_000 && contextWindow % 1_000_000 === 0) {
    return `${contextWindow / 1_000_000}m`;
  }
  if (contextWindow >= 1_000 && contextWindow % 1_000 === 0) {
    return `${contextWindow / 1_000}k`;
  }
  return String(contextWindow);
}

export function normalizeApiProviderModels(payload: unknown): Array<ProviderModelDescriptor> {
  const data =
    typeof payload === "object" && payload !== null && "data" in payload
      ? (payload as OpenAiCompatibleModelsPayload).data
      : undefined;
  if (!Array.isArray(data)) {
    throw new Error("model catalogue response is missing a `data` array");
  }
  const entries = data as ReadonlyArray<unknown>;

  const bySlug = new Map<string, ProviderModelDescriptor>();
  for (const rawEntry of entries) {
    if (typeof rawEntry !== "object" || rawEntry === null) continue;
    const entry = rawEntry as OpenAiCompatibleModelEntry;
    const slug = asTrimmedNonEmptyString(entry.id);
    if (!slug) continue;
    if (bySlug.has(slug)) continue;

    const displayName =
      asTrimmedNonEmptyString(entry.display_name) ?? asTrimmedNonEmptyString(entry.name);
    const description = asTrimmedNonEmptyString(entry.description);
    const contextWindow =
      asPositiveInteger(entry.context_window) ?? asPositiveInteger(entry.context_length);
    bySlug.set(slug, {
      slug,
      name: displayName ?? humanizeModelSlug(slug),
      ...(description ? { description } : {}),
      ...(contextWindow ? { defaultContextWindow: formatContextWindowLabel(contextWindow) } : {}),
    });
  }

  return [...bySlug.values()].toSorted((left, right) => left.name.localeCompare(right.name));
}

async function fetchProviderModelDescriptors(input: {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly fetchImpl: typeof fetch;
}): Promise<Array<ProviderModelDescriptor>> {
  const endpoint = `${input.baseUrl.replace(/\/+$/, "")}/models`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_LIST_TIMEOUT_MS);
  try {
    const response = await input.fetchImpl(endpoint, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`model catalogue returned HTTP ${response.status}`);
    }
    return normalizeApiProviderModels(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Live-first union with the static built-ins: discovered models lead, static
 * built-ins that the provider omitted fill gaps, and duplicates collapse by
 * slug. Saved model selections therefore survive provider-side omissions.
 */
export function mergeLiveWithBuiltInModels(
  liveModels: ReadonlyArray<ProviderModelDescriptor>,
  builtInModels: ReadonlyArray<ProviderModelDescriptor>,
): Array<ProviderModelDescriptor> {
  const merged = new Map(liveModels.map((model) => [model.slug, model]));
  for (const builtIn of builtInModels) {
    if (!merged.has(builtIn.slug)) {
      merged.set(builtIn.slug, builtIn);
    }
  }
  return [...merged.values()];
}

export interface LiveApiModelCatalogInput {
  readonly provider: ApiProviderKind;
  readonly baseUrl: string;
  readonly apiKey: string;
  /** Static built-in descriptors used to fill gaps and as the failure fallback. */
  readonly builtInModels: ReadonlyArray<ProviderModelDescriptor>;
  readonly fetchImpl?: typeof fetch;
  readonly cacheTtlMs?: number;
}

/**
 * Total: never throws. On any failure it logs and falls back to the static
 * catalog so the composer picker never breaks. A successful fetch is cached
 * per provider+baseUrl; changing the API key busts the cache immediately.
 */
export async function listLiveApiProviderModels(
  input: LiveApiModelCatalogInput,
): Promise<ProviderListModelsResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const cacheTtlMs = input.cacheTtlMs ?? MODEL_LIST_CACHE_TTL_MS;
  const cacheKey = `${input.provider}:${input.baseUrl.replace(/\/+$/, "")}`;
  const keyFingerprint = apiKeyFingerprint(input.apiKey);
  const cached = cache.get(cacheKey);
  if (
    cached &&
    cached.keyFingerprint === keyFingerprint &&
    Date.now() - cached.fetchedAtMs < cacheTtlMs
  ) {
    return {
      models: mergeLiveWithBuiltInModels(cached.models, input.builtInModels),
      source: "live",
      cached: true,
    };
  }

  try {
    const models = await fetchProviderModelDescriptors({
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      fetchImpl,
    });
    if (models.length === 0) {
      throw new Error("model catalogue returned no models");
    }
    cache.set(cacheKey, {
      models,
      fetchedAtMs: Date.now(),
      keyFingerprint,
    });
    return {
      models: mergeLiveWithBuiltInModels(models, input.builtInModels),
      source: "live",
      cached: false,
    };
  } catch (error) {
    console.warn(
      `[apiModelCatalog] live model discovery failed for ${input.provider}; serving the static catalog.`,
      error instanceof Error ? error.message : error,
    );
    return {
      models: input.builtInModels,
      source: "static",
      cached: false,
    };
  }
}
