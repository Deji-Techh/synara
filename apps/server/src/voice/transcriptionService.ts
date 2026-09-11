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
  supabase: ["SUPABASE_ACCESS_TOKEN"],
  neon: ["NEON_API_KEY"],
  github: ["GITHUB_TOKEN", "GH_TOKEN"],
  vercel: ["VERCEL_TOKEN"],
  coolify: ["COOLIFY_TOKEN"],
};

/**
 * Any non-empty stored value is returned as a candidate key. A previous
 * revision rejected values starting with "AQ."/"v10"/"v11" as Electron
 * safeStorage blobs, but that heuristic wrongly discarded a working key
 * (verified live: an "AQ."-prefixed stored google key authenticates against
 * the Gemini API). Dead values are harmless here — the provider cascade
 * treats auth failures as "try next" instead of failing the request.
 */
function asCandidateKey(val: unknown): string | null {
  const trimmed = typeof val === "string" ? val.trim() : "";
  return trimmed ? trimmed : null;
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
      const candidate = asCandidateKey(process.env[envKey]);
      if (candidate) return candidate;
    }
  }

  // 2. sharedProviderSecrets → ~/.caide/dyad-providers.json
  try {
    const secrets = sharedProviderSecrets().read();
    for (const key of lookupKeys) {
      const candidate = asCandidateKey(secrets?.providers?.[key]?.apiKey);
      if (candidate) return candidate;
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
          const candidate =
            asCandidateKey(providers?.[key]?.apiKey) ?? asCandidateKey(providers?.[key]);
          if (candidate) return candidate;
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
        const candidate = asCandidateKey(fs.readFileSync(secretPath, "utf-8"));
        if (candidate) return candidate;
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

// Providers with a real audio-transcription endpoint, in quality order.
const WHISPER_PROVIDERS: Array<{ provider: VoiceTranscriptionProvider; baseUrl?: string }> = [
  { provider: "groq" },
  { provider: "openai" },
  { provider: "openrouter", baseUrl: "https://openrouter.ai/api/v1" },
];

/**
 * Build a deduplicated, ordered list of every provider the user has a key for.
 *
 * Ordering is by transcription capability, not by chat preference: the
 * `preferred` value arriving here is the user's *chat* provider (the voice
 * setting is only "ai-model" vs "web-speech"), and OpenCode Zen/Go expose no
 * audio endpoint (verified live: `/audio/transcriptions` returns the website
 * HTML). So Groq — the dedicated Whisper backend with per-minute rather
 * than tiny daily-bucket limits — goes first whenever its key is configured,
 * then an explicit capable preference, then Gemini and the remaining
 * Whisper-compatible providers, with Zen/Go as a last resort in case the
 * vendor adds an audio route later.
 */
export function resolveAllVoiceProviders(preferred?: string): ProviderEntry[] {
  const seen = new Set<VoiceTranscriptionProvider>();
  const list: ProviderEntry[] = [];

  function push(provider: VoiceTranscriptionProvider, apiKey: string | null, baseUrl?: string) {
    if (apiKey && !seen.has(provider)) {
      seen.add(provider);
      list.push(baseUrl ? { provider, apiKey, baseUrl } : { provider, apiKey });
    }
  }

  const norm = (preferred ?? "").toLowerCase();
  const prefersGoogle = norm === "google" || norm === "gemini";
  const prefersWhisper =
    norm === "groq" || norm === "openai" || norm === "openrouter" ? norm : null;

  // 1. Groq first whenever configured: dedicated Whisper backend with
  // per-minute (not tiny daily-bucket) limits — the reliable default.
  push("groq", getVoiceApiKey("groq"));

  // 2. Explicit, transcription-capable preference with a configured key.
  if (prefersGoogle) push("google", getVoiceApiKey("google"));
  if (prefersWhisper) {
    const entry = WHISPER_PROVIDERS.find((w) => w.provider === prefersWhisper);
    if (entry) push(entry.provider, getVoiceApiKey(entry.provider), entry.baseUrl);
  }

  // 3. Gemini, then remaining Whisper-compatible providers.
  push("google", getVoiceApiKey("google"));
  for (const entry of WHISPER_PROVIDERS) {
    push(entry.provider, getVoiceApiKey(entry.provider), entry.baseUrl);
  }

  // 4. Last resort: OpenCode Zen/Go (no audio endpoint today).
  push("opencodeZen", getVoiceApiKey("opencodeZen"), "https://opencode.ai/zen/v1");
  push("opencodeGo", getVoiceApiKey("opencodeGo"), "https://opencode.ai/zen/go/v1");

  return list;
}

/** Backward-compat: returns the first available provider only. */
export function resolveBestVoiceProvider(preferred?: string): ProviderEntry | null {
  return resolveAllVoiceProviders(preferred)[0] ?? null;
}

// ---------------------------------------------------------------------------
// Transcription backends
// ---------------------------------------------------------------------------

const GEMINI_TRANSCRIBE_MODELS = ["gemini-2.5-flash", "gemini-flash-latest"];
const TRANSCRIPTION_TIMEOUT_MS = 60_000;
const TRANSCRIPTION_PROMPT =
  "Transcribe the spoken audio verbatim. Output ONLY the raw transcribed text. Do not add any explanation, quotation marks, prefixes, or commentary. If there is no speech, output nothing.";

function isAuthFailure(status: number, body: string): boolean {
  if (status === 401 || status === 403) return true;
  return status === 400 && /api key not valid|api_key_invalid|invalid.*api.?key/i.test(body);
}

/**
 * Local-controller timeout (same shape as the provider connection probes,
 * which are proven to work in every runtime we ship, including the packaged
 * desktop server). The timer is cleared as soon as the attempt settles and
 * unref'd so it can never hold the process open.
 */
function withTimeout(ms: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    try {
      controller.abort(new Error(`timed out after ${ms / 1000}s`));
    } catch {
      // already settled
    }
  }, ms);
  (timer as unknown as { unref?: () => void }).unref?.();
  let finished = false;
  return {
    signal: controller.signal,
    done: () => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
      }
    },
  };
}

