// FILE: testConnection.ts
// Purpose: Live key checks per provider (list-models probes where the API
// shape is stable; honest "saved, live check unavailable" elsewhere).
// Powers the settings Test button and the connection status dot.

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}

const TIMEOUT_MS = 15_000;

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
    case "deepseek":
    case "openrouter":
    case "opencode-zen": {
      if (!key) return { ok: false, message: "API key is required." };
      const defaults: Record<string, string> = {
        openai: "https://api.openai.com/v1",
        xai: "https://api.x.ai/v1",
        deepseek: "https://api.deepseek.com",
        openrouter: "https://openrouter.ai/api/v1",
        "opencode-zen": "https://opencode.ai/zen/v1",
      };
      const { status, json } = await get(`${base || defaults[providerId]}/models`, { authorization: `Bearer ${key}` }, signal);
      if (status === 200) {
        const names = modelNames(json);
        return { ok: true, message: `Connected — ${names.length} model(s) listed.` };
      }
      if (status === 401 || status === 403) return { ok: false, message: "Key rejected (401/403). Check the key." };
      return { ok: false, message: `HTTP ${status}. Check the base URL.` };
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
    case "azure":
    case "minimax":
    case "vertex":
    case "bedrock":
    case "custom":
    case "auto":
    default: {
      if ((providerId === "azure" || providerId === "minimax" || providerId === "custom") && !key && providerId !== "custom") {
        return { ok: false, message: "API key is required." };
      }
      return { ok: true, message: "Key saved — no live check for this provider yet." };
    }
  }
}
