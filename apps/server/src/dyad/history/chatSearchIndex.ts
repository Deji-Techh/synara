// FILE: chatSearchIndex.ts
// Purpose: FTS5 full-text index over session chat lines (node:sqlite,
// no new deps). Warms incrementally: searches index missing sessions on
// first touch, then query the FTS table with bm25 ranking. Falls back to
// direct scoring when sqlite is unavailable. Index dir follows CAIDE_HOME
// like the session logs.

import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { listSessionIds, readSessionLines } from "./chatHistoryFiles.ts";

export interface FtsHit {
  sessionId: string;
  seq: number;
  kind: string;
  score: number;
  excerpt: string;
}

function indexDir(): string {
  const override = process.env.CAIDE_SESSIONS_DIR?.trim();
  if (override) return override;
  const home = process.env.CAIDE_HOME?.trim() || path.join(os.homedir(), ".caide");
  return home;
}

function indexPath(): string {
  return path.join(indexDir(), "chat-search.db");
}

let db: DatabaseSync | null = null;
let dbPath = "";

function openDb(): DatabaseSync | null {
  try {
    const file = indexPath();
    if (db && dbPath === file) return db;
    db?.close();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    db = new DatabaseSync(file);
    dbPath = file;
    db.exec(`
      CREATE TABLE IF NOT EXISTS indexed_sessions (session_id TEXT PRIMARY KEY, indexed_at INTEGER);
      CREATE VIRTUAL TABLE IF NOT EXISTS lines_fts USING fts5(session_id, seq, kind, text, tokenize = 'porter');
    `);
    return db;
  } catch {
    return null;
  }
}

/** Test-only: drop the shared handle (isolated dirs per test). */
export function closeSearchIndex(): void {
  try {
    db?.close();
  } catch {
    // ignore
  }
  db = null;
  dbPath = "";
}

function indexedSessions(database: DatabaseSync): Set<string> {
  try {
    const rows = database.prepare("SELECT session_id FROM indexed_sessions").all() as Array<{
      session_id: string;
    }>;
    return new Set(rows.map((r) => r.session_id));
  } catch {
    return new Set();
  }
}

/** (Re)index one session's lines (delete + insert = idempotent). */
export function indexSessionLines(sessionId: string): number {
  const database = openDb();
  if (!database) return 0;
  const lines = readSessionLines(sessionId);
  try {
    const del = database.prepare("DELETE FROM lines_fts WHERE session_id = ?");
    const delMeta = database.prepare("DELETE FROM indexed_sessions WHERE session_id = ?");
    const ins = database.prepare(
      "INSERT INTO lines_fts (session_id, seq, kind, text) VALUES (?, ?, ?, ?)",
    );
    const mark = database.prepare(
      "INSERT INTO indexed_sessions (session_id, indexed_at) VALUES (?, ?)",
    );
    del.run(sessionId);
    delMeta.run(sessionId);
    for (const line of lines.slice(-2000)) {
      ins.run(sessionId, line.seq, line.kind, line.text.slice(0, 2000));
    }
    mark.run(sessionId, Date.now());
    return lines.length;
  } catch {
    return 0;
  }
}

function ftsQuery(keywords: string[]): string {
  const terms = keywords
    .map((k) => k.toLowerCase().replace(/[^a-z0-9]+/g, "").trim())
    .filter((k) => k.length > 1)
    .slice(0, 10);
  if (terms.length === 0) return "";
  return terms.map((t) => `"${t}"`).join(" OR ");
}

/**
 * Search indexed sessions (indexing any missing ones first). Returns
 * bm25-ranked hits excluding one session id. Empty array when sqlite or
 * the query yields nothing — callers fall back to file scoring.
 */
export function searchIndexedSessions(
  sessionIds: string[],
  keywords: string[],
  excludeSessionId: string,
  limit = 20,
): FtsHit[] {
  const database = openDb();
  if (!database) return [];
  const query = ftsQuery(keywords);
  if (!query) return [];
  try {
    const known = indexedSessions(database);
    for (const id of sessionIds) {
      if (!known.has(id)) indexSessionLines(id);
    }
    const scope = sessionIds.filter((id) => id !== excludeSessionId);
    if (scope.length === 0) return [];
    const placeholders = scope.map(() => "?").join(", ");
    const rows = database
      .prepare(
        `SELECT session_id AS sessionId, seq, kind,
                snippet(lines_fts, 3, '', '', '', 16) AS excerpt,
                bm25(lines_fts) AS rank
         FROM lines_fts
         WHERE lines_fts MATCH ?
           AND session_id IN (${placeholders})
         ORDER BY rank
         LIMIT ?`,
      )
      .all(query, ...scope, limit) as Array<{
      sessionId: string;
      seq: number;
      kind: string;
      excerpt: string;
      rank: number;
    }>;
    return rows.map((r) => ({
      sessionId: r.sessionId,
      seq: Number(r.seq),
      kind: r.kind,
      score: -Number(r.rank),
      excerpt: String(r.excerpt ?? "").slice(0, 600),
    }));
  } catch {
    return [];
  }
}
