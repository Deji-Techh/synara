// FILE: openrouterModalities.ts
// Purpose: Fetch and cache OpenRouter model architecture metadata (specifically input_modalities)
// with a 5-hour TTL to dynamically determine multimodal and vision capabilities for any model.
// Layer: Server providers

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type InputModality, isModelVisionCapable } from "@caide/shared/languageModelCatalog";

const CACHE_TTL_MS = 5 * 60 * 60 * 1000; // 5 hours

function cacheFilePath(): string {
  const base = process.env.CAIDE_DIR || path.join(os.homedir(), ".caide");
  return path.join(base, "openrouter-modalities-cache.json");
}

interface ModalitiesCacheData {
  timestamp: number;
  // map normalized model id/slug -> array of input modalities (e.g. ["text", "image", "file"])
  modalities: Record<string, string[]>;
}

let memoryCache: ModalitiesCacheData | null = null;
let activeFetchPromise: Promise<void> | null = null;

function loadDiskCache(): ModalitiesCacheData | null {
  try {
    const file = cacheFilePath();
    if (!fs.existsSync(file)) return null;
    const content = fs.readFileSync(file, "utf-8");
    const data = JSON.parse(content) as ModalitiesCacheData;
    if (data && typeof data.timestamp === "number" && typeof data.modalities === "object") {
      return data;
    }
  } catch {
    // ignore parse or read errors
  }
  return null;
}

function saveDiskCache(data: ModalitiesCacheData): void {
  try {
    const file = cacheFilePath();
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
  } catch {
    // ignore save errors
  }
}

/**
 * Fetch OpenRouter models and refresh the 5-hour cache.
 * Safe and non-blocking — times out after 8s and catches any errors.
 */
export async function refreshOpenRouterModalitiesCache(force = false): Promise<void> {
  if (!force && memoryCache && Date.now() - memoryCache.timestamp < CACHE_TTL_MS) {
    return;
  }

  if (activeFetchPromise) {
    return activeFetchPromise;
  }

  activeFetchPromise = (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (!res.ok) return;

      const body = (await res.json()) as {
        data?: Array<{
          id: string;
          name?: string;
          architecture?: {
            input_modalities?: string[];
          };
        }>;
      };

      if (!Array.isArray(body?.data)) return;

      const map: Record<string, string[]> = {};
      for (const item of body.data) {
        if (!item.id) continue;
        const modalities = item.architecture?.input_modalities;
        if (Array.isArray(modalities)) {
          const normId = item.id.toLowerCase();
          map[normId] = modalities;
          // Also index stripped name / slug without provider prefix (e.g. "muse-spark-1.3-contributor")
          const bareName = normId.split("/").pop();
          if (bareName && !map[bareName]) {
            map[bareName] = modalities;
          }
        }
      }

      const fresh: ModalitiesCacheData = {
        timestamp: Date.now(),
        modalities: map,
      };
      memoryCache = fresh;
      saveDiskCache(fresh);
    } catch {
      // network failure, rate limit, or offline: keep existing cache
    } finally {
      activeFetchPromise = null;
    }
  })();

  return activeFetchPromise;
}

/**
 * Returns the cached input modalities for a given model ID or slug.
 */
export function getModelModalitiesSync(modelId: string): string[] | undefined {
  if (!memoryCache) {
    memoryCache = loadDiskCache();
  }
  // If cache is missing or older than 5 hours, trigger background refresh
  if (!memoryCache || Date.now() - memoryCache.timestamp >= CACHE_TTL_MS) {
    void refreshOpenRouterModalitiesCache();
  }
  if (!memoryCache) return undefined;

  const normalized = modelId.trim().toLowerCase();
  if (memoryCache.modalities[normalized]) {
    return memoryCache.modalities[normalized];
  }
  const bare = normalized.split("/").pop();
  if (bare && memoryCache.modalities[bare]) {
    return memoryCache.modalities[bare];
  }
  // Try substring match
  for (const [key, mods] of Object.entries(memoryCache.modalities)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return mods;
    }
  }
  return undefined;
}

/**
 * Checks if a model supports vision/images using cached modalities and regex fallback.
 */
export function isModelVisionCapableChecked(modelId: string): {
  isVisionCapable: boolean;
  modalities?: string[] | undefined;
} {
  const modalities = getModelModalitiesSync(modelId);
  const isCapable = isModelVisionCapable(modelId, modalities as InputModality[] | undefined);
  return {
    isVisionCapable: isCapable,
    modalities,
  };
}
