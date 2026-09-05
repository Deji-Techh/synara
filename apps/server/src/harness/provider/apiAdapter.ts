import { BlockAssembler, LLMStreamTiming, type CompleteToolCall } from "./stream.ts";

export type ApiEndpoint = "responses" | "chat/completions" | "messages" | "gemini";

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

export function endpointForModel(modelId: string, baseUrl?: string): ApiEndpoint {
  const lower = modelId.toLowerCase();
  if (baseUrl && baseUrl.includes("openrouter.ai")) return "chat/completions";
  if (lower.startsWith("gemini-") || (baseUrl && baseUrl.includes("generativelanguage.googleapis.com"))) return "gemini";
  // Per user-provided endpoint tables (2026-09-02): responses for gpt/grok/muse-spark across both Zen and Go
  if (
    lower.startsWith("gpt-") ||
    lower.startsWith("grok-") ||
    lower.startsWith("muse-spark") ||
    lower.startsWith("o1") ||
    lower.startsWith("o3")
  ) {
    return "responses";
  }
  if (lower.startsWith("claude-") || lower.startsWith("qwen")) {
    return "messages";
  }
  // minimax is /messages on Go (and default), /chat/completions on Zen v1
  if (lower.startsWith("minimax")) {
    return baseUrl && baseUrl.includes("/zen/v1") && !baseUrl.includes("/go/")
      ? "chat/completions"
      : "messages";
  }
  // glm, kimi, longcat, deepseek, mimo, hy, big-pickle, ling, nemotron, laguna are all chat/completions on both per tables
  return "chat/completions";
}

export function buildProviderUrl(baseUrl: string, modelId: string): string {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const endpoint = endpointForModel(modelId, baseUrl);
  if (endpoint === "gemini") return `${cleanBase}/models/${modelId}:streamGenerateContent?alt=sse`;
  if (endpoint === "responses") return `${cleanBase}/responses`;
  if (endpoint === "messages") return `${cleanBase}/messages`;
  return `${cleanBase}/chat/completions`;
}

export interface StreamProviderOptions {
  modelId: string;
  baseUrl: string;
  apiKey: string;
  messages: unknown[];
  /** Optional system prompt. Placed per-provider (OpenAI `instructions` /
   *  prepended system message, Anthropic top-level `system`, Gemini
   *  `system_instruction`). */
  system?: string;
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
  const { modelId, baseUrl, apiKey, messages, tools, system, signal, onTiming } = options;
  const url = buildProviderUrl(baseUrl, modelId);
  const endpoint = endpointForModel(modelId, baseUrl);
  const timing = new LLMStreamTiming();
  const assembler = new BlockAssembler();

  timing.start();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  let requestBody: any;

