// FILE: keyedSearch.ts
// Purpose: Keyed web-search providers (Tavily preferred, Brave fallback).
// Plain fetch against stable public shapes; selected by env presence in
// turnContext (no settings UI needed — keys never leave the server env).

import type { SearchHit, WebSearchProvider } from "./webSearch.ts";

const TIMEOUT_MS = 15_000;

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

/** Tavily Search API: POST /search {api_key, query, max_results}. */
export function tavilyProvider(apiKey: string): WebSearchProvider {
  return async (query, signal) => {
    const data = (await postJson(
      "https://api.tavily.com/search",
      {},
      { api_key: apiKey, query, max_results: 8, include_answer: false },
    )) as { results?: Array<{ title?: string; url?: string; content?: string }> };
    void signal;
    return (data.results ?? [])
      .filter((r) => r.url && r.title)
      .slice(0, 8)
      .map((r) => ({ title: r.title!, url: r.url!, snippet: (r.content ?? "").slice(0, 300) }));
  };
}

/** Brave Search API: GET /res/v1/web/search with X-Subscription-Token. */
export function braveProvider(apiKey: string): WebSearchProvider {
  return async (query, signal) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const res = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8`,
        { signal: controller.signal, headers: { "X-Subscription-Token": apiKey } },
      );
      if (!res.ok) throw new Error(`Brave HTTP ${res.status}`);
      const data = (await res.json()) as {
        web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
      };
      return (data.web?.results ?? [])
        .filter((r) => r.url && r.title)
        .slice(0, 8)
        .map((r) => ({ title: r.title!, url: r.url!, snippet: (r.description ?? "").slice(0, 300) }));
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  };
}

/** Tavily > Brave > keyless DDG. Null when no key is configured. */
export function autoWebSearchProvider(): WebSearchProvider | null {
  const tavily = process.env.TAVILY_API_KEY?.trim();
  if (tavily) return tavilyProvider(tavily);
  const brave = process.env.BRAVE_API_KEY?.trim();
  if (brave) return braveProvider(brave);
  return null;
}
