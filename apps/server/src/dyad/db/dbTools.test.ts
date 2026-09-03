// FILE: dbTools.test.ts
// Purpose: M4 gate — SQL safety, connection resolution, fake-driver
// execution, schema inspection, integration linking, nitro ordering.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  linkDatabase,
  unlinkDatabase,
  resolveDatabaseUrl,
  DbNotConnectedError,
} from "./connections.ts";
import {
  ALL_DB_TOOLS,
  executeAddIntegration,
  executeEnableNitro,
  executeSql,
  executeTableSchema,
  setDbDriver,
  setIntegrationTransport,
  sqlConsentInfo,
} from "./dbTools.ts";
import { checkSqlDanger, classifySql, splitStatements } from "./sqlSafety.ts";
import { resolveUserInput } from "../plan/userPrompt.ts";

function appDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "caide-db-"));
}

describe("dyad db tools transplant (m4)", () => {
  it("registers all six DB tools with donor previews", () => {
    expect(ALL_DB_TOOLS.map((t) => t.name)).toEqual([
      "execute_sql",
      "get_database_table_schema",
      "get_supabase_project_info",
      "get_neon_project_info",
      "add_integration",
      "enable_nitro",
    ]);
  });

  it("classifies SQL for consent: schema vs data vs danger", () => {
    expect(sqlConsentInfo("select * from todos")).toEqual({ mutatesSchema: false, deletesData: false });
    expect(sqlConsentInfo("create table t (id int)").mutatesSchema).toBe(true);
    expect(sqlConsentInfo("delete from todos").deletesData).toBe(true);
    expect(checkSqlDanger("drop table users").severity).toBe("critical");
    expect(checkSqlDanger("select 1").isDangerous).toBe(false);
    // Comment-embedded danger words don't trigger.
    expect(checkSqlDanger("select 1 -- drop table x").isDangerous).toBe(false);
    expect(splitStatements("select 1; select 2")).toHaveLength(2);
    expect(classifySql("insert into t values (1)").deletesData).toBe(false);
  });

  it("resolves connections: link → .env.local → env → guidance error", () => {
    const dir = appDir();
    const sid = `s-${Date.now()}`;
    expect(() => resolveDatabaseUrl(dir, sid)).toThrow(DbNotConnectedError);
    fs.writeFileSync(path.join(dir, ".env.local"), 'DATABASE_URL="postgres://env-file/db"\n');
    expect(resolveDatabaseUrl(dir, sid)).toMatchObject({ source: ".env.local" });
    linkDatabase(sid, { provider: "supabase", databaseUrl: "postgres://link/db" });
    try {
      const resolved = resolveDatabaseUrl(dir, sid);
      expect(resolved.source).toBe("session-link");
      expect(resolved.link?.provider).toBe("supabase");
    } finally {
      unlinkDatabase(sid);
    }
  });

  it("executes single statements via the injected driver, refusing danger + batches", async () => {
    setDbDriver({
      async query() {
        return { rows: [{ count: 2 }] };
      },
    });
    try {
      const dir = appDir();
      const sid = `s-${Date.now()}`;
      linkDatabase(sid, { provider: "neon", databaseUrl: "postgres://x/db" });
      try {
        const out = await executeSql({ query: "select count(*) from todos" }, dir, sid);
        expect(out).toContain('"count": 2');
        await expect(executeSql({ query: "select 1; select 2" }, dir, sid)).rejects.toThrow(
          /separately/,
        );
        await expect(executeSql({ query: "drop table users" }, dir, sid)).rejects.toThrow(
          /Refusing dangerous SQL \(critical\)/,
        );
        const schema = await executeTableSchema({}, dir, sid);
        expect(schema).toContain("count");
      } finally {
        unlinkDatabase(sid);
      }
    } finally {
      setDbDriver(null);
    }
  });

  it("links providers through the integration round-trip, or guides unwired", async () => {
    const sid = `s-${Date.now()}`;
    const unguided = await executeAddIntegration({}, sid);
    expect(unguided).toMatch(/ask the user/);

    const events: unknown[] = [];
    setIntegrationTransport({
      sendIntegrationPrompt: (s, requestId, provider) => events.push({ s, requestId, provider }),
    });
    try {
      const pending = executeAddIntegration({}, sid);
      await new Promise((r) => setTimeout(r, 5));
      const sent = events[0] as any;
      resolveUserInput(sent.requestId, { provider: "neon", databaseUrl: "postgres://n/db" });
      await expect(pending).resolves.toMatch(/neon integration/);

      const again = await executeAddIntegration({ provider: "supabase" }, sid);
      expect(again).toMatch(/already linked/);
    } finally {
      setIntegrationTransport(null);
      unlinkDatabase(sid);
    }
  });

  it("enforces nitro ordering: integration first, supabase exempt", async () => {
    const dir = appDir();
    const sid = `s-${Date.now()}`;
    await expect(executeEnableNitro({ reason: "need API" }, dir, sid)).resolves.toMatch(
      /add_integration/,
    );
    linkDatabase(sid, { provider: "supabase", databaseUrl: "postgres://x" });
    try {
      await expect(executeEnableNitro({ reason: "need API" }, dir, sid)).resolves.toMatch(
        /Edge Functions/,
      );
    } finally {
      unlinkDatabase(sid);
    }
    linkDatabase(sid, { provider: "neon", databaseUrl: "postgres://x" });
    try {
      await expect(executeEnableNitro({ reason: "need API" }, dir, sid)).resolves.toMatch(
        /provision-backend/,
      );
    } finally {
      unlinkDatabase(sid);
    }
  });
});