/**
 * Undici network failures surface as a bare "fetch failed" with the real
 * reason (DNS, TCP timeout, refused) hidden in `cause`. Surface it so the
 * 400 aggregate actually says which leg of the network broke.
 */
export function describeFetchError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error ? (err as { cause?: unknown }).cause : undefined;
  const causeMsg =
    cause instanceof Error
      ? `${cause.name}${(cause as NodeJS.ErrnoException).code ? ` (${(cause as NodeJS.ErrnoException).code})` : ""}: ${cause.message}`
      : typeof cause === "object" && cause !== null
        ? JSON.stringify(cause).slice(0, 200)
        : typeof cause === "string" && cause
          ? cause.slice(0, 200)
          : "";
  // Undici network failures hide everything in `cause` (no HTTP status);
  // include its first stack frames so a "fetch failed" names the exact call
  // site instead of just the error class.
  let suffix = "";
  if (causeMsg && !msg.includes(causeMsg)) suffix += ` [cause: ${causeMsg}]`;
  if (cause instanceof Error && cause.stack) {
    const frames = cause.stack
      .split("\n")
      .slice(1, 5)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" <- ");
    if (frames) suffix += ` [at: ${frames.slice(0, 500)}]`;
  }
  return suffix ? `${msg}${suffix}` : msg;
}

