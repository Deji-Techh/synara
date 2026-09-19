// FILE: keyedImages.ts
// Purpose: Keyed image providers + silent ordered cascade (P8).
// Order mirrors the voice-transcription cascade: explicit Settings
// preference first, then Gemini (connected key), OpenAI Images, keyless
// Pollinations, and finally a designed illustrated placeholder. Availability
// is key-presence + model-name pattern only — NEVER live probes, so
// selection costs zero network and never stalls the turn. The single
// execution reports its winning leg; failures fall through silently.

import type { ImageProvider } from "./generateImage.ts";
import { pollinationsGenerate } from "./generateImage.ts";
import { getVoiceApiKey } from "../../voice/transcriptionService.ts";

export type ImageLeg = "turn-model" | "gemini" | "openai" | "pollinations" | "placeholder";

export interface CascadeLeg {
  leg: ImageLeg;
  label: string;
  run: ImageProvider;
}

const GEMINI_IMAGE_MODELS = [
  "gemini-2.0-flash-preview-image-generation",
  "gemini-2.5-flash-image-preview",
  "gemini-2.5-flash-image",
  "imagen-4.0-generate-001",
  "imagen-3.0-generate-002",
];

function taggedRun(leg: ImageLeg, run: ImageProvider): ImageProvider {
  return async (input) => ({ ...(await run(input)), leg });
}

