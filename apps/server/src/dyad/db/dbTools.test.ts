// FILE: dbTools.test.ts
// Purpose: M4 gate — SQL safety, connection resolution, fake-driver
// execution, schema inspection, integration linking, nitro ordering.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  linkDatabase,
  unlinkDatabase,
  getDatabaseLink,
  resolveDatabaseUrl,
  DbNotConnectedError,
} from "./connections.ts";
import {
  ALL_DB_TOOLS,
  createNeonProjectTool,
  executeAddIntegration,
  executeEnableNitro,
  executeSql,
  executeTableSchema,
  setDbDriver,
  setIntegrationTransport,
  sqlConsentInfo,
  writeEnvLocalDatabaseUrl,
} from "./dbTools.ts";
import { checkSqlDanger, classifySql, splitStatements } from "./sqlSafety.ts";
import { resolveUserInput } from "../plan/userPrompt.ts";

function appDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "caide-db-"));
}

describe("dyad db tools transplant (m4)", () => {
  it("registers all twelve DB tools with donor previews", () => {
    expect(ALL_DB_TOOLS.map((t) => t.name)).toEqual([
      "execute_sql",
      "get_database_table_schema",
      "get_supabase_project_info",
      "get_neon_project_info",
      "create_supabase_project",
      "deploy_supabase_functions",
      "supabase_test_user",
      "create_neon_project",
      "create_neon_branch",
      "neon_test_branch",
      "add_integration",
      "enable_nitro",
    ]);
  });

  it("classifies SQL for consent: schema vs data vs danger", () => {
    expect(sqlConsentInfo("select * from todos")).toEqual({
      mutatesSchema: false,
      deletesData: false,
    });
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

  it("one-click wiring links project ids without copy-paste (phase 3)", async () => {
    const sid = `s-provision-${Date.now()}`;
    const dir = appDir();
    linkDatabase(sid, { provider: "neon", managementToken: "good" });
    const stub = vi.fn(async (url: unknown) => {
      const u = String(url);
      if (u.endsWith("/projects")) {
        return {
          ok: true,
          json: async () => ({
            project: { id: "p9", name: "Shop" },
            connection_uris: [{ connection_uri: "postgresql://u:p@host/db" }],
          }),
        } as Response;
      }
      if (u.includes("/branches")) {
        return {
          ok: true,
          json: async () => ({ branch: { id: "b1", name: "development" } }),
        } as Response;
      }
      throw new Error(`unexpected ${u}`);
    });
    vi.stubGlobal("fetch", stub);
    try {
      const ctx = { signal: AbortSignal.timeout(5000), appPath: dir, sessionId: sid, toolId: "t1" };
      const out = (await createNeonProjectTool.execute({ name: "Shop" }, ctx)) as string;
      expect(out).toContain("linked");
      // URI never reaches chat — it is written to .env.local and verified.
      expect(out).not.toContain("postgresql://u:p@host/db");
      expect(out).toContain("saved to .env.local");
      const envLocal = fs.readFileSync(path.join(dir, ".env.local"), "utf8");
      expect(envLocal).toContain('DATABASE_URL="postgresql://u:p@host/db"');
      expect(getDatabaseLink(sid)?.projectId).toBe("p9");
      const disk = JSON.parse(fs.readFileSync(path.join(dir, ".caide", "db-link.json"), "utf8"));
      expect(disk.projectId).toBe("p9");
      expect(JSON.stringify(disk)).not.toContain("good");
    } finally {
      vi.unstubAllGlobals();
      unlinkDatabase(sid);
    }
  });

  it("writeEnvLocalDatabaseUrl appends, replaces, and verifies", () => {
    const dir = appDir();
    expect(writeEnvLocalDatabaseUrl(dir, "postgres://a")).toBe(true);
    expect(fs.readFileSync(path.join(dir, ".env.local"), "utf8")).toBe(
      'DATABASE_URL="postgres://a"\n',
    );
    expect(writeEnvLocalDatabaseUrl(dir, "postgres://b")).toBe(true);
    const text = fs.readFileSync(path.join(dir, ".env.local"), "utf8");
    expect(text).toBe('DATABASE_URL="postgres://b"\n');
    expect(text.match(/DATABASE_URL/g)).toHaveLength(1);
    // Other vars preserved.
    fs.writeFileSync(path.join(dir, ".env.local"), 'OTHER="x"\nDATABASE_URL="postgres://b"\n');
    expect(writeEnvLocalDatabaseUrl(dir, "postgres://c")).toBe(true);
    expect(fs.readFileSync(path.join(dir, ".env.local"), "utf8")).toContain('OTHER="x"');
  });
});
