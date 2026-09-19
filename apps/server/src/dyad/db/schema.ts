// FILE: schema.ts
// Purpose: Server-side Dyad transplant tables (node:sqlite DDL, idempotent).
// Covers the MCP server/consent state the manager will persist (OAuth-ready
// columns reserved now so the M4b OAuth flow needs no migration) — donor
// db/schema.ts table subset; app/chats/messages history stays in session
// JSONL, versions stay in git + .caide/versions.jsonl.
// Donor: dyad src/db/schema.ts (mcpServers/mcpToolConsents shapes).

import { DatabaseSync } from "node:sqlite";
import * as os from "node:os";
import * as path from "node:path";

export const MCP_SERVERS_DDL = `
CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  transport TEXT NOT NULL DEFAULT 'stdio',
  command TEXT,
  args TEXT,
  url TEXT,
  headers TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  default_consent TEXT NOT NULL DEFAULT 'ask',
  oauth_state TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_enabled ON mcp_servers (enabled);
`.trim();

export const MCP_TOOL_CONSENTS_DDL = `
CREATE TABLE IF NOT EXISTS mcp_tool_consents (
  server_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  consent TEXT NOT NULL DEFAULT 'ask',
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  PRIMARY KEY (server_id, tool_name)
);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_consents_server ON mcp_tool_consents (server_id);
`.trim();

export function defaultDyadDbPath(): string {
  const home = process.env.CAIDE_HOME?.trim() || path.join(os.homedir(), ".caide");
  return path.join(home, "dyad.db");
}

/** Apply all transplant DDL idempotently. Returns the table names present. */
export function ensureDyadSchema(db: DatabaseSync): string[] {
  db.exec(MCP_SERVERS_DDL);
  db.exec(MCP_TOOL_CONSENTS_DDL);
  const rows = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'mcp\\_%' ESCAPE '\\'",
    )
    .all() as Array<{ name: string }>;
  return rows.map((r) => r.name).sort();
}

/** Open (creating) the server DB file. Caller owns close. */
export function openDyadDb(filePath: string = defaultDyadDbPath()): DatabaseSync {
  return new DatabaseSync(filePath);
}
