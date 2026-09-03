// FILE: symbolIndex.ts
// Purpose: Persistent-feeling language index: per-workspace symbol table
// (definitions + reference lines) with mtime invalidation. Reads are served
// from the table; any stale file triggers a rebuild. Same output shape as
// the old grep pass, so callers are unchanged.

import * as fs from "node:fs";
import * as path from "node:path";

export interface IndexedSymbol {
  name: string;
  path: string;
  line: number;
  kind: "definition" | "reference";
}

interface WorkspaceIndex {
  builtAt: number;
  files: Map<string, number>;
  symbols: IndexedSymbol[];
}

const indexes = new Map<string, WorkspaceIndex>();

const DEFINITION_PATTERNS: RegExp[] = [
  /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/,
  /^\s*export\s+(?:default\s+)?(?:class|interface|enum|type)\s+([A-Za-z_$][\w$]*)/,
  /^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\(|async|[^;]*=>)/,
  /^\s*(?:class|mixin|extension|enum)\s+([A-Za-z_$][\w$]*)/,
  /^\s*(?:[\w<>?]+\s+)+([a-zA-Z_$][\w$]*)\s*\(/,
  /^\s*(?:def|class)\s+([A-Za-z_][\w]*)/,
];

export function clearSymbolIndexes(): void {
  indexes.clear();
}

function indexDefinitions(root: string, file: string): { mtime: number; symbols: IndexedSymbol[]; lines: string[] } {
  const stat = fs.statSync(file);
  const symbols: IndexedSymbol[] = [];
  let lines: string[] = [];
  try {
    const text = fs.readFileSync(file, "utf8");
    lines = text.split("\n");
  } catch {
    return { mtime: stat.mtimeMs, symbols, lines };
  }
  const rel = path.relative(root, file);
  lines.forEach((line, i) => {
    for (const re of DEFINITION_PATTERNS) {
      const m = re.exec(line);
      if (m?.[1]) {
        symbols.push({ name: m[1], path: rel, line: i + 1, kind: "definition" });
        break;
      }
    }
  });
  return { mtime: stat.mtimeMs, symbols, lines };
}

/** Build (or rebuild when stale) the index for a workspace root. */
export function buildWorkspaceIndex(
  root: string,
  files: string[],
): { rebuilt: boolean; symbols: number } {
  const prev = indexes.get(root);
  let stale = !prev || prev.files.size !== files.length;
  const fileMtimes = new Map<string, number>();
  if (!stale && prev) {
    for (const file of files) {
      try {
        const mtime = fs.statSync(file).mtimeMs;
        fileMtimes.set(file, mtime);
        if (prev.files.get(file) !== mtime) {
          stale = true;
          break;
        }
      } catch {
        stale = true;
        break;
      }
    }
  }
  if (!stale && prev) return { rebuilt: false, symbols: prev.symbols.length };
  // Pass 1: definitions everywhere (global name table for cross-file refs).
  const perFile: Array<{ file: string; mtime: number; symbols: IndexedSymbol[]; lines: string[] }> = [];
  const names = new Map<string, string>();
  const mtimes = new Map<string, number>();
  for (const file of files) {
    try {
      const entry = indexDefinitions(root, file);
      mtimes.set(file, entry.mtime);
      perFile.push({ file, ...entry });
      for (const s of entry.symbols) {
        if (!names.has(s.name.toLowerCase())) names.set(s.name.toLowerCase(), s.name);
      }
    } catch {
      // unreadable — skip
    }
  }
  // Pass 2: references (any line mentioning a workspace symbol, outside its def line).
  const defLines = new Set(perFile.flatMap((f) => f.symbols.map((s) => `${s.path}:${s.line}`)));
  const symbols: IndexedSymbol[] = perFile.flatMap((f) => f.symbols);
  for (const f of perFile) {
    const rel = path.relative(root, f.file);
    f.lines.forEach((line, i) => {
      if (symbols.length > 8000) return;
      if (defLines.has(`${rel}:${i + 1}`)) return;
      const lower = line.toLowerCase();
      for (const [folded, original] of names) {
        if (lower.includes(folded)) {
          symbols.push({ name: original, path: rel, line: i + 1, kind: "reference" });
          break;
        }
      }
    });
  }
  indexes.set(root, { builtAt: Date.now(), files: mtimes, symbols });
  return { rebuilt: true, symbols: symbols.length };
}

/** Query the index: exact-name definitions first, then references. */
export function queryIndex(root: string, symbol: string, limit: number): IndexedSymbol[] {
  const entry = indexes.get(root);
  if (!entry) return [];
  const needle = symbol.toLowerCase();
  const defs = entry.symbols.filter((s) => s.kind === "definition" && s.name.toLowerCase() === needle);
  const refs = entry.symbols.filter((s) => s.kind === "reference" && s.name.toLowerCase() === needle);
  return [...defs, ...refs].slice(0, limit);
}

export function indexStats(root: string): { files: number; symbols: number } | undefined {
  const entry = indexes.get(root);
  return entry ? { files: entry.files.size, symbols: entry.symbols.length } : undefined;
}
