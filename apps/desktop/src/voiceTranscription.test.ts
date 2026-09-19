import { afterEach, describe, expect, it, vi } from "vitest";

import {
  decodeDesktopVoiceAudio,
  resolveDesktopVoiceProvider,
  transcribeVoiceViaDesktopBridge,
} from "./voiceTranscription";

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

describe("desktop voice transcription", () => {
  it("validates and decodes a valid WAV payload", () => {
    const buffer = decodeDesktopVoiceAudio({
      provider: "google",
      cwd: "/test",
      mimeType: "audio/wav",
      sampleRateHz: 24_000,
      durationMs: 1_000,
      audioBase64: WAV_BASE64,
    });
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("rejects non-WAV mime types", () => {
    expect(() =>
      decodeDesktopVoiceAudio({
        provider: "google",
        cwd: "/test",
        mimeType: "audio/mp3" as any,
        sampleRateHz: 24_000,
        durationMs: 1_000,
        audioBase64: WAV_BASE64,
      }),
    ).toThrow("Only WAV audio is supported");
  });

  it("transcribes via mock provider response", async () => {
    const originalFetch = globalThis.fetch;
    const prevKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "test-gemini-key";
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "Hello from desktop voice" }] } }],
      }),
    }) as any;

    try {
      const result = await transcribeVoiceViaDesktopBridge({
        provider: "google",
        cwd: "/test",
        mimeType: "audio/wav",
        sampleRateHz: 24_000,
        durationMs: 1_000,
        audioBase64: WAV_BASE64,
      });
      expect(result.text).toBe("Hello from desktop voice");
    } finally {
      globalThis.fetch = originalFetch;
      if (prevKey === undefined) {
        delete process.env.GEMINI_API_KEY;
      } else {
        process.env.GEMINI_API_KEY = prevKey;
      }
    }
  });
});
