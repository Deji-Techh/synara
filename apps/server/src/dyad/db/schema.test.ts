// FILE: schema.test.ts
// Purpose: DDL idempotency + OAuth-ready columns on :memory:.

import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { ensureDyadSchema } from "./schema.ts";

describe("dyad server schema", () => {
  it("creates MCP tables idempotently with OAuth-ready columns", () => {
    const db = new DatabaseSync(":memory:");
    try {
      expect(ensureDyadSchema(db)).toEqual(["mcp_servers", "mcp_tool_consents"]);
      // Rerun is a no-op (IF NOT EXISTS everywhere).
      expect(ensureDyadSchema(db)).toEqual(["mcp_servers", "mcp_tool_consents"]);
      const cols = db.prepare("PRAGMA table_info(mcp_servers)").all() as Array<{ name: string }>;
      const names = cols.map((c) => c.name);
      for (const col of ["id", "name", "transport", "oauth_state", "default_consent", "enabled"]) {
        expect(names).toContain(col);
      }
      // Consent upsert works on the composite key.
      db.prepare(
        "INSERT INTO mcp_tool_consents (server_id, tool_name, consent) VALUES ('s', 't', 'always')",
      ).run();
      db.prepare(
        "INSERT INTO mcp_tool_consents (server_id, tool_name, consent) VALUES ('s', 't', 'never') ON CONFLICT(server_id, tool_name) DO UPDATE SET consent=excluded.consent",
      ).run();
      const row = db
        .prepare("SELECT consent FROM mcp_tool_consents WHERE server_id = 's' AND tool_name = 't'")
        .get() as { consent: string };
      expect(row.consent).toBe("never");
    } finally {
      db.close();
    }
  });
});