  if (endpoint === "messages") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
    requestBody = {
      model: modelId,
      // Anthropic carries the system prompt as a top-level field, never inside
      // messages. Strip system entries from the message list so they don't get
      // coerced into user turns.
      ...(system ? { system } : {}),
      messages: (messages as any[])
        .filter((m: any) => m.role !== "system")
        .map((m: any) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: m.content,
        })),
      max_tokens: 4096,
      stream: true,
      ...(tools && tools.length > 0 ? { tools } : {}),
    };
  } else if (endpoint === "responses") {
    requestBody = {
      model: modelId,
      ...(system ? { instructions: system } : {}),
      input: messages,
      stream: true,
      ...(tools && tools.length > 0 ? { tools } : {}),
    };
  } else if (endpoint === "gemini") {
    headers["x-goog-api-key"] = apiKey;
    delete headers["Authorization"];
    requestBody = {
      ...(system ? { system_instruction: { parts: [{ text: system }] } } : {}),
      contents: (messages as any[]).map((m: any) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: Array.isArray(m.parts)
          ? m.parts
          : [{ text: typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "") }],
      })),
      ...(tools && tools.length > 0 ? { tools: [{ function_declarations: tools }] } : {}),
    };
  } else {
    requestBody = {
      model: modelId,
      messages: [...(system ? [{ role: "system", content: system }] : []), ...(messages as any[])],
      stream: true,
      ...(tools && tools.length > 0 ? { tools } : {}),
    };
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
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
  let inThinking = false;

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
            if (inThinking) {
              inThinking = false;
              yield { type: "token", content: "</think>\n\n" };
            }
            for (const complete of assembler.flushAll()) {
              yield { type: "tool_call", toolCall: complete };
            }
            if (onTiming) onTiming(timing.finish());
            return;
          }

          try {
            const json = JSON.parse(dataStr);

            // 0. Reasoning / Thinking token extraction (DeepSeek R1, Kimi, Anthropic thinking)
            let reasoningToken: string | undefined;
            if (typeof json.choices?.[0]?.delta?.reasoning_content === "string") {
              reasoningToken = json.choices[0].delta.reasoning_content;
            } else if (
              json.type === "content_block_delta" &&
              json.delta?.type === "thinking_delta" &&
              typeof json.delta?.thinking === "string"
            ) {
              reasoningToken = json.delta.thinking;
            }

            if (reasoningToken) {
              if (!inThinking) {
                inThinking = true;
                yield { type: "token", content: "<think>" };
              }
              yield { type: "token", content: reasoningToken };
            }

            if (json.type === "content_block_start" && json.content_block?.type === "thinking") {
              if (!inThinking) {
                inThinking = true;
                yield { type: "token", content: "<think>" };
              }
            }

            // 1. Text token extraction across OpenAI, Anthropic, Responses, and Gemini schemas
            let token: string | undefined;
            if (typeof json.choices?.[0]?.delta?.content === "string") {
              token = json.choices[0].delta.content;
            } else if (
              json.type === "content_block_delta" &&
              json.delta?.type === "text_delta" &&
              typeof json.delta?.text === "string"
            ) {
              token = json.delta.text;
            } else if (
              (json.type === "response.output_text.delta" || json.type === "response.text.delta") &&
              typeof json.delta === "string"
            ) {
              token = json.delta;
            } else if (!json.type && typeof json.delta?.text === "string") {
              token = json.delta.text;
            } else if (typeof json.text === "string" && !json.type) {
              token = json.text;
            } else if (typeof json.content === "string" && !json.type) {
              token = json.content;
            } else if (typeof json.candidates?.[0]?.content?.parts?.[0]?.text === "string") {
              token = json.candidates[0].content.parts[0].text;
            }

            if (token) {
              if (inThinking) {
                inThinking = false;
                yield { type: "token", content: "</think>\n\n" };
              }
              timing.recordToken();
              yield { type: "token", content: token };
            }

            // 2a. Tool call delta extraction (chat/completions dialect)
            const toolCallDeltas = json.choices?.[0]?.delta?.tool_calls ?? json.tool_calls;
            if (Array.isArray(toolCallDeltas)) {
              for (const delta of toolCallDeltas) {
                const key = `chat-${delta.index ?? 0}`;
                assembler.appendDelta(key, {
                  id: delta.id,
                  name: delta.function?.name,
                  argsDelta: delta.function?.arguments,
                });
              }
            }
            const finishReason = json.choices?.[0]?.finish_reason;
            if (finishReason === "tool_calls" || finishReason === "function_call") {
              for (const complete of assembler.flushAll()) {
                yield { type: "tool_call", toolCall: complete };
              }
            }
            const fullCalls = json.choices?.[0]?.message?.tool_calls;
            if (Array.isArray(fullCalls)) {
              for (const fc of fullCalls) {
                let parsed: Record<string, unknown> = {};
                try {
                  parsed = JSON.parse(fc.function?.arguments || "{}");
                } catch {
                  parsed = { raw: fc.function?.arguments };
                }
                yield {
                  type: "tool_call",
                  toolCall: {
                    id: fc.id || `call-${Date.now()}`,
                    name: fc.function?.name || "",
                    args: parsed,
                  },
                };
              }
            }

            // 2b. Tool call extraction (OpenAI Responses dialect)
            const respEvent = json.type as string | undefined;
            if (respEvent === "response.output_item.added" && json.item?.type === "function_call") {
              assembler.appendDelta(json.item.id, {
                id: json.item.call_id || json.item.id,
                name: json.item.name,
                argsDelta: typeof json.item.arguments === "string" ? json.item.arguments : "",
              });
            } else if (
              respEvent === "response.function_call_arguments.delta" &&
              typeof json.delta === "string"
            ) {
              assembler.appendDelta(json.item_id, { argsDelta: json.delta });
            } else if (respEvent === "response.function_call_arguments.done") {
              const complete = assembler.finalize(json.item_id);
              if (complete && complete.name) {
                if (typeof json.arguments === "string") {
                  try {
                    complete.args = JSON.parse(json.arguments);
                  } catch {}
                }
                yield { type: "tool_call", toolCall: complete };
              }
            } else if (
              respEvent === "response.output_item.done" &&
              json.item?.type === "function_call"
            ) {
              const complete = assembler.finalize(json.item.id);
              if (complete && complete.name) {
                yield { type: "tool_call", toolCall: complete };
              }
            }

            // 2c. Tool call extraction (Anthropic messages dialect)
            if (json.type === "content_block_start" && json.content_block?.type === "tool_use") {
              assembler.appendDelta(`anthropic-${json.index ?? 0}`, {
                id: json.content_block.id,
                name: json.content_block.name,
                argsDelta: "",
              });
            } else if (
              json.type === "content_block_delta" &&
              json.delta?.type === "input_json_delta" &&
              typeof json.delta?.partial_json === "string"
            ) {
              assembler.appendDelta(`anthropic-${json.index ?? 0}`, {
                argsDelta: json.delta.partial_json,
              });
            } else if (json.type === "content_block_stop") {
              const complete = assembler.finalize(`anthropic-${json.index ?? 0}`);
              if (complete && complete.name) {
                yield { type: "tool_call", toolCall: complete };
              }
            }

            // 2d. Tool call extraction (Gemini dialect)
            const candidates = json.candidates;
            if (Array.isArray(candidates)) {
              for (const candidate of candidates) {
                const parts = candidate.content?.parts;
                if (Array.isArray(parts)) {
                  for (const part of parts) {
                    if (part.functionCall) {
                      yield {
                        type: "tool_call",
                        toolCall: {
                          id: `gemini-${part.functionCall.name}-${Date.now()}`,
                          name: part.functionCall.name,
                          args: part.functionCall.args ?? {},
                        },
                      };
                    }
                  }
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
    if (inThinking) {
      inThinking = false;
      yield { type: "token", content: "</think>\n\n" };
    }
    for (const complete of assembler.flushAll()) {
      yield { type: "tool_call", toolCall: complete };
    }
    if (onTiming) onTiming(timing.finish());
  }
}
