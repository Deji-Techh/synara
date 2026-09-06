// FILE: voiceTranscription.ts
// Purpose: Owns the desktop-specific voice transcription flow for Electron builds.
// Layer: Desktop IPC voice bridge
// Depends on: Multi-provider audio transcription (Gemini, Groq, OpenAI) and shared contracts.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Buffer } from "node:buffer";

import { ipcMain } from "electron";
import type {
  ServerVoiceTranscriptionInput,
  ServerVoiceTranscriptionResult,
} from "@caide/contracts";
import { SERVER_VOICE_TRANSCRIPTION_MAX_AUDIO_BYTES } from "@caide/contracts";
import { SERVER_TRANSCRIBE_VOICE_CHANNEL } from "./ipcChannels";

const MAX_VOICE_DURATION_MS = 120_000;

const PROVIDER_ENV_KEYS: Record<string, string[]> = {
  google: ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
  gemini: ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
  groq: ["GROQ_API_KEY"],
  openai: ["OPENAI_API_KEY"],
};

export function getDesktopVoiceApiKey(provider: string): string | null {
  const norm = provider.toLowerCase();
  const lookupKeys =
    norm === "google" || norm === "gemini" ? ["google", "gemini"] : [norm];

  // Check environment variables first (override)
  for (const key of lookupKeys) {
    const envKeys = PROVIDER_ENV_KEYS[key] || [];
    for (const envKey of envKeys) {
      const val = process.env[envKey]?.trim();
      if (val) return val;
    }
  }

  // Check dyad-providers.json and provider_secrets.json
  try {
    const home = process.env.CAIDE_HOME || process.env.HOME || os.homedir();
    const candidateFiles = [
      path.join(home, ".caide", "dyad-providers.json"),
      path.join(home, "dyad-providers.json"),
      path.join(os.homedir(), ".caide", "dyad-providers.json"),
      path.join(os.homedir(), ".dyad", "provider_secrets.json"),
    ];
    for (const file of candidateFiles) {
      if (fs.existsSync(file)) {
        try {
          const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
          const providers = raw?.providers || raw;
          for (const key of lookupKeys) {
            const val = providers?.[key]?.apiKey?.trim?.() || providers?.[key]?.trim?.();
            if (val) return val;
          }
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }

  // Check ~/.caide/userdata/secrets legacy files
  try {
    const home = process.env.HOME || os.homedir();
    for (const key of lookupKeys) {
      const secretPath = path.join(
        home,
        ".caide/userdata/secrets",
        `provider-${key}-api-key.bin`,
      );
      if (fs.existsSync(secretPath)) {
        const secretVal = fs.readFileSync(secretPath, "utf-8").trim();
        if (secretVal) return secretVal;
      }
    }
  } catch {
    // ignore
  }

  return null;
}

export function resolveDesktopVoiceProvider(preferred?: string): {
  provider: "google" | "groq" | "openai";
  apiKey: string;
} | null {
  if (preferred) {
    const norm = preferred.toLowerCase();
    if (norm === "google" || norm === "gemini") {
      const key = getDesktopVoiceApiKey("google");
      if (key) return { provider: "google", apiKey: key };
    } else if (norm === "groq") {
      const key = getDesktopVoiceApiKey("groq");
      if (key) return { provider: "groq", apiKey: key };
    } else if (norm === "openai") {
      const key = getDesktopVoiceApiKey("openai");
      if (key) return { provider: "openai", apiKey: key };
    }
  }

  // Fallback in order of quality & speed
  const googleKey = getDesktopVoiceApiKey("google");
  if (googleKey) return { provider: "google", apiKey: googleKey };

  const groqKey = getDesktopVoiceApiKey("groq");
  if (groqKey) return { provider: "groq", apiKey: groqKey };

  const openaiKey = getDesktopVoiceApiKey("openai");
  if (openaiKey) return { provider: "openai", apiKey: openaiKey };

  return null;
}

async function transcribeDesktopWithGemini(
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
                {
                  inlineData: {
                    mimeType: mimeType || "audio/wav",
                    data: audioBase64,
                  },
                },
                {
                  text: "Transcribe the spoken audio verbatim. Output ONLY the raw transcribed text. Do not add any explanation, quotation marks, prefixes, or commentary.",
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            thinkingConfig: {
              thinkingBudget: 0,
            },
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
      const text = rawText.replace(/^["'«“`]+|["'»”`]+$/g, "").trim();
      return text;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error("Gemini transcription failed across all models.");
}

async function transcribeDesktopWithGroq(apiKey: string, audioBuffer: Buffer): Promise<string> {
  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: "audio/wav" });
  formData.append("file", blob, "audio.wav");
  formData.append("model", "whisper-large-v3-turbo");
  formData.append("response_format", "json");

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq Whisper API returned HTTP ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as { text?: string };
  return (data?.text ?? "").trim();
}

async function transcribeDesktopWithOpenAi(apiKey: string, audioBuffer: Buffer): Promise<string> {
  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: "audio/wav" });
  formData.append("file", blob, "audio.wav");
  formData.append("model", "whisper-1");
  formData.append("response_format", "json");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI Whisper API returned HTTP ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as { text?: string };
  return (data?.text ?? "").trim();
}

// --- Input validation ------------------------------------------------------

function normalizeVoiceBase64(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, "");
  return normalized.length > 0 ? normalized : null;
}

function isLikelyVoiceBase64(value: string): boolean {
  return /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function isLikelyWavBuffer(buffer: Buffer): boolean {
  return (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WAVE"
  );
}

export function decodeDesktopVoiceAudio(input: ServerVoiceTranscriptionInput): Buffer {
  if (input.mimeType !== "audio/wav") {
    throw new Error("Only WAV audio is supported for voice transcription.");
  }
  if (input.sampleRateHz !== 24_000) {
    throw new Error("Voice transcription requires 24 kHz mono WAV audio.");
  }
  if (input.durationMs <= 0) {
    throw new Error("Voice messages must include a positive duration.");
  }
  if (input.durationMs > MAX_VOICE_DURATION_MS) {
    throw new Error("Voice messages are limited to 120 seconds.");
  }

  const normalizedBase64 = normalizeVoiceBase64(input.audioBase64);
  if (!normalizedBase64 || !isLikelyVoiceBase64(normalizedBase64)) {
    throw new Error("The recorded audio could not be decoded.");
  }

  const audioBuffer = Buffer.from(normalizedBase64, "base64");
  if (!audioBuffer.length || audioBuffer.toString("base64") !== normalizedBase64) {
    throw new Error("The recorded audio could not be decoded.");
  }
  if (audioBuffer.length > SERVER_VOICE_TRANSCRIPTION_MAX_AUDIO_BYTES) {
    throw new Error("Voice messages are limited to 10 MB.");
  }
  if (!isLikelyWavBuffer(audioBuffer)) {
    throw new Error("The recorded audio is not a valid WAV file.");
  }

  return audioBuffer;
}

// --- IPC entrypoint --------------------------------------------------------

export async function transcribeVoiceViaDesktopBridge(
  input: ServerVoiceTranscriptionInput,
): Promise<ServerVoiceTranscriptionResult> {
  const audioBuffer = decodeDesktopVoiceAudio(input);

  const resolved = resolveDesktopVoiceProvider(input.provider);
  if (!resolved) {
    throw new Error(
      "Voice transcription requires an API key for Google Gemini, Groq, or OpenAI. Please configure one in Settings -> Providers.",
    );
  }

  const { provider, apiKey } = resolved;
  let text = "";

  if (provider === "google") {
    text = await transcribeDesktopWithGemini(apiKey, input.audioBase64, input.mimeType);
  } else if (provider === "groq") {
    text = await transcribeDesktopWithGroq(apiKey, audioBuffer);
  } else if (provider === "openai") {
    text = await transcribeDesktopWithOpenAi(apiKey, audioBuffer);
  }

  return { text };
}

export function registerDesktopVoiceTranscriptionHandler(): void {
  ipcMain.removeHandler(SERVER_TRANSCRIBE_VOICE_CHANNEL);
  ipcMain.handle(
    SERVER_TRANSCRIBE_VOICE_CHANNEL,
    async (_event, input: ServerVoiceTranscriptionInput) => transcribeVoiceViaDesktopBridge(input),
  );
}
