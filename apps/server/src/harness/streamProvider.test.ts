// harness/streamProvider.test.ts — M26 real provider streaming with mock fetch
import { describe, it, expect, vi } from "vitest";
import { CaideRunner } from "./caideRunner";

describe("caideRunner.streamProvider — per-model endpointForModel", () => {
  it("emits token events via typed {token} channel", async () => {
    const runner = new CaideRunner();
    const tokens: string[] = [];
    runner.onEvent((e) => {
      if (e.event.type === "token") tokens.push(e.event.content);
    });

    // Mock fetch to return a chat/completions SSE stream
    const mockFetch = vi.fn(async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"hello"}}]}\n'));
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":" world"}}]}\n'));
          controller.enqueue(new TextEncoder().encode("data: [DONE]\n"));
          controller.close();
        },
      });
      return { ok: true, status: 200, body: stream } as unknown as Response;
    });
    const originalFetch = globalThis.fetch;
    (globalThis as unknown as { fetch: typeof fetch }).fetch = mockFetch as unknown as typeof fetch;

    try {
      runner.startTurn("t1", "turn1", "p1", "builder", "stage", []);
      await runner.streamProvider({ threadId: "t1", turnId: "turn1", model: "deepseek-v4-flash", prompt: "hey", baseUrl: "https://api.example.com/v1", apiKey: "test-key" });
      expect(tokens.join("")).toBe("hello world");
      expect(mockFetch).toHaveBeenCalled();
      const url = (mockFetch.mock.calls[0]?.[0] as string) ?? "";
      expect(url).toContain("/chat/completions");
    } finally {
      (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
    }
  });
});
