// FILE: customProviders.ts
// Purpose: Server-side custom providers + custom models (009 M5). Donor:
// dyad x caide language_model_providers/language_models tables + handlers
// (create/edit/delete provider, model CRUD, `custom::` prefix convention).
// V2 adapts the persistence: a 0600 JSON file next to the secrets file
// (no DB on this layer) holding definitions; credentials stay in the
// encrypted secrets store under the same id and are never stored here.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { PROVIDERS, type ProviderDef } from "./providers.ts";

/** Donor convention: custom provider ids start with `custom::`. */
export const CUSTOM_PROVIDER_PREFIX = "custom::";

export interface CustomProviderDef {
  id: string;
  displayName: string;
  baseUrl: string;
  envVarName?: string;
}

export interface CustomModelDef {
  name: string;
  displayName?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  temperature?: number;
}

interface CustomProvidersFile {
  version: 1;
  providers: Record<string, CustomProviderDef>;
  customModels: Record<string, CustomModelDef[]>;
}

const EMPTY: CustomProvidersFile = { version: 1, providers: {}, customModels: {} };

export function defaultCustomProvidersPath(): string {
  const home = process.env.CAIDE_HOME?.trim() || path.join(os.homedir(), ".caide");
  return path.join(home, "custom-providers.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFile(filePath: string): CustomProvidersFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<CustomProvidersFile>;
    if (!parsed || typeof parsed !== "object") return structuredClone(EMPTY);
    const providers: CustomProvidersFile["providers"] = {};
    if (isRecord(parsed.providers)) {
      for (const [id, def] of Object.entries(parsed.providers)) {
        if (
          typeof id === "string" &&
          isRecord(def) &&
          validateCustomProviderDef({ ...def, id }).ok
        ) {
          providers[id] = {
            id,
            displayName: String(def.displayName),
            baseUrl: String(def.baseUrl),
            ...(typeof def.envVarName === "string" && def.envVarName.trim()
              ? { envVarName: def.envVarName.trim() }
              : {}),
          };
        }
      }
    }
    const customModels: CustomProvidersFile["customModels"] = {};
    if (isRecord(parsed.customModels)) {
      for (const [providerId, models] of Object.entries(parsed.customModels)) {
        if (typeof providerId !== "string" || !Array.isArray(models)) continue;
        const clean = models.filter(
          (m): m is CustomModelDef =>
            isRecord(m) && typeof m.name === "string" && m.name.trim().length > 0,
        );
        if (clean.length > 0) customModels[providerId] = clean;
      }
    }
    return { version: 1, providers, customModels };
  } catch {
    return structuredClone(EMPTY);
  }
}

function writeFile(filePath: string, file: CustomProvidersFile): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // non-POSIX — best effort
  }
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Validate an id: `custom::` prefix, slug body, no builtin collision. */
export function validateCustomProviderId(
  id: string,
  builtinIds: ReadonlySet<string> | ((id: string) => boolean),
): { ok: true } | { ok: false; message: string } {
  if (typeof id !== "string" || !id.startsWith(CUSTOM_PROVIDER_PREFIX)) {
    return {
      ok: false,
      message: `Custom provider id must start with "${CUSTOM_PROVIDER_PREFIX}".`,
    };
  }
  const slug = id.slice(CUSTOM_PROVIDER_PREFIX.length);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    return {
      ok: false,
      message: "Custom provider id slug must be lowercase alphanumeric with dashes.",
    };
  }
  const taken = typeof builtinIds === "function" ? builtinIds(id) : builtinIds.has(id);
  if (taken) {
    return { ok: false, message: `Provider id "${id}" collides with a built-in provider.` };
  }
  return { ok: true };
}

