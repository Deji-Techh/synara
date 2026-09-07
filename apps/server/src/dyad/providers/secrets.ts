// FILE: secrets.ts
// Purpose: File-backed provider credentials for Dyad providers
// (~/.caide/dyad-providers.json, 0600). Donor used Electron safeStorage
// (OS keychain); on servers without a keychain, keys rest AES-256-GCM
// encrypted under a machine-local 0600 key (~/.caide/.providers.key).
// v1 plaintext files keep reading and migrate to v2 on the next write.
// Env vars remain the override for servers.
// Shape matches SettingsLike so the gateway can pass it straight through.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as crypto from "node:crypto";
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

/**
 * Encryption at rest (donor safeStorage parity on servers without a
 * keychain): AES-256-GCM with a machine-local 0600 key file. v2 files are
 * `{version: 2, encrypted: {iv, tag, data}}`; v1 plaintext files keep
 * reading (migrated to v2 on the next write). Corrupt files read as empty
 * (never throw on read — same contract as before).
 */
const KEY_BYTES = 32;

function keyPathForSecretsFile(filePath: string): string {
  return path.join(path.dirname(filePath), ".providers.key");
}

function loadOrCreateKey(keyPath: string): Buffer {
  const existing = loadKey(keyPath);
  if (existing) return existing;
  return createKey(keyPath);
}

/**
 * Read-only key load. Returns null when missing or the wrong size — reads
 * must NEVER create or overwrite keys (a copied ciphertext without its key
 * reads as empty instead of orphaning data with a fresh key).
 */
function loadKey(keyPath: string): Buffer | null {
  try {
    const raw = fs.readFileSync(keyPath);
    if (raw.length === KEY_BYTES) return raw;
    return null;
  } catch {
    return null;
  }
}

/** Create (or rotate, with warning) the machine-local key. Write path only. */
function createKey(keyPath: string): Buffer {
  let rotated = false;
  try {
    const raw = fs.readFileSync(keyPath);
    rotated = raw.length !== KEY_BYTES;
  } catch {
    rotated = false;
  }
  if (rotated) {
    console.warn("[providers] key file has unexpected size — rotating to a fresh key");
  }
  const key = crypto.randomBytes(KEY_BYTES);
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  fs.writeFileSync(keyPath, key, { mode: 0o600 });
  try {
    fs.chmodSync(keyPath, 0o600);
  } catch {
    // non-POSIX — best effort
  }
  return key;
}

interface EncryptedPayload {
  iv: string;
  tag: string;
  data: string;
}

function encryptProviders(payload: Record<string, unknown>, key: Buffer): EncryptedPayload {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf-8");
  const data = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") };
}

function decryptProviders(encrypted: EncryptedPayload, key: Buffer): Record<string, unknown> | null {
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(encrypted.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(encrypted.data, "base64")),
      decipher.final(),
    ]).toString("utf-8");
    const parsed = JSON.parse(plain) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") return parsed;
    return null;
  } catch {
    return null;
  }
}

/** True when the file is a v2 encrypted envelope (diagnostics/tests). */
export function isEncryptedSecretsFile(filePath: string): boolean {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as { version?: unknown };
    return parsed?.version === 2;
  } catch {
    return false;
  }
}

export function defaultSecretsPath(): string {
  const home = process.env.CAIDE_HOME?.trim() || path.join(os.homedir(), ".caide");
  return path.join(home, "dyad-providers.json");
}

function readFile(filePath: string): ProviderSecretsFile {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<ProviderSecretsFile> & { encrypted?: EncryptedPayload };
    if (parsed && typeof parsed === "object" && parsed.version === 2 && parsed.encrypted) {
      // Read-only key load: without the matching key the file reads as
      // empty — never mint a replacement key on the read path.
      const key = loadKey(keyPathForSecretsFile(filePath));
      if (!key) return { ...EMPTY, providers: {} };
      const payload = decryptProviders(parsed.encrypted, key);
      if (payload && typeof payload.providers === "object" && payload.providers !== null) {
        return {
          version: 1,
          providers: payload.providers as ProviderSecretsFile["providers"],
          defaultProviderId: typeof payload.defaultProviderId === "string" ? payload.defaultProviderId : undefined,
          defaultModelId: typeof payload.defaultModelId === "string" ? payload.defaultModelId : undefined,
        };
      }
      return { ...EMPTY, providers: {} };
    }
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
    // Empty string clears back to Auto.
    if (defaultProviderId !== undefined) {
      if (defaultProviderId.trim()) current.defaultProviderId = defaultProviderId.trim();
      else delete current.defaultProviderId;
    }
    if (defaultModelId !== undefined) {
      if (defaultModelId.trim()) current.defaultModelId = defaultModelId.trim();
      else delete current.defaultModelId;
    }
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
    // Prefer the v2 encrypted envelope; fall back to v1 plaintext only when
    // key storage is unavailable (availability first — same posture as
    // before, with a warning so the downgrade is visible).
    let body: string;
    try {
      const key = loadOrCreateKey(keyPathForSecretsFile(this.filePath));
      const encrypted = encryptProviders(
        {
          providers: file.providers,
          ...(file.defaultProviderId ? { defaultProviderId: file.defaultProviderId } : {}),
          ...(file.defaultModelId ? { defaultModelId: file.defaultModelId } : {}),
        },
        key,
      );
      body = `${JSON.stringify({ version: 2, encrypted }, null, 2)}\n`;
    } catch (err) {
      console.warn(`[providers] key storage unavailable, writing plaintext secrets: ${err instanceof Error ? err.message : String(err)}`);
      body = `${JSON.stringify(file, null, 2)}\n`;
    }
    fs.writeFileSync(this.filePath, body, { mode: 0o600 });
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

/** Test-only: drop the memoized store so CAIDE_HOME overrides take effect. */
export function resetSharedProviderSecrets(): void {
  shared = null;
}
