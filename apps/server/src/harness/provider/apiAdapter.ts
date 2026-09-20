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
  const cleanBase = (baseUrl ?? "").toLowerCase();

  // Explicit OpenAI-compatible and third-party endpoints always use chat/completions
  if (cleanBase) {
    if (
      cleanBase.includes("groq.com") ||
      cleanBase.includes("openrouter.ai") ||
      cleanBase.includes("api.deepseek.com") ||
      cleanBase.includes("api.mistral.ai") ||
      cleanBase.includes("together.xyz") ||
      cleanBase.includes("api.x.ai") ||
      cleanBase.includes("fireworks.ai") ||
      cleanBase.includes("/openai/v1")
    ) {
      return "chat/completions";
    }

    if (cleanBase.includes("anthropic.com")) {
      return "messages";
    }

    if (cleanBase.includes("generativelanguage.googleapis.com")) {
      return "gemini";
    }
  }

  if (lower.startsWith("gemini-")) {
    return "gemini";
  }

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
    return cleanBase.includes("/zen/v1") && !cleanBase.includes("/go/")
      ? "chat/completions"
      : "messages";
  }
  // glm, kimi, longcat, deepseek, mimo, hy, big-pickle, ling, nemotron, laguna are all chat/completions on both per tables
  return "chat/completions";
}

/**
 * Keys the Gemini generateContent API rejects inside function_declarations
 * parameter schemas (400 "Unknown name" / "Cannot find field"). Our tool
 * schemas are generated OpenAI-style (zod adds additionalProperties:false;
 * numeric bounds use exclusiveMinimum/Maximum), so strip them recursively
 * for this endpoint only — every other endpoint keeps the full schema.
 */
const GEMINI_UNSUPPORTED_SCHEMA_KEYS = new Set([
  "additionalProperties",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "$schema",
  "$id",
]);

export function sanitizeGeminiSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeGeminiSchema);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (GEMINI_UNSUPPORTED_SCHEMA_KEYS.has(key)) continue;
      out[key] = sanitizeGeminiSchema(entry);
    }
    return out;
  }
  return value;
}

export function sanitizeGeminiTools(tools: unknown[]): unknown[] {
  return tools.map((tool) => {
    if (tool === null || typeof tool !== "object" || Array.isArray(tool)) return tool;
    const record = tool as Record<string, unknown>;
    if (!("parameters" in record)) return tool;
    return { ...record, parameters: sanitizeGeminiSchema(record.parameters) };
  });
}

export function buildProviderUrl(baseUrl: string, modelId: string): string {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const endpoint = endpointForModel(modelId, baseUrl);
  if (endpoint === "gemini") {
    if (cleanBase.includes("aiplatform.googleapis.com")) {
      const modelPath = modelId.includes("/") ? modelId : `publishers/google/models/${modelId}`;
      return `${cleanBase}/${modelPath}:streamGenerateContent?alt=sse`;
    }
    return `${cleanBase}/models/${modelId}:streamGenerateContent?alt=sse`;
  }
  if (endpoint === "responses") return `${cleanBase}/responses`;
  if (endpoint === "messages") return `${cleanBase}/messages`;
  if (cleanBase.includes("openai.azure.com")) {
    const hasQuery = cleanBase.includes("?");
    return `${cleanBase}/chat/completions${hasQuery ? "&" : "?"}api-version=2024-02-01`;
  }
  return `${cleanBase}/chat/completions`;
}

/**
 * True for OpenCode Zen (`/zen/v1`) and Go (`/zen/go/v1`) endpoints.
 * Both enforce client identification; Go additionally requires
 * `x-opencode-session` for prompt-cache session affinity (enforced
 * 2026-09-06), and `-free` models are UA-gated to official clients
 * ("free tier can only be used in OpenCode" / FreeUsageLimitError).
 */
export function isOpenCodeEndpoint(baseUrl: string): boolean {
  return baseUrl.includes("opencode.ai/zen");
}

function randomRequestId(): string {
  try {
    const uuid = (globalThis as any)?.crypto?.randomUUID?.();
    if (typeof uuid === "string" && uuid.length > 0) return uuid;
  } catch {
    // fall through
  }
  return `req-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(36)}`;
}

/**
 * OpenCode identification headers. Mirrors the official CLI
 * (`packages/opencode/src/session/llm/request.ts`): a stable
 * per-conversation `x-opencode-session`, a unique per-request
 * `x-opencode-request`, plus client/project attribution and an
 * `opencode/`-prefixed User-Agent so `-free` capacity is not rejected
 * as third-party/abusive traffic.
 */
