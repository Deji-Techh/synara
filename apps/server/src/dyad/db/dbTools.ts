// FILE: dbTools.ts
// Purpose: Database agent tools: execute_sql, schema inspection,
// Supabase/Neon project info, provider linking, server-layer setup.
// Donor: dyad x caide tools/{execute_sql,get_supabase_project_info,
// get_neon_project_info,get_database_table_schema,add_integration,
// enable_nitro}.ts — schemas/descriptions/consent verbatim; management-API
// clients replaced by direct DATABASE_URL execution (bun:sql, guarded) and
// the session connection store. add_integration parks on the shared
// human-gate waiter (dyad/plan/userPrompt) like the donor resolver.

import { z } from "zod";
import { defineTool, type ToolDef } from "../../harness/tools/defineTool.ts";
import { nextRequestId, waitForUserInput } from "../plan/userPrompt.ts";
import {
  DbNotConnectedError,
  getDatabaseLink,
  linkDatabase,
  resolveDatabaseUrl,
  type DbProvider,
} from "./connections.ts";
import { checkSqlDanger, classifySql, splitStatements } from "./sqlSafety.ts";

export class DbToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DbToolError";
  }
}

// --- driver seam (default: bun:sql postgres; tests inject fakes) ---

export interface DbDriver {
  query(databaseUrl: string, sql: string, signal?: AbortSignal): Promise<{ rows: unknown[] }>;
}

let driver: DbDriver | null = null;
export function setDbDriver(d: DbDriver | null): void {
  driver = d;
}

async function bunSqlDriver(): Promise<DbDriver> {
  try {
    const mod = (await Function("return import('bun:sql')")()) as {
      SQL: new (url: string) => { unsafe: (sql: string) => Promise<unknown[]>; close: () => Promise<void> };
    };
    return {
      async query(databaseUrl: string, sql: string) {
        const client = new mod.SQL(databaseUrl);
        try {
          const rows = (await client.unsafe(sql)) as unknown[];
          return { rows };
        } finally {
          await client.close().catch(() => {});
        }
      },
    };
  } catch {
    throw new DbToolError(
      "Postgres driver unavailable (bun:sql). Run the server under Bun, or wire a custom DbDriver.",
    );
  }
}

async function getDriver(): Promise<DbDriver> {
  return driver ?? bunSqlDriver();
}

// --- execute_sql (donor schema + description verbatim) ---

const executeSqlSchema = z.object({
  query: z.string().describe("The SQL query to execute"),
  description: z.string().optional().describe("Brief description of what the query does"),
});

export const executeSqlTool = defineTool({
  name: "execute_sql",
  description:
    "Execute SQL on the connected database. Important: execute each SQL command separately (do not group multiple commands in a single query).",
  schema: executeSqlSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) =>
    executeSql(executeSqlSchema.parse(args), ctx.appPath, ctx.sessionId, ctx.signal),
  presentCall: (args: any) => `SQL: ${(args.query ?? "").slice(0, 80)}`,
});

export interface SqlConsentInfo {
  mutatesSchema: boolean;
  deletesData: boolean;
}

export async function executeSql(
  input: z.infer<typeof executeSqlSchema>,
  appPath: string,
  sessionId: string,
  signal?: AbortSignal,
): Promise<string> {
  const parsed = executeSqlSchema.parse(input);
  const statements = splitStatements(parsed.query);
  if (statements.length === 0) {
    throw new DbToolError("Empty SQL query.");
  }
  if (statements.length > 1) {
    throw new DbToolError(
      "Execute each SQL command separately — do not group multiple commands in a single query. Split on ';' and call execute_sql once per statement.",
    );
  }
  const danger = checkSqlDanger(parsed.query);
  if (danger.isDangerous) {
    throw new DbToolError(
      `Refusing dangerous SQL (${danger.severity}): ${danger.explanation} Rephrase with a WHERE clause or confirm explicitly via the consent prompt.`,
    );
  }
  const { databaseUrl } = resolveDatabaseUrl(appPath, sessionId);
  const { rows } = await getDriver().then((d) => d.query(databaseUrl, statements[0], signal));
  const rendered = rows.length === 0 ? "(no rows)" : JSON.stringify(rows.slice(0, 100), null, 2);
  const more = rows.length > 100 ? `\n… ${rows.length - 100} more row(s) omitted` : "";
  return `Successfully executed SQL query.\n\nSQL result:\n${rendered}${more}`;
}

/** Consent metadata for shouldAutoApproveAgentTool (donor rule). */
export function sqlConsentInfo(query: string): SqlConsentInfo {
  const c = classifySql(query);
  return { mutatesSchema: c.mutatesSchema, deletesData: c.deletesData };
}

// --- get_database_table_schema ---

