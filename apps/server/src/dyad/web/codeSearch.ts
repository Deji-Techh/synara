// FILE: codeSearch.ts
// Purpose: Workspace code search (keyword + symbol lookup + explorer digest)
// without any engine index. Donor: code_search / explore_code /
// lsp_symbol_lookup (always-consent, readOnly). The engine code index is
// replaced by local scoring: filename weight + term frequency + symbol
// definitions. A provider-backed explorer synthesis can inject via
// setExplorerRunner (M3); unwired, explore_code returns a structured digest
// of the top files (never fake analysis).

import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { defineTool, type ToolDef } from "../../harness/tools/defineTool.ts";
import { safeJoinAppPath } from "../editing/safePath.ts";

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json",
  ".css", ".scss", ".html", ".vue", ".svelte", ".astro",
  ".dart", ".py", ".go", ".rs", ".rb", ".php", ".java", ".kt", ".swift",
]);
const SKIP_DIRS = new Set(["node_modules", ".git", ".hg", "dist", "build", ".next", "out", ".dart_tool", "Pods", ".caide"]);

function tokenizeQuery(query: string): string[] {
  return query
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((t) => t.length > 1);
}

export interface CodeHit {
  path: string;
  score: number;
  snippet: string;
}

async function walkCodeFiles(root: string, out: string[], budget = 2000): Promise<void> {
  const entries = await fs.promises.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (out.length >= budget) return;
    if (entry.name.startsWith(".") && entry.name !== ".env") {
      if (SKIP_DIRS.has(entry.name)) continue;
    }
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await walkCodeFiles(full, out, budget);
    } else if (entry.isFile() && CODE_EXTENSIONS.has(path.extname(entry.name))) {
      try {
        if ((await fs.promises.stat(full)).size <= 500_000) out.push(full);
      } catch {
        // unreadable — skip
      }
    }
  }
}