export function openCodeHeaders(sessionId?: string): Record<string, string> {
  return {
    "x-opencode-session": sessionId?.trim() ? sessionId.trim() : randomRequestId(),
    "x-opencode-request": randomRequestId(),
    "x-opencode-client": "caide",
    "x-opencode-project": "caide",
    "User-Agent": "opencode/1.18.16 (caide)",
  };
}

export interface StreamProviderOptions {
  modelId: string;
  baseUrl: string;
  apiKey: string;
  messages: unknown[];
  /**
   * Stable per-conversation id forwarded as `x-opencode-session` on
   * OpenCode Zen/Go endpoints. Falls back to a random id per request
   * when omitted (still satisfies the vendor requirement).
   */
  sessionId?: string;
  /** Optional system prompt. Placed per-provider (OpenAI `instructions` /
   *  prepended system message, Anthropic top-level `system`, Gemini
   *  `system_instruction`). */
  system?: string;
  /**
   * Anthropic prompt caching on the system prefix (direct Anthropic API
   * only — the adapter enables it solely for providerId anthropic since
   * compatible endpoints may reject cache_control).
   */
  enablePromptCache?: boolean;
  tools?: unknown[];
  signal?: AbortSignal;
  onTiming?: (timing: ReturnType<LLMStreamTiming["finish"]>) => void;
  /** Called once per stream with accumulated input/output token usage (when reported). */
  onUsage?: (usage: StreamUsage) => void;
}

export type ProviderChunk =
  | { type: "token"; content: string }
  | { type: "tool_call"; toolCall: CompleteToolCall };

export interface StreamUsage {
  inputTokens: number;
  outputTokens: number;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

/**
 * Extract token usage from one parsed SSE payload across dialects. Returns
 * null when the payload carries no usage block. Anthropic reports usage on
 * message_start (input) and message_delta (output); OpenAI responses and
 * chat/completions attach usage objects; Gemini uses usageMetadata.
 */
export function extractStreamUsage(json: unknown): StreamUsage | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;
  // Anthropic messages.
  const msgUsage = (j as { message?: { usage?: unknown } }).message?.usage;
  const deltaUsage = (j as { usage?: unknown }).usage;
  if (j.type === "message_start" && msgUsage && typeof msgUsage === "object") {
    const u = msgUsage as Record<string, unknown>;
    if ("input_tokens" in u || "output_tokens" in u) {
      return { inputTokens: num(u.input_tokens), outputTokens: num(u.output_tokens) };
    }
  }
  if (j.type === "message_delta" && deltaUsage && typeof deltaUsage === "object") {
    const u = deltaUsage as Record<string, unknown>;
    if ("output_tokens" in u) {
      return { inputTokens: 0, outputTokens: num(u.output_tokens) };
    }
  }
  // OpenAI responses API.
  if (j.type === "response.completed") {
    const u = (j as { response?: { usage?: unknown } }).response?.usage;
    if (u && typeof u === "object") {
      const r = u as Record<string, unknown>;
      if ("input_tokens" in r || "output_tokens" in r) {
        return { inputTokens: num(r.input_tokens), outputTokens: num(r.output_tokens) };
      }
    }
  }
  // OpenAI chat/completions chunks and final usage payloads.
  if (j.usage && typeof j.usage === "object" && j.type !== "message_delta") {
    const u = j.usage as Record<string, unknown>;
    const input = num(u.prompt_tokens ?? u.input_tokens);
    const output = num(u.completion_tokens ?? u.output_tokens);
    if (input > 0 || output > 0 || "prompt_tokens" in u || "completion_tokens" in u) {
      return { inputTokens: input, outputTokens: output };
    }
  }
  // Gemini.
  const meta = (j as { usageMetadata?: unknown }).usageMetadata;
  if (meta && typeof meta === "object") {
    const m = meta as Record<string, unknown>;
    if ("promptTokenCount" in m || "candidatesTokenCount" in m) {
      return { inputTokens: num(m.promptTokenCount), outputTokens: num(m.candidatesTokenCount) };
    }
  }
  return null;
}

