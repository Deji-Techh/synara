import { describe, it, expect } from "vitest";
import { createCustomProviderFetch } from "./custom_provider_stream_fetch";

describe("createCustomProviderFetch", () => {
  it("synthesizes a finish_reason when stream ends without one", async () => {
    const mockFetch = async () => {
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode('data: {"choices":[{"index":0,"delta":{"content":"Hello"}}]}\n\n'),
          );
          controller.close();
        },
      });

      return new Response(stream, {
        headers: { "content-type": "text/event-stream" },
      });
    };

    const wrappedFetch = createCustomProviderFetch(mockFetch as any);
    const response = await wrappedFetch("https://api.test/chat/completions", {});
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let result = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value);
    }

    expect(result).toContain('data: {"choices":[{"index":0,"delta":{"content":"Hello"}}]}');
    expect(result).toContain('"finish_reason":"stop"');
    expect(result).toContain("data: [DONE]");
  });

  it("does not synthesize duplicate finish_reason when already present", async () => {
    const mockFetch = async () => {
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode('data: {"choices":[{"index":0,"delta":{"content":"Hello"}}]}\n\n'),
          );
          controller.enqueue(
            encoder.encode('data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n'),
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });

      return new Response(stream, {
        headers: { "content-type": "text/event-stream" },
      });
    };

    const wrappedFetch = createCustomProviderFetch(mockFetch as any);
    const response = await wrappedFetch("https://api.test/chat/completions", {});
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let result = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value);
    }

    const matches = result.match(/finish_reason/g);
    expect(matches).toHaveLength(1);
  });
});
