import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

// Dyad-transplant MCP registry: servers the agent connects to (stdio/SSE)
// plus per-tool consent overrides. Secrets live in the secret store / env,
// never in these tables — only names, transports, endpoints, and consent.
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    CREATE TABLE IF NOT EXISTS mcp_servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      transport TEXT NOT NULL DEFAULT 'stdio',
      command TEXT,
      args_json TEXT NOT NULL DEFAULT '[]',
      env_json TEXT NOT NULL DEFAULT '{}',
      url TEXT,
      headers_json TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      default_consent TEXT NOT NULL DEFAULT 'ask',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;
  yield* sql`
    CREATE TABLE IF NOT EXISTS mcp_tool_consents (
      server_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      consent TEXT NOT NULL DEFAULT 'ask',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (server_id, tool_name)
    )
  `;
});
