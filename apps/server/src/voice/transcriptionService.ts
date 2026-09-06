// FILE: transcriptionService.ts
// Purpose: Multi-provider audio voice transcription with automatic cascade fallback.
//   Tries the preferred provider first, then falls through every other configured
//   provider until one succeeds. A user whose opencodeZen key doesn't support
//   Whisper will silently roll over to google → openrouter → groq → openai.
// Layer: Server voice infrastructure

import { Buffer } from "node:buffer";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import type { ServerVoiceTranscriptionInput, ServerVoiceTranscriptionResult } from "@caide/contracts";
import { sharedProviderSecrets } from "../dyad/providers/secrets.ts";

// ---------------------------------------------------------------------------
// Key resolution
// ---------------------------------------------------------------------------

const PROVIDER_ENV_KEYS: Record<string, string[]> = {
  google: ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
  gemini: ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
  groq: ["GROQ_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  opencodeZen: ["OPENCODE_ZEN_API_KEY", "OPENCODE_API_KEY"],
  "opencode-zen": ["OPENCODE_ZEN_API_KEY", "OPENCODE_API_KEY"],
  opencodeGo: ["OPENCODE_GO_API_KEY", "OPENCODE_API_KEY"],
  "opencode-go": ["OPENCODE_GO_API_KEY", "OPENCODE_API_KEY"],
  openrouter: ["OPENROUTER_API_KEY"],
};

/**
 * Keys starting with "AQ." are Dyad's Electron safeStorage encrypted blobs —
 * they cannot be used raw against external APIs.
 */
function isEncryptedBlob(val: string): boolean {
  return val.startsWith("AQ.") || val.startsWith("v10") || val.startsWith("v11");
}

export function getVoiceApiKey(provider: string): string | null {
  const norm = provider.toLowerCase();
  const lookupKeys =
    norm === "google" || norm === "gemini"
      ? ["google", "gemini"]
      : norm === "opencodezen" || norm === "opencode-zen"
        ? ["opencodeZen", "opencode-zen"]
        : norm === "opencodego" || norm === "opencode-go"
          ? ["opencodeGo", "opencode-go"]
          : [provider, norm];

  // 1. Environment variables (override)
  for (const key of lookupKeys) {
    const envKeys = PROVIDER_ENV_KEYS[key] || [];
    for (const envKey of envKeys) {
      const val = process.env[envKey]?.trim();
      if (val && !isEncryptedBlob(val)) return val;
    }
  }

  // 2. sharedProviderSecrets → ~/.caide/dyad-providers.json
  try {
    const secrets = sharedProviderSecrets().read();
    for (const key of lookupKeys) {
      const stored = secrets?.providers?.[key]?.apiKey?.trim();
      if (stored && !isEncryptedBlob(stored)) return stored;
    }
  } catch {
    // ignore
  }

  // 3. Fallback: scan known candidate files directly
  try {
    const home = process.env.CAIDE_HOME || process.env.HOME || os.homedir();
    const candidateFiles = [
      path.join(home, ".caide", "dyad-providers.json"),
      path.join(home, "dyad-providers.json"),
      path.join(os.homedir(), ".caide", "dyad-providers.json"),
      path.join(os.homedir(), ".dyad", "provider_secrets.json"),
    ];
    for (const file of candidateFiles) {
      if (!fs.existsSync(file)) continue;
      try {
        const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
        const providers = raw?.providers || raw;
        for (const key of lookupKeys) {
          const val = providers?.[key]?.apiKey?.trim?.() || providers?.[key]?.trim?.();
          if (val && !isEncryptedBlob(val)) return val;
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }

  // 4. Legacy ~/.caide/userdata/secrets/*.bin
  try {
    const home = process.env.HOME || os.homedir();
    for (const key of lookupKeys) {
      const secretPath = path.join(home, ".caide/userdata/secrets", `provider-${key}-api-key.bin`);
      if (fs.existsSync(secretPath)) {
        const secretVal = fs.readFileSync(secretPath, "utf-8").trim();
        if (secretVal && !isEncryptedBlob(secretVal)) return secretVal;
      }
    }
  } catch {
    // ignore
  }

  return null;
}

// ---------------------------------------------------------------------------
// Provider cascade
// ---------------------------------------------------------------------------

export type VoiceTranscriptionProvider =
  | "google"
  | "groq"
  | "openai"
  | "opencodeZen"
  | "opencodeGo"
  | "openrouter";

type ProviderEntry = { provider: VoiceTranscriptionProvider; apiKey: string; baseUrl?: string };

/**
 * Build a deduplicated, ordered list of every provider the user has a valid key for.
 * Preferred provider is always first; all others follow so nothing is left untried.
 */
export function resolveAllVoiceProviders(preferred?: string): ProviderEntry[] {
  const seen = new Set<VoiceTranscriptionProvider>();
  const list: ProviderEntry[] = [];

  function push(entry: ProviderEntry | null) {
    if (entry && !seen.has(entry.provider)) {
      seen.add(entry.provider);
      list.push(entry);
    }
  }

  if (preferred) {
    const norm = preferred.toLowerCase();
    if (norm === "google" || norm === "gemini") {
      const key = getVoiceApiKey("google");
      if (key) push({ provider: "google", apiKey: key });
    } else if (norm === "groq") {
      const key = getVoiceApiKey("groq");
      if (key) push({ provider: "groq", apiKey: key });
    } else if (norm === "openai") {
      const key = getVoiceApiKey("openai");
      if (key) push({ provider: "openai", apiKey: key });
    } else if (norm === "opencodezen" || norm === "opencode-zen") {
      const key = getVoiceApiKey("opencodeZen");
      if (key) push({ provider: "opencodeZen", apiKey: key, baseUrl: "https://opencode.ai/zen/v1" });
    } else if (norm === "opencodego" || norm === "opencode-go") {
      const key = getVoiceApiKey("opencodeGo");
      if (key) push({ provider: "opencodeGo", apiKey: key, baseUrl: "https://opencode.ai/zen/go/v1" });
    } else if (norm === "openrouter") {
      const key = getVoiceApiKey("openrouter");
      if (key) push({ provider: "openrouter", apiKey: key, baseUrl: "https://openrouter.ai/api/v1" });
    }
  }

  const zenKey = getVoiceApiKey("opencodeZen");
  if (zenKey) push({ provider: "opencodeZen", apiKey: zenKey, baseUrl: "https://opencode.ai/zen/v1" });

  const goKey = getVoiceApiKey("opencodeGo");
  if (goKey) push({ provider: "opencodeGo", apiKey: goKey, baseUrl: "https://opencode.ai/zen/go/v1" });

  const googleKey = getVoiceApiKey("google");
  if (googleKey) push({ provider: "google", apiKey: googleKey });

  const openrouterKey = getVoiceApiKey("openrouter");
  if (openrouterKey) push({ provider: "openrouter", apiKey: openrouterKey, baseUrl: "https://openrouter.ai/api/v1" });

  const groqKey = getVoiceApiKey("groq");
  if (groqKey) push({ provider: "groq", apiKey: groqKey });

  const openaiKey = getVoiceApiKey("openai");
  if (openaiKey) push({ provider: "openai", apiKey: openaiKey });

  return list;
}

/** Backward-compat: returns the first available provider only. */
export function resolveBestVoiceProvider(preferred?: string): ProviderEntry | null {
  return resolveAllVoiceProviders(preferred)[0] ?? null;
}

// ---------------------------------------------------------------------------
// Transcription backends
// ---------------------------------------------------------------------------

async function transcribeWithGemini(
  apiKey: string,
  audioBase64: string,
  mimeType = "audio/wav",
): Promise<string> {
  const models = ["gemini-2.5-flash", "gemini-3.5-transcribe", "gemini-flash-latest"];
  let lastError: Error | null = null;

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inlineData: { mimeType: mimeType || "audio/wav", data: audioBase64 } },
                {
                  text: "Transcribe the spoken audio verbatim. Output ONLY the raw transcribed text. Do not add any explanation, quotation marks, prefixes, or commentary.",
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API (${model}) returned HTTP ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as any;
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const nonThoughtText = parts
        .filter((p: any) => !p.thought)
        .map((p: any) => p.text || "")
        .join(" ")
        .trim();
      const rawText =
        nonThoughtText ||
        parts
          .map((p: any) => p.text || "")
          .join(" ")
          .trim();
      return rawText.replace(/^["'«"`]+|["'»"`]+$/g, "").trim();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error("Gemini transcription failed across all models.");
}

async function transcribeWithWhisperCompat(
  apiKey: string,
  audioBuffer: Buffer,
  baseUrl: string,
  providerName: string,
): Promise<string> {
  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: "audio/wav" });
  formData.append("file", blob, "audio.wav");
  formData.append("model", "whisper-large-v3-turbo");
  formData.append("response_format", "json");

  const response = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${providerName} Whisper API returned HTTP ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as { text?: string };
  return (data?.text ?? "").trim();
}

async function tryTranscribeWithProvider(
  entry: ProviderEntry,
  audioBase64: string,
  audioBuffer: Buffer,
  mimeType: string,
): Promise<string> {
  const { provider, apiKey, baseUrl } = entry;
  if (provider === "google") {
    return transcribeWithGemini(apiKey, audioBase64, mimeType);
  }
  // opencodeZen, opencodeGo, openrouter, groq, openai all use Whisper-compat endpoint
  const resolvedBase =
    baseUrl ??
    (provider === "groq" ? "https://api.groq.com/openai/v1" : "https://api.openai.com/v1");
  return transcribeWithWhisperCompat(apiKey, audioBuffer, resolvedBase, provider);
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function transcribeVoiceAudio(
  input: ServerVoiceTranscriptionInput,
): Promise<ServerVoiceTranscriptionResult> {
  const providers = resolveAllVoiceProviders(input.provider);

  if (providers.length === 0) {
    throw new Error(
      "Voice transcription requires an API key for OpenCode Zen, Google Gemini, Groq, or OpenAI. Please configure one in Settings → Providers.",
    );
  }

  const audioBuffer = Buffer.from(input.audioBase64, "base64");
  const errors: string[] = [];

  for (const entry of providers) {
    try {
      const text = await tryTranscribeWithProvider(
        entry,
        input.audioBase64,
        audioBuffer,
        input.mimeType ?? "audio/wav",
      );
      if (errors.length > 0) {
        console.warn(
          `[transcription] Fell back to ${entry.provider} after ${errors.length} failure(s):`,
          errors,
        );
      }
      return { text };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[transcription] ${entry.provider} failed, trying next. Error: ${msg}`);
      errors.push(`${entry.provider}: ${msg}`);
    }
  }

  throw new Error(
    `Voice transcription failed across all configured providers:\n${errors.map((e, i) => `  ${i + 1}. ${e}`).join("\n")}`,
  );
}
