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
    "Generate a custom image for the app (illustrations, hero art, empty-state art). Only when an existing asset, SVG, or icon library would NOT suffice. After generating, use copy_file to move it from .caide/media/ to the project's public directory with a descriptive filename, then reference the copied path in code.",
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
  const image = await run({ prompt: parsed.prompt, width: parsed.width, height: parsed.height, signal });
  const ext = /png/.test(image.mimeType) ? "png" : /webp/.test(image.mimeType) ? "webp" : "jpg";
  const name = (parsed.filename ?? `generated-image-${Date.now()}`).replace(/[^a-zA-Z0-9-_]+/g, "-");
  const rel = path.join(".caide", "media", `${name}.${ext}`);
  const full = path.join(appPath, rel);
  await fs.promises.mkdir(path.dirname(full), { recursive: true });
  await fs.promises.writeFile(full, image.bytes);
  return [
    `Image saved to ${rel} (${image.bytes.length} bytes).`,
    `Use copy_file to move it to the project's public directory with a descriptive filename, then reference the copied path in code.`,
  ].join("\n");
}

export const ALL_IMAGE_TOOLS: ToolDef[] = [generateImageTool];
