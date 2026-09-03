// FILE: webSearch.ts
// Purpose: Web search + crawl on direct providers (no engine proxy).
// Donor: web_search (ask) / web_crawl (ask) descriptions kept; the Pro
// engine backend is replaced by an injected WebSearchProvider. Default is a
// keyless DuckDuckGo client (free, no account); settings can inject
// Brave/Tavily-style providers in M3. Crawl reuses the webFetch extractor.

import { z } from "zod";
import { defineTool, type ToolDef } from "../../harness/tools/defineTool.ts";
import { fetchPage } from "./webFetch.ts";

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

export type WebSearchProvider = (query: string, signal?: AbortSignal) => Promise<SearchHit[]>;

let provider: WebSearchProvider | null = null;
/** M3 injects keyed providers (Brave/Tavily) from settings here. */
export function setWebSearchProvider(fn: WebSearchProvider | null): void {
  provider = fn;
}

/** Keyless DuckDuckGo Instant Answer fallback (free, no account). */
export async function duckDuckGoSearch(query: string, signal?: AbortSignal): Promise<SearchHit[]> {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const res = await fetch(url, { signal, headers: { "user-agent": "CaideAgent/1.0" } });
  if (!res.ok) throw new Error(`DuckDuckGo search failed with status ${res.status}`);
  const data = (await res.json()) as {
    AbstractText?: string;
    AbstractURL?: string;
    Heading?: string;
    RelatedTopics?: Array<{ Text?: string; FirstURL?: string; Name?: string; Topics?: Array<{ Text?: string; FirstURL?: string }> }>;
  };
  const hits: SearchHit[] = [];
  if (data.AbstractText && data.AbstractURL) {
    hits.push({ title: data.Heading || data.AbstractText.slice(0, 80), url: data.AbstractURL, snippet: data.AbstractText });
  }
  for (const topic of data.RelatedTopics ?? []) {
    if (topic.Topics) {
      for (const sub of topic.Topics) {
        if (sub.Text && sub.FirstURL) hits.push({ title: sub.Text.slice(0, 80), url: sub.FirstURL, snippet: sub.Text });
      }
    } else if (topic.Text && topic.FirstURL) {
      hits.push({ title: topic.Text.slice(0, 80), url: topic.FirstURL, snippet: topic.Text });
    }
    if (hits.length >= 8) break;
  }
  return hits.slice(0, 8);
}

export async function executeWebSearch(query: string, signal?: AbortSignal): Promise<string> {
  const run = provider ?? duckDuckGoSearch;
  const hits = await run(query, signal);
  if (hits.length === 0) {
    return `No results for "${query}". Try different keywords.`;
  }
  return [
    `Top ${hits.length} result(s) for "${query}":`,
    "",
    ...hits.map((h, i) => `${i + 1}. ${h.title}\n   ${h.url}\n   ${h.snippet.slice(0, 300)}`),
  ].join("\n");
}

const webSearchSchema = z.object({
  query: z.string().describe("Search keywords (e.g. 'expo router modal docs')"),
});

export const webSearchTool = defineTool({
  name: "web_search",
  description:
    "Search the web for documentation, changelogs, and API references. Use when you need current facts beyond your training (SDK versions, breaking changes, new APIs).",
  schema: webSearchSchema,
  readOnly: true,
  modifiesState: false,
  execute: async (args, ctx) => executeWebSearch(webSearchSchema.parse(args).query, ctx.signal),
  presentCall: (args: any) => `Web search: ${args.query}`,
});

const webCrawlSchema = z.object({
  url: z.string().describe("Page URL to crawl and extract full readable text from"),
});

export const webCrawlTool = defineTool({
  name: "web_crawl",
  description:
    "Crawl a page (or search-result URL) and extract its full readable text for deep reading. Prefer web_fetch for single known pages; use this after web_search to read a result in full.",
  schema: webCrawlSchema,
  readOnly: true,
  modifiesState: false,
  execute: async (args, ctx) => {
    const parsed = webCrawlSchema.parse(args);
    const page = await fetchPage(parsed.url, ctx.signal);
    return [`# ${page.title || parsed.url}`, "", page.text].join("\n");
  },
  presentCall: (args: any) => `Crawl ${args.url}`,
});

export const ALL_WEB_SEARCH_TOOLS: ToolDef[] = [webSearchTool, webCrawlTool];
