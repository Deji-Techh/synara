// FILE: chatMessageImages.test.ts
// Purpose: Cover per-endpoint user-message shaping for staged images.
// Layer: Harness provider test

import { describe, expect, it } from "vitest";

import { buildUserMessageWithImages } from "./chatMessageImages.ts";

const IMAGE = { mimeType: "image/png", base64: "aGVsbG8=" };

describe("buildUserMessageWithImages", () => {
  it("keeps plain string content when there are no images", () => {
    expect(
      buildUserMessageWithImages({ text: "hi", images: [], endpoint: "chat/completions" }),
    ).toEqual({ role: "user", content: "hi" });
  });

  it("shapes OpenAI-style content arrays for chat/completions", () => {
    expect(
      buildUserMessageWithImages({ text: "look", images: [IMAGE], endpoint: "chat/completions" }),
    ).toEqual({
      role: "user",
      content: [
        { type: "text", text: "look" },
        { type: "image_url", image_url: { url: "data:image/png;base64,aGVsbG8=" } },
      ],
    });
  });

  it("shapes responses input the same way", () => {
    const built = buildUserMessageWithImages({ text: "", images: [IMAGE], endpoint: "responses" });
    expect(built).toEqual({
      role: "user",
      content: [{ type: "image_url", image_url: { url: "data:image/png;base64,aGVsbG8=" } }],
    });
  });

  it("shapes Anthropic blocks for the messages endpoint", () => {
    expect(
      buildUserMessageWithImages({ text: "look", images: [IMAGE], endpoint: "messages" }),
    ).toEqual({
      role: "user",
      content: [
        { type: "text", text: "look" },
        {
          type: "image",
          source: { type: "base64", media_type: "image/png", data: "aGVsbG8=" },
        },
      ],
    });
  });

  it("shapes Gemini parts", () => {
    const built = buildUserMessageWithImages({ text: "look", images: [IMAGE], endpoint: "gemini" });
    expect(built.role).toBe("user");
    expect(built.parts).toEqual([
      { text: "look" },
      { inline_data: { mime_type: "image/png", data: "aGVsbG8=" } },
    ]);
  });
});