export function validateCustomProviderDef(def: {
  id?: unknown;
  displayName?: unknown;
  baseUrl?: unknown;
  envVarName?: unknown;
  isBuiltin?: (id: string) => boolean;
}): { ok: true } | { ok: false; message: string } {
  if (typeof def.id !== "string") return { ok: false, message: "Custom provider needs an id." };
  const idCheck = validateCustomProviderId(def.id, def.isBuiltin ?? (() => false));
  if (!idCheck.ok) return idCheck;
  if (typeof def.displayName !== "string" || !def.displayName.trim()) {
    return { ok: false, message: "Custom provider needs a display name." };
  }
  if (typeof def.baseUrl !== "string" || !isValidHttpUrl(def.baseUrl.trim())) {
    return { ok: false, message: "Custom provider needs an http(s) base URL." };
  }
  if (
    def.envVarName !== undefined &&
    (typeof def.envVarName !== "string" || !/^[A-Z][A-Z0-9_]*$/.test(def.envVarName.trim()))
  ) {
    return { ok: false, message: "envVarName must look like ENV_VAR_NAME." };
  }
  return { ok: true };
}

export class CustomProviderStore {
  constructor(private readonly filePath: string = defaultCustomProvidersPath()) {}

  listProviders(): CustomProviderDef[] {
    return Object.values(readFile(this.filePath).providers);
  }

  getProvider(id: string): CustomProviderDef | undefined {
    return readFile(this.filePath).providers[id];
  }

  saveProvider(def: CustomProviderDef): CustomProvidersFile {
    const file = readFile(this.filePath);
    file.providers[def.id] = {
      id: def.id,
      displayName: def.displayName.trim(),
      baseUrl: def.baseUrl.trim().replace(/\/+$/, ""),
      ...(def.envVarName?.trim() ? { envVarName: def.envVarName.trim() } : {}),
    };
    writeFile(this.filePath, file);
    return file;
  }

  deleteProvider(id: string): boolean {
    const file = readFile(this.filePath);
    if (!file.providers[id]) return false;
    delete file.providers[id];
    delete file.customModels[id];
    writeFile(this.filePath, file);
    return true;
  }

  getCustomModels(providerId: string): CustomModelDef[] {
    return readFile(this.filePath).customModels[providerId] ?? [];
  }

  setCustomModels(providerId: string, models: CustomModelDef[]): CustomModelDef[] {
    const clean = models
      .filter((m) => m && typeof m.name === "string" && m.name.trim().length > 0)
      .map((m) => ({
        name: m.name.trim(),
        ...(m.displayName?.trim() ? { displayName: m.displayName.trim() } : {}),
        ...(typeof m.contextWindow === "number" && m.contextWindow > 0
          ? { contextWindow: Math.floor(m.contextWindow) }
          : {}),
        ...(typeof m.maxOutputTokens === "number" && m.maxOutputTokens > 0
          ? { maxOutputTokens: Math.floor(m.maxOutputTokens) }
          : {}),
        ...(typeof m.temperature === "number" ? { temperature: m.temperature } : {}),
      }));
    const file = readFile(this.filePath);
    if (clean.length === 0) delete file.customModels[providerId];
    else file.customModels[providerId] = clean;
    writeFile(this.filePath, file);
    return clean;
  }
}

let shared: CustomProviderStore | null = null;
/** Process-wide custom providers (server bootstrap owns lifetime). */
export function sharedCustomProviders(): CustomProviderStore {
  if (!shared) shared = new CustomProviderStore();
  return shared;
}

/** Test-only: drop the memoized store so CAIDE_HOME overrides take effect. */
export function resetSharedCustomProviders(): void {
  shared = null;
}

/** A stored custom provider as a registry definition (OpenAI-compatible). */
export function customProviderAsDef(def: CustomProviderDef): ProviderDef {
  return {
    id: def.id,
    displayName: def.displayName,
    baseUrl: def.baseUrl,
    ...(def.envVarName ? { envVarName: def.envVarName } : {}),
    transport: "streamable",
  };
}

/**
 * Static registry first, stored customs second. Every turn-resolution
 * lookup (routing, key presence, validation, public listing) goes through
 * here so custom providers behave like built-ins.
 */
export function resolveProviderDef(id: string): ProviderDef | undefined {
  const builtin = PROVIDERS[id];
  if (builtin) return builtin;
  const custom = sharedCustomProviders().getProvider(id);
  return custom ? customProviderAsDef(custom) : undefined;
}
