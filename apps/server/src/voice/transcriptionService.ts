// FILE: transcriptionService.ts
// Purpose: Multi-provider audio voice transcription supporting Google Gemini, Groq Whisper, and OpenAI Whisper.
// Layer: Server voice infrastructure

import { Buffer } from "node:buffer";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import type { ServerVoiceTranscriptionInput, ServerVoiceTranscriptionResult } from "@caide/contracts";
import { sharedProviderSecrets } from "../dyad/providers/secrets.ts";

const PROVIDER_ENV_KEYS: Record<string, string[]> = {
  google: ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
  groq: ["GROQ_API_KEY"],
  openai: ["OPENAI_API_KEY"],
};

export function getVoiceApiKey(provider: string): string | null {
  try {
    const secrets = sharedProviderSecrets().read();
    const stored = secrets?.providers?.[provider]?.apiKey?.trim();
    if (stored) return stored;
  } catch {
    // ignore
  }

  const envKeys = PROVIDER_ENV_KEYS[provider] || [];
  for (const envKey of envKeys) {
    const val = process.env[envKey]?.trim();
    if (val) return val;
  }

  // Check ~/.caide/userdata/secrets legacy files
  try {
    const home = process.env.HOME || os.homedir();
    const secretPath = path.join(home, ".caide/userdata/secrets", `provider-${provider}-api-key.bin`);
    if (fs.existsSync(secretPath)) {
      const key = fs.readFileSync(secretPath, "utf-8").trim();
      if (key) return key;
    }
  } catch {
    // ignore
  }

  return null;
}

export function resolveBestVoiceProvider(preferred?: string): { provider: "google" | "groq" | "openai"; apiKey: string } | null {
  if (preferred) {
    const norm = preferred.toLowerCase();
    if (norm === "google" || norm === "gemini") {
      const key = getVoiceApiKey("google");
      if (key) return { provider: "google", apiKey: key };
    } else if (norm === "groq") {
      const key = getVoiceApiKey("groq");
      if (key) return { provider: "groq", apiKey: key };
    } else if (norm === "openai") {
      const key = getVoiceApiKey("openai");
      if (key) return { provider: "openai", apiKey: key };
    }
  }

  // Fallback in order of quality & speed
  const googleKey = getVoiceApiKey("google");
  if (googleKey) return { provider: "google", apiKey: googleKey };

  const groqKey = getVoiceApiKey("groq");
  if (groqKey) return { provider: "groq", apiKey: groqKey };

  const openaiKey = getVoiceApiKey("openai");
  if (openaiKey) return { provider: "openai", apiKey: openaiKey };

  return null;
}

async function transcribeWithGemini(apiKey: string, audioBase64: string, mimeType = "audio/wav"): Promise<string> {
  // Using gemini-2.5-flash or gemini-1.5-flash which has multimodal audio support
  const models = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash"];
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
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API returned HTTP ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as any;
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
      return text;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error("Gemini transcription failed across all models.");
}

async function transcribeWithGroq(apiKey: string, audioBuffer: Buffer): Promise<string> {
  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: "audio/wav" });
  formData.append("file", blob, "audio.wav");
  formData.append("model", "whisper-large-v3-turbo");
  formData.append("response_format", "json");

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq Whisper API returned HTTP ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as { text?: string };
  return (data?.text ?? "").trim();
}

async function transcribeWithOpenAi(apiKey: string, audioBuffer: Buffer): Promise<string> {
  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: "audio/wav" });
  formData.append("file", blob, "audio.wav");
  formData.append("model", "whisper-1");
  formData.append("response_format", "json");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI Whisper API returned HTTP ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as { text?: string };
  return (data?.text ?? "").trim();
}

export async function transcribeVoiceAudio(
  input: ServerVoiceTranscriptionInput,
): Promise<ServerVoiceTranscriptionResult> {
  const resolved = resolveBestVoiceProvider(input.provider);
  if (!resolved) {
    throw new Error(
      "Voice transcription requires an API key for Google Gemini, Groq, or OpenAI. Please configure one in Settings → Providers.",
    );
  }

  const { provider, apiKey } = resolved;
  const audioBuffer = Buffer.from(input.audioBase64, "base64");

  let text = "";
  if (provider === "google") {
    text = await transcribeWithGemini(apiKey, input.audioBase64, input.mimeType);
  } else if (provider === "groq") {
    text = await transcribeWithGroq(apiKey, audioBuffer);
  } else if (provider === "openai") {
    text = await transcribeWithOpenAi(apiKey, audioBuffer);
  }

  return { text };
}
