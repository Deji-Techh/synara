// FILE: testConnection.ts
// Purpose: Live key checks per provider. Inference probes (a tiny real
// completion) where V1 probed (deepseek, opencode-zen, google, openrouter —
// donor provider_api_key_validation_service semantics: catches keys that
// list models fine but fail inference); list-models probes where the API
// shape is stable; honest "saved, live check unavailable" elsewhere.
// Powers the settings Test button and the connection status dot.

import { ProviderApiError, streamProvider } from "../../harness/provider/apiAdapter.ts";
import { OPENCODE_ZEN_FREE_MODEL_IDS } from "@caide/shared/languageModelCatalog";
import { PROVIDERS } from "./providers.ts";

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}

const TIMEOUT_MS = 15_000;

/** Donor validation prompt: tiny, deterministic, cheap on any model. */
const VALIDATION_PROMPT = "What number is after four? Reply with only the number.";
const VALIDATION_TIMEOUT_MS = 20_000;

/** Per-provider probe model (cheap, stable ids — donor choices kept). */
const INFERENCE_PROBE_MODELS: Record<string, { model: string; baseUrl: string }> = {
  deepseek: { model: "deepseek-chat", baseUrl: "https://api.deepseek.com" },
  opencodeZen: { model: OPENCODE_ZEN_FREE_MODEL_IDS[0], baseUrl: "https://opencode.ai/zen/v1" },
  "opencode-zen": { model: OPENCODE_ZEN_FREE_MODEL_IDS[0], baseUrl: "https://opencode.ai/zen/v1" },
  google: { model: "gemini-flash-latest", baseUrl: "https://generativelanguage.googleapis.com" },
  openrouter: { model: "openrouter/free", baseUrl: "https://openrouter.ai/api/v1" },
};

function displayNameOf(providerId: string): string {
  return PROVIDERS[providerId]?.displayName ?? providerId;
}

function errorMessageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}

function errorStatusOf(error: unknown, depth = 0): number | undefined {
  if (depth > 5 || typeof error !== "object" || error === null) return undefined;
  if (error instanceof ProviderApiError && Number.isFinite(error.details.status)) {
    return error.details.status;
  }
  const candidate = error as {
    statusCode?: unknown;
    status?: unknown;
    response?: { status?: unknown };
    cause?: unknown;
  };
  const status = candidate.statusCode ?? candidate.status ?? candidate.response?.status;
  if (typeof status === "number") return status;
  const fromMessage = /^\s*([45]\d{2})\b/.exec(errorMessageOf(error));
  if (fromMessage) return Number(fromMessage[1]);
  return errorStatusOf(candidate.cause, depth + 1);
}

function isAuthFailure(message: string): boolean {
  return /api key|unauthorized|unauthenticated|invalid.?key|permission denied|forbidden/i.test(
    message,
  );
}

function isRateLimited(message: string): boolean {
  return /rate.?limit|too many requests/i.test(message);
}

/**
 * Donor inference probe: run one tiny real completion through the same
 * streaming path turns use. Success (any token, or clean completion) proves
 * the key works for inference — strictly stronger than list-models.
 * Classification mirrors the donor (auth → keep-anyway, 429 → retry-later).
 */
async function runInferenceProbe(input: {
  providerId: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  signal?: AbortSignal;
}): Promise<ConnectionTestResult> {
  const display = displayNameOf(input.providerId);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);
  const onCallerAbort = () => controller.abort();
  input.signal?.addEventListener("abort", onCallerAbort, { once: true });
  try {
    let sawToken = false;
    for await (const chunk of streamProvider({
      modelId: input.model,
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      messages: [{ role: "user", content: VALIDATION_PROMPT }],
      signal: controller.signal,
    })) {
      if (chunk.type === "token" && chunk.content) {
        sawToken = true;
        break;
      }
    }
    if (!sawToken && controller.signal.aborted && !input.signal?.aborted) {
      return {
        ok: false,
        message: `${display} did not respond while checking this API key. Please try again.`,
      };
    }
    if (input.signal?.aborted) {
      return { ok: false, message: "Key check cancelled." };
    }
    return { ok: true, message: `Connected — ${display} answered a live prompt.` };
  } catch (error) {
    const message = errorMessageOf(error);
    const status = errorStatusOf(error);
    if (status === 401 || status === 403 || isAuthFailure(message)) {
      return {
        ok: false,
        message: `${display} rejected this API key. Try another API key or keep this one anyway.`,
      };
    }
    if (status === 429 || isRateLimited(message)) {
      return {
        ok: false,
        message: `${display} rate limited the API key check. You can try again later or keep this key anyway.`,
      };
    }
    return {
      ok: false,
      message: `Could not verify this ${display} API key: ${message || "Unknown error"}`,
    };
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", onCallerAbort);
    controller.abort();
  }
}