/** Local scorer: filename hits weigh 3x, content frequency adds up. */
export async function searchWorkspace(
  appPath: string,
  query: string,
  limit = 8,
): Promise<CodeHit[]> {
  const root = safeJoinAppPath(appPath, ".");
  const files: string[] = [];
  await walkCodeFiles(root, files);
  const terms = tokenizeQuery(query);
  if (terms.length === 0) return [];
  const hits: CodeHit[] = [];
  for (const file of files) {
    let text: string;
    try {
      text = await fs.promises.readFile(file, "utf8");
    } catch {
      continue;
    }
    const lower = text.toLowerCase();
    const base = path.basename(file).toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (base.includes(term)) score += 3;
      let idx = lower.indexOf(term);
      let count = 0;
      while (idx !== -1 && count < 20) {
        count++;
        score += 1;
        idx = lower.indexOf(term, idx + term.length);
      }
    }
    if (score === 0) continue;
    const firstTerm = terms.find((t) => lower.includes(t)) ?? terms[0];
    const at = lower.indexOf(firstTerm);
    const start = Math.max(0, at - 120);
    const snippet = text.slice(start, start + 320).replace(/\s+/g, " ").trim();
    hits.push({ path: path.relative(root, file), score, snippet });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

const codeSearchSchema = z.object({
  query: z.string().describe("Keywords, symbol, or feature to find (e.g. 'auth context', 'submit handler')"),
  limit: z.number().int().min(1).max(20).default(8).describe("Max files to return"),
});

export const codeSearchTool = defineTool({
  name: "code_search",
  description:
    "Search the workspace for files matching keywords or symbols. Returns ranked paths with snippets. Use before reading when you don't know where something lives.",
  schema: codeSearchSchema,
  readOnly: true,
  modifiesState: false,
  execute: async (args, ctx) => {
    const parsed = codeSearchSchema.parse(args);
    const hits = await searchWorkspace(ctx.appPath, parsed.query, parsed.limit);
    if (hits.length === 0) return `No files matched "${parsed.query}". Try different keywords or grep.`;
    return [
      `Top ${hits.length} file(s) for "${parsed.query}":`,
      "",
      ...hits.map((h, i) => `${i + 1}. ${h.path} (score ${h.score})\n   ${h.snippet.slice(0, 240)}`),
    ].join("\n");
  },
  presentCall: (args: any) => `Code search: ${args.query}`,
});

// --- symbol lookup (grep-based definitions; full LSP lands in M4) ---

export interface SymbolHit {
  path: string;
  line: number;
  name: string;
  kind: string;
}

export async function lookupSymbol(appPath: string, symbol: string, limit = 10): Promise<SymbolHit[]> {
  const root = safeJoinAppPath(appPath, ".");
  const files: string[] = [];
  await walkCodeFiles(root, files);
  const { buildWorkspaceIndex, queryIndex } = await import("./symbolIndex.ts");
  buildWorkspaceIndex(root, files);
  const hits = queryIndex(root, symbol, limit);
  if (hits.length > 0) {
    return hits.map((h) => ({ path: h.path, line: h.line, name: h.name, kind: h.kind }));
  }
  return [];
}

const lspSchema = z.object({
  symbol: z.string().describe("Symbol name to locate (class, function, variable)"),
  limit: z.number().int().min(1).max(20).default(10),
});

export const lspSymbolLookupTool = defineTool({
  name: "lsp_symbol_lookup",
  description:
    "Find where a symbol (class, function, variable) is defined or referenced. Served from a workspace symbol index (mtime-invalidated): definitions first, then cross-file references. Token-efficient: file paths with line numbers.",
  schema: lspSchema,
  readOnly: true,
  modifiesState: false,
  execute: async (args, ctx) => {
    const parsed = lspSchema.parse(args);
    const hits = await lookupSymbol(ctx.appPath, parsed.symbol, parsed.limit);
    if (hits.length === 0) return `Symbol "${parsed.symbol}" not found. Try code_search for related terms.`;
    return [`Symbol "${parsed.symbol}":`, "", ...hits.map((h) => `- ${h.path}:${h.line} (${h.kind} ${h.name})`)].join("\n");
  },
  presentCall: (args: any) => `Locate symbol: ${args.symbol}`,
});

// --- explore_code (provider synthesis when wired, digest fallback) ---

export type ExplorerRunner = (input: { system: string; prompt: string }) => Promise<string>;
let explorerRunner: ExplorerRunner | null = null;
/** M3 wires the provider-backed explorer synthesis here. */
export function setExplorerRunner(fn: ExplorerRunner | null): void {
  explorerRunner = fn;
}

const exploreSchema = z.object({
  intent: z.enum(["explain", "locate", "edit", "debug"]).describe("explain: how it works; locate: where it lives; edit/debug: exact ranges to change"),
  target: z.string().describe("Feature, flow, or symbol to explore (e.g. 'how login works')"),
});

export const exploreCodeTool = defineTool({
  name: "explore_code",
  description:
    "Explore the codebase for a feature or flow. For 'explain/locate' questions use this first instead of warming up with list_files/grep/read_file. Returns a codebase map: the key files, their roles, and exact ranges for edit/debug intents.",
  schema: exploreSchema,
  readOnly: true,
  modifiesState: false,
  execute: async (args, ctx) => executeExploreCode(exploreSchema.parse(args), ctx.appPath),
  presentCall: (args: any) => `Explore: ${args.target}`,
});

export async function executeExploreCode(
  input: z.infer<typeof exploreSchema>,
  appPath: string,
): Promise<string> {
  const parsed = exploreSchema.parse(input);
  const hits = await searchWorkspace(appPath, parsed.target, 6);
  if (hits.length === 0) {
    return `No code found for "${parsed.target}". Try different terms.`;
  }
  const digest = [
    `Codebase map for "${parsed.target}" (intent: ${parsed.intent}):`,
    "",
    ...hits.map((h, i) => `${i + 1}. ${h.path} — ${h.snippet.slice(0, 200)}`),
  ].join("\n");
  if (!explorerRunner) {
    return `${digest}\n\n(Explorer synthesis not wired yet (M3) — digest above is the map; read the listed files for exact ranges.)`;
  }
  const text = await explorerRunner({
    system: "You are a code reconnaissance assistant. Turn the file digest into a precise codebase map with roles and exact ranges.",
    prompt: `${digest}\n\nIntent: ${parsed.intent}. Target: ${parsed.target}`,
  });
  return text;
}

export const ALL_CODE_TOOLS: ToolDef[] = [codeSearchTool, lspSymbolLookupTool, exploreCodeTool];
