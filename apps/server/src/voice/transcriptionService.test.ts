import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getVoiceApiKey,
  resolveBestVoiceProvider,
  transcribeVoiceAudio,
} from "./transcriptionService";

const WAV_BASE64 = Buffer.from(
  "RIFF" +
    "\x24\x00\x00\x00" +
    "WAVE" +
    "fmt \x10\x00\x00\x00\x01\x00\x01\x00\x80\x5d\x00\x00\x00\xbb\x00\x00\x02\x00\x10\x00" +
    "data\x00\x00\x00\x00",
  "binary",
).toString("base64");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("transcriptionService", () => {
  it("resolves google provider when key is available", () => {
    const originalEnv = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "test-gemini-key";

    try {
      const resolved = resolveBestVoiceProvider("google");
      expect(resolved).not.toBeNull();
      expect(resolved?.provider).toBe("google");
      expect(resolved?.apiKey).toBe("test-gemini-key");
    } finally {
      if (originalEnv) {
        process.env.GEMINI_API_KEY = originalEnv;
      } else {
        delete process.env.GEMINI_API_KEY;
      }
    }
  });

  it("transcribes audio via Gemini mock", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: "Spoken voice transcription test" }],
            },
          },
        ],
      }),
    }) as any;

    try {
      const result = await transcribeVoiceAudio({
        provider: "google",
        cwd: "/test",
        mimeType: "audio/wav",
        sampleRateHz: 24_000,
        durationMs: 1_000,
        audioBase64: WAV_BASE64,
      });

      expect(result.text).toBe("Spoken voice transcription test");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("strips outer quotes from transcription result", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: '"Quoted voice note text"' }],
            },
          },
        ],
      }),
    }) as any;

    try {
      const result = await transcribeVoiceAudio({
        provider: "google",
        cwd: "/test",
        mimeType: "audio/wav",
        sampleRateHz: 24_000,
        durationMs: 1_000,
        audioBase64: WAV_BASE64,
      });

      expect(result.text).toBe("Quoted voice note text");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("transcribes audio via Groq Whisper mock", async () => {
    process.env.GROQ_API_KEY = "test-groq-key";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ text: "Transcribed with Groq Whisper" }),
    }) as any;

    try {
      const result = await transcribeVoiceAudio({
        provider: "groq",
        cwd: "/test",
        mimeType: "audio/wav",
        sampleRateHz: 24_000,
        durationMs: 1_000,
        audioBase64: WAV_BASE64,
      });

      expect(result.text).toBe("Transcribed with Groq Whisper");
    } finally {
      delete process.env.GROQ_API_KEY;
      globalThis.fetch = originalFetch;
    }
  });

  it("transcribes audio via OpenAI Whisper mock", async () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ text: "Transcribed with OpenAI Whisper" }),
    }) as any;

    try {
      const result = await transcribeVoiceAudio({
        provider: "openai",
        cwd: "/test",
        mimeType: "audio/wav",
        sampleRateHz: 24_000,
        durationMs: 1_000,
        audioBase64: WAV_BASE64,
      });

      expect(result.text).toBe("Transcribed with OpenAI Whisper");
    } finally {
      delete process.env.OPENAI_API_KEY;
      globalThis.fetch = originalFetch;
    }
  });
});