async function get(
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<{ status: number; json: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      // non-JSON error bodies
    }
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

function modelNames(data: unknown): string[] {
  const list = (data as { data?: Array<{ id?: string }> })?.data;
  if (Array.isArray(list)) return list.map((m) => m.id ?? "").filter(Boolean);
  return [];
}

export async function testProviderConnection(input: {
  providerId: string;
  apiKey?: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<ConnectionTestResult> {
  const { providerId, signal } = input;
  const key = input.apiKey?.trim() ?? "";
  const base = (input.baseUrl?.trim() || "").replace(/\/+$/, "");

  switch (providerId) {
    case "ollama":
    case "lmstudio": {
      const fallback = providerId === "ollama" ? "http://localhost:11434" : "http://localhost:1234";
      const probe = providerId === "ollama" ? `${base || fallback}/api/tags` : `${base || fallback}/v1/models`;
      try {
        const { status } = await get(probe, {}, signal);
        return status === 200
          ? { ok: true, message: `Connected — ${providerId} is reachable.` }
          : { ok: false, message: `${providerId} answered HTTP ${status}. Is it running?` };
      } catch {
        return { ok: false, message: `${providerId} is unreachable. Start it and retry.` };
      }
    }
    case "openai":
    case "xai":
    case "opencodeGo":
    case "opencode-go": {
      if (!key) return { ok: false, message: "API key is required." };
      const defaults: Record<string, string> = {
        openai: "https://api.openai.com/v1",
        xai: "https://api.x.ai/v1",
        opencodeGo: "https://opencode.ai/zen/go/v1",
        "opencode-go": "https://opencode.ai/zen/go/v1",
      };
      const { status, json } = await get(`${base || defaults[providerId]}/models`, { authorization: `Bearer ${key}` }, signal);
      if (status === 200) {
        const names = modelNames(json);
        return { ok: true, message: `Connected — ${names.length} model(s) listed.` };
      }
      if (status === 401 || status === 403) return { ok: false, message: "Key rejected (401/403). Check the key." };
      return { ok: false, message: `HTTP ${status}. Check the base URL.` };
    }
    case "deepseek":
    case "opencodeZen":
    case "opencode-zen":
    case "google":
    case "openrouter": {
      // Donor inference probe (provider_api_key_validation_service): a tiny
      // real completion catches keys that list models fine but fail
      // inference. Custom base URLs ride along when provided.
      if (!key) return { ok: false, message: "API key is required." };
      const probe =
        INFERENCE_PROBE_MODELS[providerId] ?? INFERENCE_PROBE_MODELS[providerId.replace(/-/g, "")];
      if (!probe) return { ok: false, message: "No validation probe for this provider." };
      return runInferenceProbe({
        providerId,
        model: probe.model,
        baseUrl: base || probe.baseUrl,
        apiKey: key,
        ...(signal ? { signal } : {}),
      });
    }
    case "anthropic": {
      if (!key) return { ok: false, message: "API key is required." };
      const { status } = await get(`${base || "https://api.anthropic.com"}/v1/models`, {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      }, signal);
      if (status === 200) return { ok: true, message: "Connected — Anthropic answered." };
      if (status === 401 || status === 403) return { ok: false, message: "Key rejected (401/403). Check the key." };
      return { ok: false, message: `HTTP ${status}. Check the base URL.` };
    }
    case "google": {
      if (!key) return { ok: false, message: "API key is required." };
      const root = base || "https://generativelanguage.googleapis.com";
      const { status } = await get(`${root}/v1beta/models?key=${encodeURIComponent(key)}`, {}, signal);
      if (status === 200) return { ok: true, message: "Connected — Google answered." };
      if (status === 400 || status === 403) return { ok: false, message: "Key rejected. Check the key." };
      return { ok: false, message: `HTTP ${status}. Check the base URL.` };
    }
    case "chatgpt": {
      // Account OAuth (009 M4): no key to check — probe the session with an
      // authenticated models listing (real Codex call, same as discovery).
      const { readChatGPTSession, listChatGPTModels } = await import("./chatgptAuth.ts");
      if (!readChatGPTSession()) {
        return { ok: false, message: "Connect a ChatGPT account in Settings before using this model." };
      }
      try {
        const models = await listChatGPTModels();
        return { ok: true, message: `Connected — ${models.length} ChatGPT model(s) available.` };
      } catch (error) {
        return {
          ok: false,
          message: `ChatGPT session failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
    case "custom": {
      // Ad-hoc single endpoint: probe the listing when a base URL is
      // provided, otherwise the honest saved-only message (keys stay
      // optional here, as before).
      if (!base) {
        return { ok: true, message: "Key saved — no live check for this provider yet." };
      }
      try {
        const headers: Record<string, string> = {};
        if (key) headers.authorization = `Bearer ${key}`;
        const { status, json } = await get(`${base}/models`, headers, signal);
        if (status === 200) {
          const names = modelNames(json);
          return { ok: true, message: `Connected — ${names.length} model(s) listed.` };
        }
        if (status === 401 || status === 403) {
          return { ok: false, message: "Key rejected (401/403). Check the key." };
        }
        return { ok: false, message: `HTTP ${status}. Check the base URL.` };
      } catch {
        return { ok: false, message: "Custom provider is unreachable. Check the base URL." };
      }
    }
    case "azure":
    case "minimax":
    case "vertex":
    case "bedrock":
    case "auto":
    default:
      if ((providerId === "azure" || providerId === "minimax") && !key) {
        return { ok: false, message: "API key is required." };
      }
      // Stored `custom::*` providers probe their OpenAI-compatible
      // `/models` listing (009 M5) — real check, no model id needed.
      if (providerId.startsWith("custom::")) {
        const { resolveProviderDef } = await import("./customProviders.ts");
        const def = resolveProviderDef(providerId);
        const probeBase = (base || def?.baseUrl || "").replace(/\/+$/, "");
        if (!probeBase) {
          return { ok: false, message: "Custom provider needs an API Base URL." };
        }
        try {
          const headers: Record<string, string> = {};
          if (key) headers.authorization = `Bearer ${key}`;
          const { status, json } = await get(`${probeBase}/models`, headers, signal);
          if (status === 200) {
            const names = modelNames(json);
            return { ok: true, message: `Connected — ${names.length} model(s) listed.` };
          }
          if (status === 401 || status === 403) {
            return { ok: false, message: "Key rejected (401/403). Check the key." };
          }
          return { ok: false, message: `HTTP ${status}. Check the base URL.` };
        } catch {
          return { ok: false, message: "Custom provider is unreachable. Check the base URL." };
        }
      }
      return { ok: true, message: "Key saved — no live check for this provider yet." };
  }
}
