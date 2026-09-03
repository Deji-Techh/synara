// FILE: secrets.ts
// Purpose: File-backed provider credentials for Dyad providers
// (~/.caide/dyad-providers.json, 0600). Donor used Electron safeStorage
// (OS keychain); Bun has no keychain, so keys rest in a user-only file —
// same posture as .env files. Env vars remain the override for servers.
// Shape matches SettingsLike so the gateway can pass it straight through.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SettingsLike } from "./routing.ts";

export interface StoredProviderEntry {
  apiKey?: string;
  apiBaseUrl?: string;
  resourceName?: string;
}

export interface ProviderSecretsFile {
  version: 1;
  providers: Record<string, StoredProviderEntry>;
  defaultProviderId?: string;
  defaultModelId?: string;
}

const EMPTY: ProviderSecretsFile = { version: 1, providers: {} };

export function defaultSecretsPath(): string {
  const home = process.env.CAIDE_HOME?.trim() || path.join(os.homedir(), ".caide");
  return path.join(home, "dyad-providers.json");
}

function readFile(filePath: string): ProviderSecretsFile {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<ProviderSecretsFile>;
    if (parsed && typeof parsed === "object" && parsed.version === 1 && parsed.providers) {
      return { version: 1, providers: parsed.providers, defaultProviderId: parsed.defaultProviderId, defaultModelId: parsed.defaultModelId };
    }
  } catch {
    // missing or corrupt — start empty (never throw on read)
  }
  return { ...EMPTY, providers: {} };
}

export class ProviderSecretsStore {
  constructor(private readonly filePath: string = defaultSecretsPath()) {}

  read(): ProviderSecretsFile {
    return readFile(this.filePath);
  }

  /** Save one provider entry (partial merge). Empty apiKey clears the key but keeps other fields. */
  setProvider(providerId: string, entry: StoredProviderEntry): ProviderSecretsFile {
    const current = readFile(this.filePath);
    const prev = current.providers[providerId] ?? {};
    const next: StoredProviderEntry = { ...prev };
    if (entry.apiKey !== undefined) {
      if (entry.apiKey.trim()) next.apiKey = entry.apiKey.trim();
      else delete next.apiKey;
    }
    if (entry.apiBaseUrl !== undefined) {
      if (entry.apiBaseUrl.trim()) next.apiBaseUrl = entry.apiBaseUrl.trim();
      else delete next.apiBaseUrl;
    }
    if (entry.resourceName !== undefined) {
      if (entry.resourceName.trim()) next.resourceName = entry.resourceName.trim();
      else delete next.resourceName;
    }
    current.providers[providerId] = next;
    this.write(current);
    return current;
  }

  setDefaults(defaultProviderId?: string, defaultModelId?: string): ProviderSecretsFile {
    const current = readFile(this.filePath);
    if (defaultProviderId !== undefined) current.defaultProviderId = defaultProviderId;
    if (defaultModelId !== undefined) current.defaultModelId = defaultModelId;
    this.write(current);
    return current;
  }

  /** SettingsLike view: stored keys as settings payload (env fallback happens in routing). */
  toSettings(): SettingsLike {
    const file = readFile(this.filePath);
    const providerSettings: SettingsLike["providerSettings"] = {};
    for (const [id, entry] of Object.entries(file.providers)) {
      providerSettings[id] = {
        ...(entry.apiKey ? { apiKey: { value: entry.apiKey } } : {}),
        ...(entry.apiBaseUrl ? { apiBaseUrl: entry.apiBaseUrl } : {}),
        ...(entry.resourceName ? { resourceName: entry.resourceName } : {}),
      };
    }
    return { providerSettings };
  }

  /** Public view: configured flags only, never keys. */
  publicView(): { providers: Array<{ id: string; configured: boolean; hasBaseUrl: boolean }>; defaultProviderId?: string; defaultModelId?: string } {
    const file = readFile(this.filePath);
    return {
      providers: Object.entries(file.providers).map(([id, entry]) => ({
        id,
        configured: Boolean(entry.apiKey?.trim()),
        hasBaseUrl: Boolean(entry.apiBaseUrl?.trim()),
      })),
      ...(file.defaultProviderId ? { defaultProviderId: file.defaultProviderId } : {}),
      ...(file.defaultModelId ? { defaultModelId: file.defaultModelId } : {}),
    };
  }

  private write(file: ProviderSecretsFile): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
    try {
      fs.chmodSync(this.filePath, 0o600);
    } catch {
      // non-POSIX — best effort
    }
  }
}

let shared: ProviderSecretsStore | null = null;
/** Process-wide secrets (server bootstrap owns lifetime). */
export function sharedProviderSecrets(): ProviderSecretsStore {
  if (!shared) shared = new ProviderSecretsStore();
  return shared;
}
