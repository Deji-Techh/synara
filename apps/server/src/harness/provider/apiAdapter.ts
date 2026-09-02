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
  if (lower.startsWith("gemini-")) return "gemini";
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
  if (lower.startsWith("minimax") && baseUrl && baseUrl.includes("/go/")) {
    return "messages";
  }
  return "chat/completions";
}

export function buildProviderUrl(baseUrl: string, modelId: string): string {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const endpoint = endpointForModel(modelId, baseUrl);
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
      messages: (messages as any[]).map((m: any) => ({
        role: m.role === "assistant" ? "assistant" : m.role === "system" ? "user" : "user",
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? ""),
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
    requestBody = {
      ...(system
        ? { system_instruction: { parts: [{ text: system }] } }
        : {}),
      contents: (messages as any[]).map((m: any) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "") }],
      })),
    };
  } else {
    requestBody = {
      model: modelId,
      messages: [
        ...(system ? [{ role: "system", content: system }] : []),
        ...(messages as any[]),
      ],
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

            // 1. Text token extraction across OpenAI, Anthropic, Responses, and Gemini schemas
            let token: string | undefined;
            if (typeof json.choices?.[0]?.delta?.content === "string") {
              token = json.choices[0].delta.content;
            } else if (typeof json.delta?.text === "string") {
              token = json.delta.text;
            } else if (typeof json.delta === "string") {
              token = json.delta;
            } else if (typeof json.text === "string") {
              token = json.text;
            } else if (typeof json.content === "string") {
              token = json.content;
            } else if (typeof json.candidates?.[0]?.content?.parts?.[0]?.text === "string") {
              token = json.candidates[0].content.parts[0].text;
            } else if (typeof json.response?.output_item?.content === "string") {
              token = json.response.output_item.content;
            }

            if (token) {
              timing.recordToken();
              yield { type: "token", content: token };
            }

            // 2. Tool call delta extraction (chat/completions dialect)
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

            // 2b. Tool call extraction (OpenAI Responses dialect): output items
            // stream as response.output_item.added / function_call_arguments.delta /
            // function_call_arguments.done / output_item.done events. The
            // consistent key across all of them is the item `id` (`fc_...`),
            // NOT `call_id` — using call_id drops the argument deltas.
            const respEvent = json.type as string | undefined;
            if (respEvent === "response.output_item.added" && json.item?.type === "function_call") {
              assembler.appendDelta(json.item.id, {
                name: json.item.name,
                argsDelta: typeof json.item.arguments === "string" ? json.item.arguments : "",
              });
            } else if (
              respEvent === "response.function_call_arguments.delta" &&
              typeof json.delta === "string"
            ) {
              assembler.appendDelta(json.item_id, { argsDelta: json.delta });
            } else if (
              respEvent === "response.function_call_arguments.done" &&
              typeof json.arguments === "string"
            ) {
              const complete = assembler.finalize(json.item_id);
              if (complete) yield { type: "tool_call", toolCall: complete };
            } else if (respEvent === "response.output_item.done" && json.item?.type === "function_call") {
              const complete = assembler.finalize(json.item.id);
              if (complete) yield { type: "tool_call", toolCall: complete };
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
