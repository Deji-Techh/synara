import { BlockAssembler, LLMStreamTiming, type CompleteToolCall } from "./stream.ts";

export type ApiEndpoint = "responses" | "chat/completions" | "messages" | "gemini";

const RESPONSES_MODELS = new Set(["grok", "gpt", "muse-spark", "o1", "o3"]);
const MESSAGES_MODELS = new Set(["minimax", "qwen", "claude", "sonnet", "opus", "fable"]);
const GEMINI_MODELS = new Set(["gemini"]);

export interface ProviderErrorDetails {
  status: number;
  code: string;
  message: string;
  retryable: boolean;
}

export class ProviderApiError extends Error {
  constructor(public readonly details: ProviderErrorDetails) {
    super(`Provider Error (${details.status} - ${details.code}): ${details.message}`);
    this.name = "ProviderApiError";
  }
}

export function endpointForModel(modelId: string): ApiEndpoint {
  const lower = modelId.toLowerCase();
  if (Array.from(GEMINI_MODELS).some((m) => lower.includes(m))) return "gemini";
  if (Array.from(RESPONSES_MODELS).some((m) => lower.includes(m))) return "responses";
  if (Array.from(MESSAGES_MODELS).some((m) => lower.includes(m))) return "messages";
  return "chat/completions";
}

export function buildProviderUrl(baseUrl: string, modelId: string): string {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const endpoint = endpointForModel(modelId);
  if (endpoint === "gemini") return `${cleanBase}/models/${modelId}:streamGenerateContent`;
  if (endpoint === "responses") return `${cleanBase}/responses`;
  if (endpoint === "messages") return `${cleanBase}/messages`;
  return `${cleanBase}/chat/completions`;
}

export interface StreamProviderOptions {
  modelId: string;
  baseUrl: string;
  apiKey: string;
  messages: unknown[];
  tools?: unknown[];
  signal?: AbortSignal;
  onTiming?: (timing: ReturnType<LLMStreamTiming["finish"]>) => void;
}

export type ProviderChunk =
  | { type: "token"; content: string }
  | { type: "tool_call"; toolCall: CompleteToolCall };

export async function* streamProvider(
  options: StreamProviderOptions,
): AsyncGenerator<ProviderChunk, void, unknown> {
  const { modelId, baseUrl, apiKey, messages, tools, signal, onTiming } = options;
  const url = buildProviderUrl(baseUrl, modelId);
  const timing = new LLMStreamTiming();
  const assembler = new BlockAssembler();

  timing.start();

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        tools: tools && tools.length > 0 ? tools : undefined,
        stream: true,
      }),
      signal,
    });
  } catch (err: any) {
    if (signal?.aborted) return;
    throw new ProviderApiError({
      status: 0,
      code: "NETWORK_ERROR",
      message: err.message || "Failed to reach provider endpoint",
      retryable: true,
    });
  }

  if (!response.ok || !response.body) {
    let errorBody = "";
    try {
      errorBody = await response.text();
    } catch {
      // ignore
    }

    const retryable = response.status === 429 || response.status >= 500;
    let message = errorBody;
    let code = `HTTP_${response.status}`;

    try {
      const parsed = JSON.parse(errorBody);
      if (parsed.error) {
        message = parsed.error.message || message;
        code = parsed.error.code || code;
      }
    } catch {
      // ignore parse errors for plain text error responses
    }

    throw new ProviderApiError({
      status: response.status,
      code,
      message,
      retryable,
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) {
        try {
          await reader.cancel("Aborted by signal");
        } catch {
          // ignore
        }
        break;
      }

      let readResult: ReadableStreamReadResult<Uint8Array>;
      try {
        readResult = await reader.read();
      } catch (err: any) {
        if (signal?.aborted || err?.name === "AbortError") {
          break;
        }
        throw err;
      }

      const { done, value } = readResult;
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      // Keep the last partial line in buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;

        if (trimmed.startsWith("data:")) {
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === "[DONE]") {
            if (onTiming) onTiming(timing.finish());
            return;
          }

          try {
            const json = JSON.parse(dataStr);

            // 1. Text token extraction
            const token =
              json.choices?.[0]?.delta?.content ??
              json.content ??
              json.delta?.text ??
              json.candidates?.[0]?.content?.parts?.[0]?.text;

            if (token) {
              timing.recordToken();
              yield { type: "token", content: token };
            }

            // 2. Tool call delta extraction
            const toolCallDeltas = json.choices?.[0]?.delta?.tool_calls ?? json.tool_calls;
            if (Array.isArray(toolCallDeltas)) {
              for (const delta of toolCallDeltas) {
                const completeCall = assembler.appendDelta(delta.id || `call-${delta.index ?? 0}`, {
                  name: delta.function?.name,
                  argsDelta: delta.function?.arguments,
                });
                if (completeCall) {
                  yield { type: "tool_call", toolCall: completeCall };
                }
              }
            }
          } catch {
            // ignore malformed SSE line
          }
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
    if (onTiming) onTiming(timing.finish());
  }
}