const tableSchemaSchema = z.object({
  table: z.string().optional().describe("Table name (omit to list all tables)"),
  schema: z.string().default("public").describe("Schema name"),
});

export const getDatabaseTableSchemaTool = defineTool({
  name: "get_database_table_schema",
  description:
    "Get column definitions for database tables (name, type, nullable, default) from information_schema. Omit `table` to list all tables first.",
  schema: tableSchemaSchema,
  readOnly: true,
  modifiesState: false,
  execute: async (args, ctx) =>
    executeTableSchema(tableSchemaSchema.parse(args), ctx.appPath, ctx.sessionId, ctx.signal),
  presentCall: (args: any) => (args.table ? `Schema: ${args.table}` : "List tables"),
});

export async function executeTableSchema(
  input: z.infer<typeof tableSchemaSchema>,
  appPath: string,
  sessionId: string,
  signal?: AbortSignal,
): Promise<string> {
  const parsed = tableSchemaSchema.parse(input);
  const { databaseUrl } = resolveDatabaseUrl(appPath, sessionId);
  const d = await getDriver();
  if (!parsed.table) {
    const { rows } = await d.query(
      databaseUrl,
      `select table_name from information_schema.tables where table_schema = '${parsed.schema.replace(/'/g, "''")}' order by table_name`,
      signal,
    );
    const names = rows.map((r: any) => r.table_name ?? JSON.stringify(r));
    return names.length === 0 ? `No tables in schema "${parsed.schema}".` : `Tables in "${parsed.schema}":\n${names.join("\n")}`;
  }
  const { rows } = await d.query(
    databaseUrl,
    `select column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = '${parsed.schema.replace(/'/g, "''")}' and table_name = '${parsed.table.replace(/'/g, "''")}' order by ordinal_position`,
    signal,
  );
  if (rows.length === 0) return `Table "${parsed.table}" not found in schema "${parsed.schema}".`;
  return [`Columns of "${parsed.table}":`, "", ...rows.map((r: any) => `- ${r.column_name}: ${r.data_type} ${r.is_nullable === "NO" ? "NOT NULL" : "NULL"}${r.column_default ? ` DEFAULT ${r.column_default}` : ""}`)].join("\n");
}

// --- get_supabase_project_info / get_neon_project_info ---

export const getSupabaseProjectInfoTool = defineTool({
  name: "get_supabase_project_info",
  description:
    "Get the linked Supabase project (URL, anon key target, linked project id). Requires a linked Supabase connection — call add_integration first when unlinked.",
  schema: z.object({}),
  readOnly: true,
  modifiesState: false,
  execute: async (_, ctx) => {
    const link = getDatabaseLink(ctx.sessionId);
    if (!link || link.provider !== "supabase") {
      throw new DbNotConnectedError();
    }
    return [
      `Supabase project linked${link.projectId ? `: ${link.projectId}` : "."}`,
      `Database URL source: ${resolveDatabaseUrl(ctx.appPath, ctx.sessionId).source}.`,
      "Use get_database_table_schema to inspect tables and execute_sql for queries.",
    ].join("\n");
  },
  presentCall: () => "Supabase project info",
});

export const getNeonProjectInfoTool = defineTool({
  name: "get_neon_project_info",
  description:
    "Get the linked Neon project (project id, branch id). Requires a linked Neon connection — call add_integration first when unlinked.",
  schema: z.object({}),
  readOnly: true,
  modifiesState: false,
  execute: async (_, ctx) => {
    const link = getDatabaseLink(ctx.sessionId);
    if (!link || link.provider !== "neon") {
      throw new DbNotConnectedError();
    }
    return [
      `Neon project linked${link.projectId ? `: ${link.projectId}` : ""}${link.branchId ? ` (branch ${link.branchId})` : "."}`,
      `Database URL source: ${resolveDatabaseUrl(ctx.appPath, ctx.sessionId).source}.`,
      "Use get_database_table_schema to inspect tables and execute_sql for queries.",
    ].join("\n");
  },
  presentCall: () => "Neon project info",
});

// --- add_integration (donor schema + description verbatim) ---

const addIntegrationSchema = z.object({
  provider: z
    .enum(["none", "supabase", "neon"])
    .optional()
    .describe("Optional preferred database provider. Use 'none' (or omit) if the user did not explicitly name a provider. Only use 'supabase' or 'neon' if the user specifically mentions that provider name in their prompt."),
});

export interface IntegrationTransport {
  sendIntegrationPrompt(sessionId: string, requestId: string, provider?: DbProvider): void;
}

let integrationTransport: IntegrationTransport | null = null;
export function setIntegrationTransport(t: IntegrationTransport | null): void {
  integrationTransport = t;
}