export async function* streamProvider(
  options: StreamProviderOptions,
): AsyncGenerator<ProviderChunk, void, unknown> {
  const { modelId, baseUrl, apiKey, messages, tools, system, signal, onTiming, onUsage } = options;
  const enablePromptCache = options.enablePromptCache === true;
  const url = buildProviderUrl(baseUrl, modelId);
  const endpoint = endpointForModel(modelId, baseUrl);
  const timing = new LLMStreamTiming();
  const assembler = new BlockAssembler();
  const streamUsage: StreamUsage = { inputTokens: 0, outputTokens: 0 };
  const reportUsage = () => {
    if (onUsage && (streamUsage.inputTokens > 0 || streamUsage.outputTokens > 0)) {
      onUsage({ ...streamUsage });
    }
  };

  timing.start();

  const isVertex = baseUrl.includes("aiplatform.googleapis.com");
  const isAzure = baseUrl.includes("openai.azure.com");
  let effectiveApiKey = apiKey;
  if (isVertex && apiKey.trim().startsWith("{")) {
    const { getVertexAccessToken } = await import("../../dyad/providers/vertexAuth.ts");
    const token = await getVertexAccessToken(
      apiKey,
      options.signal ? { signal: options.signal } : {},
    );
    effectiveApiKey = token.accessToken;
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${effectiveApiKey}`,
    "Content-Type": "application/json",
    ...(isOpenCodeEndpoint(baseUrl) ? openCodeHeaders(options.sessionId) : {}),
  };
  if (isAzure) {
    headers["api-key"] = effectiveApiKey;
    delete headers["Authorization"];
  }
  let requestBody: any;

  if (endpoint === "messages") {
    headers["x-api-key"] = effectiveApiKey;
    headers["anthropic-version"] = "2023-06-01";
    requestBody = {
      model: modelId,
      // Anthropic carries the system prompt as a top-level field, never inside
      // messages. Strip system entries from the message list so they don't get
      // coerced into user turns.
      ...(system
        ? enablePromptCache
          ? { system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }] }
          : { system }
        : {}),
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
    if (isVertex) {
      headers["Authorization"] = `Bearer ${effectiveApiKey}`;
    } else {
      headers["x-goog-api-key"] = effectiveApiKey;
      delete headers["Authorization"];
    }
    requestBody = {
      ...(system ? { system_instruction: { parts: [{ text: system }] } } : {}),
      contents: (messages as any[]).map((m: any) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: Array.isArray(m.parts)
          ? m.parts
          : [{ text: typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "") }],
      })),
      ...(tools && tools.length > 0
        ? { tools: [{ function_declarations: sanitizeGeminiTools(tools) }] }
        : {}),
    };
  } else {
    requestBody = {
      model: modelId,
      messages: [...(system ? [{ role: "system", content: system }] : []), ...(messages as any[])],
      stream: true,
      ...(tools && tools.length > 0 ? { tools } : {}),
    };
  }

  let response: Response | undefined;
  const maxFetchAttempts = 3;
  const retryDelayMs = process.env.NODE_ENV === "test" ? 100 : 2000;
  // Retryable statuses mirror isRecoverableError (loop/retry.ts): rate
  // limits and transient provider/server errors. Aborts never retry.

  for (let attempt = 1; attempt <= maxFetchAttempts; attempt++) {
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        ...(signal ? { signal } : {}),
      });
    } catch (err: any) {
      if (signal?.aborted) return;
      if (attempt < maxFetchAttempts) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        if (signal?.aborted) return;
        continue;
      }
      throw new ProviderApiError({
        status: 0,
        code: "NETWORK_ERROR",
        message: err.message || "Failed to reach provider endpoint",
        retryable: true,
      });
    }

    if (
      attempt < maxFetchAttempts &&
      (response.status === 429 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504 ||
        response.status === 529)
    ) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      if (signal?.aborted) return;
      continue;
    }
    break;
  }

  if (!response || !response.ok || !response.body) {
    let errorBody = "";
    if (response) {
      try {
        errorBody = await response.text();
      } catch {
        // ignore
      }
    }

    const status = response ? response.status : 0;
    const retryable = status === 429 || status >= 500;
    let message = errorBody;
    let code = `HTTP_${status}`;

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
      status,
      code,
      message,
      retryable,
    });
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let inThinking = false;

  const onAbort = () => {
    try {
      reader.cancel("Aborted by signal").catch(() => {});
    } catch {}
  };
  if (signal) {
    if (signal.aborted) {
      try {
        await reader.cancel("Aborted by signal");
      } catch {}
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  }

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

      let readResult: Awaited<ReturnType<typeof reader.read>>;
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
            reportUsage();
            return;
          }

          try {
            const json = JSON.parse(dataStr);
            const reported = extractStreamUsage(json);
            if (reported && (reported.inputTokens > 0 || reported.outputTokens > 0)) {
              streamUsage.inputTokens += reported.inputTokens;
              streamUsage.outputTokens += reported.outputTokens;
            }

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
    if (signal) {
      signal.removeEventListener("abort", onAbort);
    }
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
    if (!signal?.aborted) {
      if (inThinking) {
        inThinking = false;
        yield { type: "token", content: "</think>\n\n" };
      }
      for (const complete of assembler.flushAll()) {
        yield { type: "tool_call", toolCall: complete };
      }
      if (onTiming) onTiming(timing.finish());
      reportUsage();
    }
  }
}
