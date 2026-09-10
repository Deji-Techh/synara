// FILE: chatMessageImages.ts
// Purpose: Shape a user message carrying staged image attachments for the
// target provider endpoint: OpenAI-style content arrays for
// responses/chat-completions, Anthropic blocks for messages, parts for
// Gemini. The provider adapter passes these shapes through verbatim
// (Gemini reads m.parts). Messages without images keep plain string
// content so token usage and snapshots stay identical.
// Layer: Harness provider helper (pure)
// Exports: buildUserMessageWithImages, ResolvedChatImage

import type { ApiEndpoint } from "./apiAdapter.ts";

export interface ResolvedChatImage {
  readonly mimeType: string;
  readonly base64: string;
}

export interface BuiltUserMessage {
  readonly role: "user";
  readonly content: unknown;
  readonly parts?: unknown;
}

function openAiImagePart(image: ResolvedChatImage): Record<string, unknown> {
  return {
    type: "image_url",
    image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
  };
}

export function buildUserMessageWithImages(input: {
  readonly text: string;
  readonly images: readonly ResolvedChatImage[];
  readonly endpoint: ApiEndpoint;
}): BuiltUserMessage {
  if (input.images.length === 0) {
    return { role: "user", content: input.text };
  }
  if (input.endpoint === "gemini") {
    return {
      role: "user",
      content: input.text,
      parts: [
        ...(input.text.length > 0 ? [{ text: input.text }] : []),
        ...input.images.map((image) => ({
          inline_data: { mime_type: image.mimeType, data: image.base64 },
        })),
      ],
    };
  }
  if (input.endpoint === "messages") {
    return {
      role: "user",
      content: [
        ...(input.text.length > 0 ? [{ type: "text", text: input.text }] : []),
        ...input.images.map((image) => ({
          type: "image",
          source: {
            type: "base64",
            media_type: image.mimeType,
            data: image.base64,
          },
        })),
      ],
    };
  }
  return {
    role: "user",
    content: [
      ...(input.text.length > 0 ? [{ type: "text", text: input.text }] : []),
      ...input.images.map(openAiImagePart),
    ],
  };
}
