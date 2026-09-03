// FILE: keyedImages.ts
// Purpose: Keyed image provider (OpenAI Images API, dall-e-3 shape).
// Selected by env presence in turnContext; Pollinations stays the default.

import type { ImageProvider } from "./generateImage.ts";

/** OpenAI Images: POST /v1/images/generations → b64_json. */
export function openaiImageProvider(apiKey: string, model = "dall-e-3"): ImageProvider {
  return async ({ prompt, width, height, signal }) => {
    const size = width >= 1792 || height >= 1792 ? "1792x1024" : width > height ? "1792x1024" : height > width ? "1024x1792" : "1024x1024";
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