export const addIntegrationTool = defineTool({
  name: "add_integration",
  description:
    "Prompt the user to choose and set up a database provider for the app. Do NOT set the provider parameter unless the user explicitly names a specific provider (e.g. 'Supabase' or 'Neon') in their message. The tool blocks until the user finishes the setup inside the chat and clicks Continue, then returns; you should then proceed with the next step.",
  schema: addIntegrationSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) =>
    executeAddIntegration(addIntegrationSchema.parse(args), ctx.sessionId, ctx.signal),
  presentCall: () => "Add database integration",
});

export async function executeAddIntegration(
  input: z.infer<typeof addIntegrationSchema>,
  sessionId: string,
  signal?: AbortSignal,
): Promise<string> {
  const parsed = addIntegrationSchema.parse(input);
  const existing = getDatabaseLink(sessionId);
  if (existing) {
    return `A ${existing.provider} database is already linked. Continuing with it.`;
  }
  if (!integrationTransport) {
    return "Database setup UI is not wired yet (M3 settings) — ask the user for their Supabase or Neon DATABASE_URL and save it to .env.local, then continue.";
  }
  const provider = parsed.provider && parsed.provider !== "none" ? parsed.provider : undefined;
  const requestId = nextRequestId("integration");
  integrationTransport.sendIntegrationPrompt(sessionId, requestId, provider);
  const answers = await waitForUserInput(requestId, sessionId, "questionnaire", signal);
  if (!answers) {
    return "The user dismissed the integration setup without completing it. Ask them how they'd like to proceed.";
  }
  const picked = (answers.provider === "neon" ? "neon" : "supabase") as DbProvider;
  const databaseUrl = answers.databaseUrl || answers.database_url || "";
  linkDatabase(sessionId, {
    provider: picked,
    databaseUrl: databaseUrl || undefined,
    projectId: answers.projectId,
  });
  return `User completed the ${picked} integration. You can now continue with the next step.`;
}

// --- enable_nitro (donor description verbatim; Caide server-layer mapping) ---

const enableNitroSchema = z.object({
  reason: z.string().describe("One sentence explaining why server-side code is needed for this prompt."),
});

export const enableNitroTool = defineTool({
  name: "enable_nitro",
  description: `
Add a Nitro server layer to this Vite app so it can run secure server-side code
(API routes, database clients, secrets, webhooks).

WHEN TO CALL: Before writing any code under server/, before referencing DATABASE_URL
or any server-only env var, or when the user asks for an API route, webhook, or
server-side compute. Skip for client-side fetch with public/anon keys, for use
cases fully covered by Supabase (anon key + RLS), or when the user explicitly
says "static only" / "no backend".

DATABASE REQUESTS: If the user is asking for a database (or anything that needs
one — auth, persistence, CRUD, etc.) and no provider is set up yet, call
\`add_integration\` FIRST and stop. Do NOT call \`enable_nitro\` in the same turn
— the user must pick their provider first. Supabase makes Nitro unnecessary.
Neon automatically sets up the Nitro server layer as part of its integration
flow, so do NOT call \`enable_nitro\` after a Neon integration either — Nitro
will already be in place when the integration completes. Only call
\`enable_nitro\` for non-database server-side needs (API routes, webhooks,
server-only secrets) when no provider is involved.
`.trim(),
  schema: enableNitroSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) => executeEnableNitro(enableNitroSchema.parse(args), ctx.appPath, ctx.sessionId),
  presentCall: (args: any) => `Add Nitro server layer (${args.reason})`,
});

export async function executeEnableNitro(
  input: z.infer<typeof enableNitroSchema>,
  appPath: string,
  sessionId: string,
): Promise<string> {
  const parsed = enableNitroSchema.parse(input);
  void parsed;
  const link = getDatabaseLink(sessionId);
  if (!link) {
    return [
      "Server-side setup needs a database decision first.",
      "Call add_integration and stop so the user can pick Supabase or Neon.",
      "Supabase covers most needs without a server layer; Neon provisions one automatically.",
      "For the full backend template meanwhile, read the provision-backend guide (read_guide).",
    ].join(" ");
  }
  if (link.provider === "supabase") {
    return "Supabase covers this via Edge Functions + RLS — no Nitro server layer needed. Continue with the Supabase client.";
  }
  return [
    "Server-layer provisioning runs through the linked provider integration.",
    "For a standalone API, scaffold it from the provision-backend guide (read_guide) into api/ and wire DATABASE_URL from the linked integration.",
  ].join(" ");
}

export const ALL_DB_TOOLS: ToolDef[] = [
  executeSqlTool,
  getDatabaseTableSchemaTool,
  getSupabaseProjectInfoTool,
  getNeonProjectInfoTool,
  addIntegrationTool,
  enableNitroTool,
];
