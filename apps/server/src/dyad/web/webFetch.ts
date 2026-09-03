// FILE: webFetch.ts
// Purpose: Direct web fetch + readability extraction (no engine proxy).
// Donor: web_fetch tool (always-consent, readOnly). Free-entirely: plain
// fetch with timeout/size caps; HTML stripped to text locally.

import { z } from "zod";
import { defineTool, type ToolDef } from "../../harness/tools/defineTool.ts";

export const WEB_FETCH_TIMEOUT_MS = 15_000;
export const WEB_FETCH_MAX_BYTES = 2 * 1024 * 1024;

export class WebFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebFetchError";
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** Minimal readability: drop scripts/styles/nav, keep headings/paragraphs/links. */
export function htmlToText(html: string): { title: string; text: string } {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
  let body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  body = decodeEntities(body).replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
  return { title: decodeEntities(title), text: body };
}

export interface FetchedPage {
  url: string;
  status: number;
  contentType: string;
  title: string;
  text: string;
  truncated: boolean;
}

export async function fetchPage(url: string, signal?: AbortSignal): Promise<FetchedPage> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new WebFetchError(`Invalid URL: ${url}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new WebFetchError(`Only http(s) URLs can be fetched: ${url}`);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEB_FETCH_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "CaideAgent/1.0 (+local preview verification)" },
      redirect: "follow",
    });
    if (!res.ok) {
      throw new WebFetchError(`Fetch failed with status ${res.status} for ${url}`);
    }
    const contentType = res.headers.get("content-type") ?? "";
    const buf = new Uint8Array(await res.arrayBuffer());
    const truncated = buf.length > WEB_FETCH_MAX_BYTES;
    const raw = new TextDecoder().decode(buf.slice(0, WEB_FETCH_MAX_BYTES));
    if (/html/i.test(contentType) || /^\s*</.test(raw)) {
      const { title, text } = htmlToText(raw);
      return { url, status: res.status, contentType, title, text: text.slice(0, 60_000), truncated };
    }
    return { url, status: res.status, contentType, title: "", text: raw.slice(0, 60_000), truncated };
  } catch (err) {
    if (err instanceof WebFetchError) throw err;
    throw new WebFetchError(
      `Fetch failed for ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

const webFetchSchema = z.object({
  url: z.string().describe("The http(s) URL to fetch and extract readable text from"),
});

export const webFetchTool = defineTool({
  name: "web_fetch",
  description:
    "Fetch a web page and extract its readable text (scripts, styles, nav stripped). Use for docs, changelogs, and API references the user points at.",
  schema: webFetchSchema,
  readOnly: true,
  modifiesState: false,
  execute: async (args, ctx) => {
    const parsed = webFetchSchema.parse(args);
    const page = await fetchPage(parsed.url, ctx.signal);
    const head = [`# ${page.title || parsed.url}`, `(${page.status}${page.truncated ? ", truncated" : ""})`, ""].join("\n");
    return `${head}${page.text}`;
  },
  presentCall: (args: any) => `Fetch ${args.url}`,
});

export const ALL_WEB_FETCH_TOOLS: ToolDef[] = [webFetchTool];
