// FILE: localModels.ts
// Purpose: Live local-model inventory (009 M6). Donor: dyad x caide
// local_model_ollama_handler.ts (parseOllamaHost, /api/tags shape, display
// prettify, error wording) + local_model_lmstudio_handler.ts (/api/v0/models,
// llm-only filter) + lm_studio_utils.ts (base URL). One deliberate
// improvement: a 10s timeout on both fetches — the donor fetched without a
// signal, hanging the settings UI while a dead host black-holed.

export interface LocalModel {
  modelName: string;
  displayName: string;
  provider: "ollama" | "lmstudio";
}

const FETCH_TIMEOUT_MS = 10_000;

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
  }
  return response.json();
}

export function parseOllamaHost(host?: string): string {
  if (!host) {
    return "http://localhost:11434";
  }

  // If it already has a protocol, use as-is
  if (host.startsWith("http://") || host.startsWith("https://")) {
    return host;
  }

  // Check for bracketed IPv6 with port: [::1]:8080
  if (host.startsWith("[") && host.includes("]:")) {
    return `http://${host}`;
  }

  // Check for regular host:port (but not plain IPv6)
  if (host.includes(":") && !host.includes("::") && host.split(":").length === 2) {
    return `http://${host}`;
  }

  // Check if it's a plain IPv6 address (contains :: or multiple colons)
  if (host.includes("::") || host.split(":").length > 2) {
    return `http://[${host}]:11434`;
  }

  // If it's just a hostname, add default port
  return `http://${host}:11434`;
}

/** Donor OLLAMA_HOST first, OLLAMA_BASE_URL alias accepted (009 M2). */
export function getOllamaApiUrl(): string {
  return parseOllamaHost(process.env.OLLAMA_HOST || process.env.OLLAMA_BASE_URL);
}

export function getLmStudioBaseUrl(): string {
  return process.env.LM_STUDIO_BASE_URL_FOR_TESTING || "http://localhost:1234";
}

function prettifyOllamaName(name: string): string {
  return name
    .split(":")[0]
    .replace(/-/g, " ")
    .replace(/(\d+)/, " $1 ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
    .trim();
}

export async function fetchOllamaModels(host?: string): Promise<{ models: LocalModel[] }> {
  const base = host ?? getOllamaApiUrl();
  let data: unknown;
  try {
    data = await fetchJson(`${base.replace(/\/+$/, "")}/api/tags`);
  } catch (error) {
    if (error instanceof TypeError && (error as Error).message.includes("fetch failed")) {
      throw new Error(`Could not connect to Ollama. Make sure it's running at ${base}`);
    }
    throw error instanceof Error ? error : new Error("Failed to fetch models from Ollama");
  }
  const raw = (data as { models?: Array<{ name?: string }> })?.models ?? [];
  return {
    models: raw
      .filter((m) => typeof m?.name === "string" && m.name.length > 0)
      .map((m) => ({
        modelName: m.name as string,
        displayName: prettifyOllamaName(m.name as string),
        provider: "ollama" as const,
      })),
  };
}

export async function fetchLMStudioModels(base?: string): Promise<{ models: LocalModel[] }> {
  const root = (base ?? getLmStudioBaseUrl()).replace(/\/+$/, "");
  let data: unknown;
  try {
    data = await fetchJson(`${root}/api/v0/models`);
  } catch (error) {
    throw error instanceof Error ? error : new Error("Failed to fetch models from LM Studio");
  }
  const downloaded = (data as { data?: unknown }).data;
  if (!Array.isArray(downloaded)) return { models: [] };
  return {
    models: downloaded
      .filter((m) => m && typeof m === "object" && (m as { type?: string }).type === "llm")
      .map((m) => {
        const id = String((m as { id?: string }).id ?? "");
        return { modelName: id, displayName: id, provider: "lmstudio" as const };
      })
      .filter((m) => m.modelName.length > 0),
  };
}
