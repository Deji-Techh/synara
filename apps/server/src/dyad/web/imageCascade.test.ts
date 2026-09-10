// FILE: imageCascade.test.ts
// Purpose: P8 gate — image cascade ordering is key-presence only (no
// probes), explicit preference wins when available and falls through
// silently when not, placeholder preference skips generation.

import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import {
  cascadeImageProvider,
  normalizeImagePreference,
  resolveImageLegs,
} from "./keyedImages.ts";

vi.mock("../../voice/transcriptionService.ts", () => ({
  getVoiceApiKey: vi.fn((_provider: string) => null),
}));

import { getVoiceApiKey } from "../../voice/transcriptionService.ts";

const mockKey = vi.mocked(getVoiceApiKey);

beforeEach(() => {
  mockKey.mockReset();
  mockKey.mockImplementation(() => null);
  // Deterministic regardless of dev-machine env.
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("OPENAI_IMAGE_API_KEY", "");
  vi.stubEnv("OPENAI_IMAGE_MODEL", "");
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("GOOGLE_API_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function legsOf(opts: Parameters<typeof resolveImageLegs>[0] = {}) {
  return resolveImageLegs(opts).map((l) => l.leg);
}

describe("image cascade (p8)", () => {
  it("auto with no keys resolves to keyless pollinations only", () => {
    expect(legsOf()).toEqual(["pollinations"]);
  });

  it("unavailable explicit preference falls through to auto silently", () => {
    expect(legsOf({ preferred: "gemini" })).toEqual(["pollinations"]);
    expect(legsOf({ preferred: "openai" })).toEqual(["pollinations"]);
    expect(legsOf({ preferred: "turn-model" })).toEqual(["pollinations"]);
  });

  it("placeholder preference skips generation entirely", () => {
    expect(legsOf({ preferred: "placeholder" })).toEqual([]);
  });

  it("pollinations preference leads with pollinations", () => {
    expect(legsOf({ preferred: "pollinations" })[0]).toBe("pollinations");
  });

  it("gemini key puts gemini first in auto order", () => {
    mockKey.mockImplementation((p: string) => (p === "google" ? "test-key" : null));
    expect(legsOf()).toEqual(["gemini", "pollinations"]);
    expect(legsOf({ preferred: "openai" })[0]).toBe("gemini");
  });

  it("capable turn model leads when its provider key exists", () => {
    mockKey.mockImplementation((p: string) => (p === "google" ? "test-key" : null));
    expect(
      legsOf({ turnProviderId: "google", turnModelId: "gemini-2.0-flash-preview-image-generation" }),
    ).toEqual(["turn-model", "gemini", "pollinations"]);
  });

  it("incapable turn model never claims the turn leg", () => {
    mockKey.mockImplementation((p: string) => (p === "google" ? "test-key" : null));
    expect(legsOf({ turnProviderId: "google", turnModelId: "gemini-2.5-flash" })).toEqual([
      "gemini",
      "pollinations",
    ]);
  });

  it("normalizes bogus preferences to auto", () => {
    expect(normalizeImagePreference("dalí")).toBe("auto");
    expect(normalizeImagePreference(null)).toBe("auto");
  });

  it("cascade runner takes the first success and tags its leg", async () => {
    const run = cascadeImageProvider([
      {
        leg: "gemini",
        label: "Gemini Imagen",
        run: async () => {
          throw new Error("nope");
        },
      },
      {
        leg: "openai",
        label: "OpenAI Images",
        run: async () => ({ bytes: new Uint8Array([1]), mimeType: "image/png" as const }),
      },
    ]);
    const out = await run({ prompt: "x", width: 512, height: 512 });
    expect(out.leg).toBe("openai");
    expect(out.bytes).toHaveLength(1);
  });

  it("total failure throws an aggregate for the placeholder path", async () => {
    const run = cascadeImageProvider([
      {
        leg: "gemini",
        label: "Gemini Imagen",
        run: async () => {
          throw new Error("down");
        },
      },
    ]);
    await expect(run({ prompt: "x", width: 512, height: 512 })).rejects.toThrow(
      /across all configured legs/,
    );
  });
});
