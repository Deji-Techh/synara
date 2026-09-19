// FILE: providerKeyPresence.ts
// Purpose: Local provider key-presence snapshot for settings UI. Reads the
// same secrets file the server uses (~/.caide/dyad-providers.json, v1
// plaintext or v2 AES-256-GCM envelope) plus well-known env vars, and reports
// configured flags only — key material never leaves this module.
// Layer: Desktop main utility
// Exports: readProviderKeyPresence
// Note: mirrors apps/server/src/dyad/providers/{providers,secrets}.ts. If the
// registry ids or env var names change there, update KNOWN_PROVIDERS below.

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface ProviderKeyPresenceEntry {
  readonly id: string;
  readonly configured: boolean;
  readonly hasBaseUrl: boolean;
  readonly keyless: boolean;
}

/** Registry ids the settings UI may ask about (server PROVIDERS keys + UI kinds). */
const KNOWN_PROVIDERS: ReadonlyArray<{ id: string; envVar?: string; keyless?: boolean }> = [
  { id: "openai", envVar: "OPENAI_API_KEY" },
  { id: "anthropic", envVar: "ANTHROPIC_API_KEY" },
  { id: "google", envVar: "GEMINI_API_KEY" },
  { id: "openrouter", envVar: "OPENROUTER_API_KEY" },
  { id: "deepseek", envVar: "DEEPSEEK_API_KEY" },
  { id: "groq", envVar: "GROQ_API_KEY" },
  { id: "xai", envVar: "XAI_API_KEY" },
  { id: "minimax", envVar: "MINIMAX_API_KEY" },
  { id: "opencodeZen", envVar: "OPENCODE_ZEN_API_KEY" },
  { id: "opencode-zen", envVar: "OPENCODE_ZEN_API_KEY" },
  { id: "opencodeGo", envVar: "OPENCODE_GO_API_KEY" },
  { id: "opencode-go", envVar: "OPENCODE_GO_API_KEY" },
  { id: "mistral", envVar: "MISTRAL_API_KEY" },
  { id: "together", envVar: "TOGETHER_API_KEY" },
  { id: "cohere", envVar: "COHERE_API_KEY" },
  { id: "fireworks", envVar: "FIREWORKS_API_KEY" },
  { id: "azure", envVar: "AZURE_API_KEY" },
  { id: "bedrock", envVar: "AWS_BEARER_TOKEN_BEDROCK" },
  { id: "vertex" },
  { id: "ollama", keyless: true },
  { id: "lmstudio", keyless: true },
  { id: "custom" },
  { id: "auto" },
];

interface StoredEntry {
  apiKey?: unknown;
  apiBaseUrl?: unknown;
}

function readStoredProviders(baseDir: string): Record<string, StoredEntry> {
  try {
    const filePath = path.join(baseDir, "dyad-providers.json");
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
      version?: unknown;
      providers?: unknown;
      encrypted?: { iv: string; tag: string; data: string };
    };
    if (parsed && typeof parsed === "object" && parsed.version === 2 && parsed.encrypted) {
      const key = loadKey(path.join(baseDir, ".providers.key"));
      if (!key) return {};
      const payload = decryptProviders(parsed.encrypted, key);
      if (payload && typeof payload.providers === "object" && payload.providers !== null) {
        return payload.providers as Record<string, StoredEntry>;
      }
      return {};
    }
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.providers &&
      typeof parsed.providers === "object"
    ) {
      return parsed.providers as Record<string, StoredEntry>;
    }
  } catch {
    // missing or corrupt — no local presence (never throw on read)
  }
  return {};
}

function loadKey(keyPath: string): Buffer | null {
  try {
    const raw = fs.readFileSync(keyPath);
    if (raw.length === 32) return raw;
    return null;
  } catch {
    return null;
  }
}

function decryptProviders(
  encrypted: { iv: string; tag: string; data: string },
  key: Buffer,
): Record<string, unknown> | null {
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

function nonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Snapshot of locally-configured providers. Never throws, never returns key
 * material. `baseDir` is the Caide home directory (same resolution as the
 * server: CAIDE_HOME or ~/.caide).
 */
export function readProviderKeyPresence(baseDir?: string): ProviderKeyPresenceEntry[] {
  const home =
    baseDir?.trim() || process.env.CAIDE_HOME?.trim() || path.join(os.homedir(), ".caide");
  const stored = readStoredProviders(home);
  return KNOWN_PROVIDERS.map((def) => {
    // Mirror the server publicView semantics exactly (local runtimes report
    // keyless, and configured only when a key is actually stored, so badges
    // render identically from either source).
    const entry = stored[def.id];
    const storedKey = nonEmpty(entry?.apiKey);
    const storedBaseUrl = nonEmpty(entry?.apiBaseUrl);
    const envKey = def.envVar ? nonEmpty(process.env[def.envVar]?.trim()) : false;
    return {
      id: def.id,
      configured: storedKey || envKey,
      hasBaseUrl: storedBaseUrl,
      keyless: def.keyless === true,
    };
  });
}
