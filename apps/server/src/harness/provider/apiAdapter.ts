/**
 * ApiAdapter — per-model routing responses|chat/completions|messages.
 * Steal dyad get_model_client + 004 provider docs.
 * go models → responses, minimax/qwen/claude → messages, else chat/completions.
 */
export type ApiEndpoint = "responses" | "chat/completions" | "messages" | "gemini";

const RESPONSES_MODELS = new Set(["grok", "gpt", "muse-spark", "o1", "o3"]);
const MESSAGES_MODELS = new Set(["minimax", "qwen", "claude"]);
const GEMINI_MODELS = new Set(["gemini"]);

export function endpointForModel(modelId: string): ApiEndpoint {
  const lower = modelId.toLowerCase();
  if (Array.from(GEMINI_MODELS).some((m) => lower.includes(m))) return "gemini";
  if (Array.from(RESPONSES_MODELS).some((m) => lower.includes(m))) return "responses";
  if (Array.from(MESSAGES_MODELS).some((m) => lower.includes(m))) return "messages";
  return "chat/completions";
}

export function buildProviderUrl(baseUrl: string, modelId: string): string {
  const endpoint = endpointForModel(modelId);
  if (endpoint === "gemini") return `${baseUrl}/models/${modelId}:streamGenerateContent`;
  if (endpoint === "responses") return `${baseUrl}/responses`;
  if (endpoint === "messages") return `${baseUrl}/messages`;
  return `${baseUrl}/chat/completions`;
}

export async function* streamProvider(
  modelId: string,
  baseUrl: string,
  apiKey: string,
  messages: unknown[],
  signal: AbortSignal,
): AsyncGenerator<string> {
  const url = buildProviderUrl(baseUrl, modelId);
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: modelId, messages, stream: true }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`provider ${modelId} failed ${res.status} at ${url}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n")) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (data === "[DONE]") return;
        try {
          const json = JSON.parse(data);
          const token = json.choices?.[0]?.delta?.content ?? json.content ?? "";
          if (token) yield token;
        } catch {
          // ignore parse errors for SSE comments
        }
      }
    }
  }
}
