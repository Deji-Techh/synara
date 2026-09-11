// FILE: generateImage.ts
// Purpose: AI image generation on direct providers (no engine proxy).
// Donor: generate_image (always-consent, modifiesState). The Pro image
// endpoint is replaced by an injected ImageProvider; default is the keyless
// Pollinations client (free, no account). Files land in .caide/media/ and
// move to public/ via copy_file, per the donor workflow.

import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { defineTool, type ToolDef } from "../../harness/tools/defineTool.ts";

export interface GeneratedImage {
  bytes: Uint8Array;
  mimeType: string;
  revisedPrompt?: string;
  /** Winning cascade leg (turn-model | gemini | openai | pollinations). */
  leg?: string;
}

export type ImageProvider = (input: {
  prompt: string;
  width: number;
  height: number;
  signal?: AbortSignal;
}) => Promise<GeneratedImage>;

let provider: ImageProvider | null = null;
/** M3 injects keyed providers (OpenAI/gemini images) from settings here. */
export function setImageProvider(fn: ImageProvider | null): void {
  provider = fn;
}

/** Keyless Pollinations client (free, no account). */
export async function pollinationsGenerate(input: {
  prompt: string;
  width: number;
  height: number;
  signal?: AbortSignal;
}): Promise<GeneratedImage> {
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(input.prompt)}` +
    `?width=${input.width}&height=${input.height}&nologo=true`;
  const res = await fetch(url, { signal: input.signal });
  if (!res.ok) throw new Error(`Image generation failed with status ${res.status}`);
  const mimeType = res.headers.get("content-type") ?? "image/jpeg";
  return { bytes: new Uint8Array(await res.arrayBuffer()), mimeType };
}

const generateImageSchema = z.object({
  prompt: z.string().describe("Detailed prompt: subject, style, colors, composition, mood, aspect ratio"),
  width: z.number().int().min(256).max(2048).default(1024).describe("Image width in px"),
  height: z.number().int().min(256).max(2048).default(1024).describe("Image height in px"),
  filename: z.string().optional().describe("Descriptive filename (defaults to generated-image-<ts>.<ext>)"),
});

export const generateImageTool = defineTool({
  name: "generate_image",
  description:
    "Generate a custom image for the app (illustrations, hero art, empty-state art). Only when an existing asset, SVG, or icon library would NOT suffice. After generating, use copy_file to move it from .caide/media/ to the project's asset directory (web: public/, Flutter: assets/ + pubspec) with a descriptive filename, then reference the copied path in code.",
  schema: generateImageSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) =>
    executeGenerateImage(generateImageSchema.parse(args), ctx.appPath, ctx.signal),
  presentCall: (args: any) => `Generate image: ${(args.prompt ?? "").slice(0, 60)}`,
});

export async function executeGenerateImage(
  input: z.infer<typeof generateImageSchema>,
  appPath: string,
  signal?: AbortSignal,
): Promise<string> {
  const parsed = generateImageSchema.parse(input);
  const run = provider ?? pollinationsGenerate;
  try {
    const image = await run({
      prompt: parsed.prompt,
      width: parsed.width,
      height: parsed.height,
      ...(signal ? { signal } : {}),
    });
    const ext = /png/.test(image.mimeType) ? "png" : /webp/.test(image.mimeType) ? "webp" : /svg/.test(image.mimeType) ? "svg" : "jpg";
    const name = (parsed.filename ?? `generated-image-${Date.now()}`).replace(/[^a-zA-Z0-9-_]+/g, "-");
    const rel = path.join(".caide", "media", `${name}.${ext}`);
    const full = path.join(appPath, rel);
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, image.bytes);
    await appendImageManifest(appPath, { prompt: parsed.prompt, leg: image.leg ?? "default", file: rel, at: Date.now() });
    return [
      `Image saved to ${rel} (${image.bytes.length} bytes) via ${image.leg ?? "default"}.`,
      `Use copy_file to move it to the project's asset directory (web: public/, Flutter: assets/ + pubspec) with a descriptive filename, then reference the copied path in code.`,
    ].join("\n");
  } catch (err) {
    // Terminal fallback (P8): every network leg failed. Write a designed
    // illustrated placeholder — gradient + subject label, never a flat
    // color block with initials — and say so honestly. Only reached when the
    // user provided no asset of their own prior (the tool is only called for
    // images the app still needs).
    const rel = await writeIllustratedPlaceholder(appPath, parsed.prompt, parsed.filename);
    await appendImageManifest(appPath, { prompt: parsed.prompt, leg: "placeholder", file: rel, at: Date.now() });
    const cause = err instanceof Error ? err.message.split("\n")[0] : String(err);
    return [
      `All image-generation legs failed (${cause}). Wrote a designed illustrated placeholder to ${rel} instead.`,
      `Connect a Gemini key in Settings → Providers for real generated imagery, then re-run generate_image.`,
      `Use copy_file to move it to the project's asset directory (web: public/, Flutter: assets/ + pubspec) with a descriptive filename, then reference the copied path in code.`,
    ].join("\n");
  }
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Designed placeholder: diagonal gradient, soft grid pattern, centered
 * subject label. Deliberately NOT a flat product-photo block.
 */