/** Gemini image generation via generateContent (TEXT+IMAGE modalities). */
export function geminiImageProvider(apiKey: string, model?: string): ImageProvider {
  const models = [model?.trim(), ...GEMINI_IMAGE_MODELS].filter(Boolean) as string[];
  return async ({ prompt, width, height, signal }) => {
    let lastError: unknown = null;
    for (const m of models) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 120_000);
      const onAbort = () => controller.abort();
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`,
          {
            method: "POST",
            signal: controller.signal,
            headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify({
              contents: [
                { parts: [{ text: `Generate an image (${width}x${height}): ${prompt}` }] },
              ],
              generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
            }),
          },
        );
        if (!res.ok) {
          lastError = new Error(`Gemini Images (${m}) HTTP ${res.status}`);
          continue;
        }
        const data = (await res.json()) as {
          candidates?: Array<{
            content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
          }>;
        };
        const parts = data.candidates?.[0]?.content?.parts ?? [];
        const img = parts.find((p) => p.inlineData?.data);
        if (!img?.inlineData?.data) {
          lastError = new Error(`Gemini Images (${m}) returned no image data`);
          continue;
        }
        return {
          bytes: Uint8Array.from(Buffer.from(img.inlineData.data, "base64")),
          mimeType: img.inlineData.mimeType ?? "image/png",
        };
      } catch (err) {
        lastError = err;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
      }
    }
    throw lastError ?? new Error("Gemini image generation failed across all models.");
  };
}

/** OpenAI Images: POST /v1/images/generations → b64_json. */
export function openaiImageProvider(apiKey: string, model = "dall-e-3"): ImageProvider {
  return async ({ prompt, width, height, signal }) => {
    const size =
      width >= 1792 || height >= 1792
        ? "1792x1024"
        : width > height
          ? "1792x1024"
          : height > width
            ? "1024x1792"
            : "1024x1024";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, prompt, size, response_format: "b64_json", n: 1 }),
      });
      if (!res.ok) throw new Error(`OpenAI Images HTTP ${res.status}`);
      const data = (await res.json()) as { data?: Array<{ b64_json?: string }> };
      const b64 = data.data?.[0]?.b64_json;
      if (!b64) throw new Error("OpenAI Images returned no image data");
      return { bytes: Uint8Array.from(Buffer.from(b64, "base64")), mimeType: "image/png" };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  };
}

/** OpenAI key (or explicit override) → provider, else null (Pollinations). */
export function autoImageProvider(): ImageProvider | null {
  const key = process.env.OPENAI_IMAGE_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  return openaiImageProvider(key, process.env.OPENAI_IMAGE_MODEL?.trim() || "dall-e-3");
}

export type ImagePreference =
  | "auto"
  | "turn-model"
  | "gemini"
  | "openai"
  | "pollinations"
  | "placeholder";

export function normalizeImagePreference(value: unknown): ImagePreference {
  return value === "turn-model" ||
    value === "gemini" ||
    value === "openai" ||
    value === "pollinations" ||
    value === "placeholder"
    ? value
    : "auto";
}

function openaiKey(): string | null {
  return (
    process.env.OPENAI_IMAGE_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    getVoiceApiKey("openai")
  );
}

/**
 * Final try order by key presence only (no probes). Explicit Settings
 * preference first when available, then the auto order
 * (turn-model → gemini → openai → pollinations); unavailable picks fall
 * through silently. "placeholder" returns [] — the caller skips generation
 * entirely. Pure — unit-testable without network.
 */
export function resolveImageLegs(
  options: {
    preferred?: ImagePreference | string | null;
    imageModel?: string | null;
    turnProviderId?: string | null;
    turnModelId?: string | null;
  } = {},
): CascadeLeg[] {
  const preferred = normalizeImagePreference(options.preferred ?? "auto");
  if (preferred === "placeholder") return [];
  const imageModel = options.imageModel?.trim() || undefined;
  const turnProvider = (options.turnProviderId ?? "").toLowerCase();
  const turnModel = options.turnModelId ?? "";
  const googleKey = getVoiceApiKey("google");
  const oaiKey = openaiKey();

  const geminiLeg: CascadeLeg | null = googleKey
    ? {
        leg: "gemini",
        label: "Gemini Imagen",
        run: taggedRun("gemini", geminiImageProvider(googleKey, imageModel)),
      }
    : null;
  const openaiLeg: CascadeLeg | null = oaiKey
    ? {
        leg: "openai",
        label: "OpenAI Images",
        run: taggedRun("openai", openaiImageProvider(oaiKey, imageModel)),
      }
    : null;

  // Turn-model leg: only when the turn model is itself image-capable
  // (name pattern, no probe). Delegates to that provider's image endpoint.
  let turnLeg: CascadeLeg | null = null;
  if (/imagen|gpt-image|dall-e|image-generation|image-preview/i.test(turnModel)) {
    if (turnProvider === "google" && googleKey) {
      turnLeg = {
        leg: "turn-model",
        label: `Turn model (${turnModel})`,
        run: taggedRun("turn-model", geminiImageProvider(googleKey, turnModel)),
      };
    } else if (turnProvider === "openai" && oaiKey) {
      turnLeg = {
        leg: "turn-model",
        label: `Turn model (${turnModel})`,
        run: taggedRun("turn-model", openaiImageProvider(oaiKey, turnModel)),
      };
    }
  }

  const pollinationsLeg: CascadeLeg = {
    leg: "pollinations",
    label: "Pollinations (keyless)",
    run: taggedRun("pollinations", pollinationsGenerate),
  };

  const auto: CascadeLeg[] = [];
  if (turnLeg) auto.push(turnLeg);
  if (geminiLeg) auto.push(geminiLeg);
  if (openaiLeg) auto.push(openaiLeg);
  auto.push(pollinationsLeg);

  if (preferred === "auto") return auto;
  if (preferred === "pollinations")
    return [pollinationsLeg, ...auto.filter((l) => l.leg !== "pollinations")];
  const pick = auto.find((l) => l.leg === preferred);
  if (!pick) return auto; // preferred leg has no key — silent fallback to auto
  return [pick, ...auto.filter((l) => l.leg !== preferred)];
}

/**
 * Single ImageProvider that walks the ordered legs silently: first success
 * wins and carries its leg tag; total failure throws the aggregate so the
 * caller can fall back to the illustrated placeholder.
 */
export function cascadeImageProvider(legs: CascadeLeg[]): ImageProvider {
  return async (input) => {
    const errors: string[] = [];
    for (const leg of legs) {
      try {
        const out = await leg.run(input);
        return { ...out, leg: out.leg ?? leg.leg };
      } catch (err) {
        errors.push(`${leg.label}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    throw new Error(
      `Image generation failed across all configured legs:\n${errors.map((e, i) => `  ${i + 1}. ${e}`).join("\n")}`,
    );
  };
}
