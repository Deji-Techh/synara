import type { FetchFunction } from "@ai-sdk/provider-utils";

/**
 * Wraps a fetch function for OpenAI-compatible providers to ensure that SSE
 * streams always end with a valid `finish_reason`.
 *
 * Many third-party OpenAI-compatible endpoints (like local LLMs, proxy gateways,
 * or custom providers) close the HTTP connection after sending delta chunks without
 * emitting a final chunk containing `finish_reason: "stop"` or `finish_reason: "tool_calls"`.
 * Without a finish reason, `@ai-sdk/openai-compatible` throws `AI_InvalidResponseDataError:
 * Response stream ended without a finish reason`.
 *
 * This wrapper transparently inspects SSE response streams and synthesizes a terminal
 * `finish_reason: "stop"` chunk if the stream closes without one.
 */
export function createCustomProviderFetch(baseFetch?: FetchFunction): FetchFunction {
  const fetchFn = baseFetch ?? fetch;

  return async (input, init) => {
    const response = await fetchFn(input, init);

    const contentType = response.headers.get("content-type") ?? "";
    const isEventStream = contentType.includes("text/event-stream");

    if (!response.ok || !response.body || !isEventStream) {
      return response;
    }

    const utf8Decoder = new TextDecoder("utf-8");
    const utf8Encoder = new TextEncoder();

    let hasFinishReason = false;
    let hasDone = false;
    let pendingLineBuffer = "";

    const transformStream = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        // Pass original chunk bytes through
        controller.enqueue(chunk);

        // Decode chunk to track SSE lines
        const text = utf8Decoder.decode(chunk, { stream: true });
        pendingLineBuffer += text;

        const lines = pendingLineBuffer.split("\n");
        // Keep the last incomplete line fragment in the buffer
        pendingLineBuffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed === "data: [DONE]") {
            hasDone = true;
            continue;
          }
          if (trimmed.startsWith("data:") && trimmed !== "data:") {
            const dataStr = trimmed.slice(5).trim();
            if (dataStr.includes('"finish_reason":"') || dataStr.includes('"finish_reason": "')) {
              if (
                !dataStr.includes('"finish_reason":null') &&
                !dataStr.includes('"finish_reason": null')
              ) {
                hasFinishReason = true;
              }
            }
          }
        }
      },

      flush(controller) {
        if (!hasFinishReason) {
          // Synthesize a graceful terminal chunk with finish_reason: "stop"
          const synthFinishChunk = `data: {"id":"chatcmpl-synth-finish","object":"chat.completion.chunk","created":${Math.floor(
            Date.now() / 1000,
          )},"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n`;
          controller.enqueue(utf8Encoder.encode(synthFinishChunk));
        }

        if (!hasDone) {
          controller.enqueue(utf8Encoder.encode("data: [DONE]\n\n"));
        }
      },
    });

    const transformedBody = response.body.pipeThrough(transformStream);

    return new Response(transformedBody, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}
