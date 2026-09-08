import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getVoiceApiKey,
  resolveAllVoiceProviders,
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
    process.env.GEMINI_API_KEY = "test-gemini-key";
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
      delete process.env.GEMINI_API_KEY;
      globalThis.fetch = originalFetch;
    }
  });

  it("strips outer quotes from transcription result", async () => {
    const originalFetch = globalThis.fetch;
    process.env.GEMINI_API_KEY = "test-gemini-key";
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
      delete process.env.GEMINI_API_KEY;
      globalThis.fetch = originalFetch;
    }
  });

  it("prefers gemini over chat providers and demotes zen/go last", () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.OPENCODE_ZEN_API_KEY = "test-zen-key";
    process.env.OPENCODE_GO_API_KEY = "test-go-key";
    try {
      for (const preferred of ["ai-model", "auto", undefined, "opencodeZen", "opencodeGo"]) {
        const order = resolveAllVoiceProviders(preferred).map((p) => p.provider);
        expect(order[0]).toBe("google");
        expect(order.slice(-2)).toEqual(["opencodeZen", "opencodeGo"]);
      }
      // Explicit whisper preference with a key stays first.
      process.env.GROQ_API_KEY = "test-groq-key";
      expect(resolveAllVoiceProviders("groq")[0]?.provider).toBe("groq");
    } finally {
      delete process.env.GEMINI_API_KEY;
      delete process.env.OPENCODE_ZEN_API_KEY;
      delete process.env.OPENCODE_GO_API_KEY;
      delete process.env.GROQ_API_KEY;
    }
  });

  it("accepts stored keys regardless of prefix (no blob rejection)", () => {
    process.env.GEMINI_API_KEY = "AQ.Ab8fake-stored-value";
    try {
      expect(getVoiceApiKey("google")).toBe("AQ.Ab8fake-stored-value");
    } finally {
      delete process.env.GEMINI_API_KEY;
    }
  });

  it("returns empty text (not an error) when every provider hears silence", async () => {
    const originalFetch = globalThis.fetch;
    process.env.GEMINI_API_KEY = "test-gemini-key";
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [] } }] }),
    }) as any;

    try {
      const result = await transcribeVoiceAudio({
        provider: "ai-model",
        cwd: "/test",
        mimeType: "audio/wav",
        sampleRateHz: 24_000,
        durationMs: 1_000,
        audioBase64: WAV_BASE64,
      });
      expect(result.text).toBe("");
    } finally {
      delete process.env.GEMINI_API_KEY;
      globalThis.fetch = originalFetch;
    }
  });

  it("falls through to the next provider when gemini rejects the key", async () => {
    const originalFetch = globalThis.fetch;
    process.env.GEMINI_API_KEY = "bad-key";
    process.env.GROQ_API_KEY = "test-groq-key";
    const fetchMock = vi.fn();
    fetchMock.mockRejectedValueOnce(Object.assign(new Error("Gemini API key rejected (HTTP 403)."), {}));
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ text: "via groq" }) });
    globalThis.fetch = fetchMock as any;

    try {
      const result = await transcribeVoiceAudio({
        provider: "ai-model",
        cwd: "/test",
        mimeType: "audio/wav",
        sampleRateHz: 24_000,
        durationMs: 1_000,
        audioBase64: WAV_BASE64,
      });
      expect(result.text).toBe("via groq");
    } finally {
      delete process.env.GEMINI_API_KEY;
      delete process.env.GROQ_API_KEY;
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