export async function writeIllustratedPlaceholder(
  appPath: string,
  prompt: string,
  filename?: string,
): Promise<string> {
  const label = prompt.split(/[.!]/)[0]?.slice(0, 42).trim() || "App artwork";
  const hue = Math.abs([...prompt].reduce((a, c) => a + c.charCodeAt(0), 0)) % 360;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${hue},72%,62%)"/><stop offset="1" stop-color="hsl(${(hue + 48) % 360},68%,42%)"/>` +
    `</linearGradient><pattern id="p" width="64" height="64" patternUnits="userSpaceOnUse">` +
    `<circle cx="8" cy="8" r="2.5" fill="rgba(255,255,255,0.25)"/></pattern></defs>` +
    `<rect width="1024" height="1024" fill="url(#g)"/><rect width="1024" height="1024" fill="url(#p)"/>` +
    `<rect x="72" y="392" width="880" height="240" rx="28" fill="rgba(0,0,0,0.28)"/>` +
    `<text x="512" y="500" text-anchor="middle" font-family="system-ui,sans-serif" font-size="52" font-weight="600" fill="#fff">${escapeXml(label)}</text>` +
    `<text x="512" y="556" text-anchor="middle" font-family="system-ui,sans-serif" font-size="28" fill="rgba(255,255,255,0.8)">Illustrated placeholder — replace with generated art</text>` +
    `</svg>`;
  const name = (filename ?? `placeholder-${Date.now()}`).replace(/[^a-zA-Z0-9-_]+/g, "-");
  const rel = path.join(".caide", "media", `${name}.svg`);
  const full = path.join(appPath, rel);
  await fs.promises.mkdir(path.dirname(full), { recursive: true });
  await fs.promises.writeFile(full, svg);
  return rel;
}

export interface ImageManifestEntry {
  prompt: string;
  leg: string;
  file: string;
  at: number;
}

/** Provenance log for every image/placeholder the agent materializes. */
export async function appendImageManifest(appPath: string, entry: ImageManifestEntry): Promise<void> {
  const file = path.join(appPath, ".caide", "media", "manifest.json");
  try {
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    let list: ImageManifestEntry[] = [];
    try {
      list = JSON.parse(await fs.promises.readFile(file, "utf8")) as ImageManifestEntry[];
      if (!Array.isArray(list)) list = [];
    } catch {
      // first entry — start clean
    }
    list.push(entry);
    await fs.promises.writeFile(file, JSON.stringify(list.slice(-200), null, 2));
  } catch {
    // provenance is best-effort; never fail the tool call
  }
}

export const ALL_IMAGE_TOOLS: ToolDef[] = [generateImageTool];