async function transcribeWithGemini(
  apiKey: string,
  audioBase64: string,
  mimeType = "audio/wav",
): Promise<string> {
  let lastError: Error | null = null;

  for (const model of GEMINI_TRANSCRIBE_MODELS) {
    // First attempt disables thinking (cheaper/faster); some models reject
    // thinkingConfig, so fall back to a plain config on that specific 400.
    const configs: Array<Record<string, unknown>> = [
      { temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
      { temperature: 0 },
    ];
    for (const generationConfig of configs) {
      const timeout = withTimeout(TRANSCRIPTION_TIMEOUT_MS);
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const response = await fetch(url, {
          method: "POST",
          // Identity encoding: some runtimes in this codebase patch
          // stream .pipe() (Effect Pipeable), which breaks Undici's gzip/br
          // response decompression ("args[0] is not a function"). Uncompressed
          // transcription payloads never touch that path.
          headers: { "Content-Type": "application/json", "Accept-Encoding": "identity" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { inlineData: { mimeType: mimeType || "audio/wav", data: audioBase64 } },
                  { text: TRANSCRIPTION_PROMPT },
                ],
              },
            ],
            generationConfig,
          }),
          signal: timeout.signal,
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          if (isAuthFailure(response.status, errorText)) {
            throw new Error(`Gemini API key rejected (HTTP ${response.status}). Check the key.`);
          }
          if (response.status === 400 && /thinking/i.test(errorText) && generationConfig !== configs[configs.length - 1]) {
            continue; // retry the same model without thinkingConfig
          }
          throw new Error(`Gemini API (${model}) returned HTTP ${response.status}: ${errorText.slice(0, 300)}`);
        }

        const data = (await response.json()) as any;
        const blocked = data?.promptFeedback?.blockReason;
        if (blocked) {
          throw new Error(`Gemini API (${model}) blocked the audio: ${blocked}`);
        }
        const parts = data?.candidates?.[0]?.content?.parts || [];
        const nonThoughtText = parts
          .filter((p: any) => !p.thought)
          .map((p: any) => (typeof p.text === "string" ? p.text : ""))
          .join(" ")
          .trim();
        const rawText = (
          nonThoughtText ||
          parts
            .map((p: any) => (typeof p.text === "string" ? p.text : ""))
            .join(" ")
            .trim()
        ).replace(/^["'«"`]+|["'»"`]+$/g, "").trim();
        return rawText;
      } catch (err) {
        if (err instanceof Error && /aborted|timeout/i.test(err.message)) {
          throw new Error(`Gemini API (${model}) timed out after ${TRANSCRIPTION_TIMEOUT_MS / 1000}s.`);
        }
        lastError = err instanceof Error ? err : new Error(String(err));
        if (/timed out/.test(lastError.message)) throw lastError;
      } finally {
        timeout.done();
      }
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
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: "audio/wav" });
  formData.append("file", blob, "audio.wav");
  formData.append("model", "whisper-large-v3-turbo");
  formData.append("response_format", "json");

  // OpenCode Zen/Go need the same client identification as chat traffic.
  const extraHeaders: Record<string, string> = baseUrl.includes("opencode.ai/zen")
    ? {
        "x-opencode-session": `voice-${Date.now().toString(36)}`,
        "x-opencode-client": "caide",
        "User-Agent": "opencode/1.18.16 (caide)",
      }
    : {};

  const timeout = withTimeout(TRANSCRIPTION_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/audio/transcriptions`, {
      method: "POST",
      // See Gemini path: identity encoding keeps compressed responses (and
      // the patched stream .pipe() they trigger) out of this call.
      headers: { Authorization: `Bearer ${apiKey}`, "Accept-Encoding": "identity", ...extraHeaders },
      body: formData,
      signal: timeout.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `${providerName} Whisper API returned HTTP ${response.status}: ${errorText.slice(0, 300)}`,
      );
    }

    let data: { text?: unknown };
    try {
      data = (await response.json()) as { text?: unknown };
    } catch {
      throw new Error(
        `${providerName} Whisper API returned a non-JSON response (endpoint may not support audio transcription).`,
      );
    }
    return (typeof data?.text === "string" ? data.text : "").trim();
  } finally {
    timeout.done();
  }
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
      "Voice transcription needs an API key. Add a Gemini (GOOGLE/GEMINI_API_KEY), Groq, OpenAI, or OpenRouter key in Settings → Providers — with the AI-model voice setting, the Gemini key is used first when configured.",
    );
  }

  const audioBuffer = Buffer.from(input.audioBase64, "base64");
  const errors: string[] = [];
  let sawEmpty = false;

  for (const entry of providers) {
    try {
      const text = await tryTranscribeWithProvider(
        entry,
        input.audioBase64,
        audioBuffer,
        input.mimeType ?? "audio/wav",
      );
      if (text) {
        if (errors.length > 0 || sawEmpty) {
          console.warn(
            `[transcription] Transcribed with ${entry.provider} after ${errors.length} failure(s).`,
            errors,
          );
        }
        return { text };
      }
      // Empty transcript usually means silence — keep trying other providers
      // in case one picks up faint speech, but remember it so silence
      // resolves to "" (client shows "No speech detected") instead of an error.
      sawEmpty = true;
    } catch (err) {
      const msg = describeFetchError(err);
      console.warn(`[transcription] ${entry.provider} failed, trying next. Error: ${msg}`);
      errors.push(`${entry.provider}: ${msg}`);
    }
  }

  if (sawEmpty) return { text: "" };

  throw new Error(
    `Voice transcription failed across all configured providers:\n${errors.map((e, i) => `  ${i + 1}. ${e}`).join("\n")}`,
  );
}
