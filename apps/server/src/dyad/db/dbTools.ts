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
import * as fs from "node:fs";
import * as path from "node:path";
import { defineTool, type ToolDef } from "../../harness/tools/defineTool.ts";
import { nextRequestId, waitForUserInput } from "../plan/userPrompt.ts";
import {
  DbNotConnectedError,
  getDatabaseLink,
  linkAppDatabase,
  linkDatabase,
  resolveDatabaseUrl,
  type DbLink,
  type DbProvider,
} from "./connections.ts";
import { checkSqlDanger, classifySql, splitStatements } from "./sqlSafety.ts";
import { getVoiceApiKey } from "../../voice/transcriptionService.ts";
import { writeMigrationFile } from "./migrations.ts";
import { listSupabaseProjects } from "./supabaseApi.ts";
import {
  createSupabaseProject,
  createSupabaseTestUser,
  deleteSupabaseTestUser,
  deploySupabaseFunction,
  getSupabaseProjectApiKeys,
} from "./supabaseApi.ts";
import { listNeonBranches, listNeonProjects, createNeonBranch, createNeonProject, deleteNeonBranch, deleteNeonProject } from "./neonApi.ts";

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
  // Donor behavior: Supabase schema changes also land a migration file so
  // history survives. Best-effort — never fails the tool call.
  let migrationNote = "";
  try {
    const link = getDatabaseLink(sessionId);
    if (link?.provider === "supabase" && classifySql(parsed.query).mutatesSchema) {
      const file = await writeMigrationFile(appPath, parsed.description ?? "schema change", statements[0]);
      if (file) migrationNote = `\n\nMigration recorded: ${file}`;
    }
  } catch {
    // ignore — execution already succeeded
  }
  return `Successfully executed SQL query.\n\nSQL result:\n${rendered}${more}${migrationNote}`;
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
    const lines = [
      `Supabase project linked${link.projectId ? `: ${link.projectId}` : "."}`,
      `Database URL source: ${resolveDatabaseUrl(ctx.appPath, ctx.sessionId).source}.`,
      "Use get_database_table_schema to inspect tables and execute_sql for queries.",
    ];
    const supabaseToken = link.managementToken || getVoiceApiKey("supabase");
    if (supabaseToken) {
      try {
        const projects = await listSupabaseProjects({ token: supabaseToken });
        lines.push(
          "",
          `Remote projects (${projects.length}):`,
          ...projects.slice(0, 20).map((p) => `- ${p.name} (${p.id})${p.region ? ` [${p.region}]` : ""}`),
        );
      } catch (err) {
        lines.push("", `Remote listing failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return lines.join("\n");
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
    const lines = [
      `Neon project linked${link.projectId ? `: ${link.projectId}` : ""}${link.branchId ? ` (branch ${link.branchId})` : "."}`,
      `Database URL source: ${resolveDatabaseUrl(ctx.appPath, ctx.sessionId).source}.`,
      "Use get_database_table_schema to inspect tables and execute_sql for queries.",
    ];
    const neonToken = link.managementToken || getVoiceApiKey("neon");
    if (neonToken) {
      try {
        const projects = await listNeonProjects({ apiKey: neonToken });
        lines.push("", `Remote projects (${projects.length}):`);
        for (const p of projects.slice(0, 10)) {
          lines.push(`- ${p.name} (${p.id})`);
          if (link.projectId && p.id === link.projectId) {
            try {
              const branches = await listNeonBranches({ apiKey: neonToken, projectId: p.id });
              for (const b of branches.slice(0, 10)) {
                lines.push(`    branch: ${b.name} (${b.id})${b.primary ? " [primary]" : ""}`);
              }
            } catch {
              // branches optional
            }
          }
        }
      } catch (err) {
        lines.push("", `Remote listing failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return lines.join("\n");
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
    executeAddIntegration(addIntegrationSchema.parse(args), ctx.sessionId, ctx.signal, ctx.appPath),
  presentCall: () => "Add database integration",
});

export async function executeAddIntegration(
  input: z.infer<typeof addIntegrationSchema>,
  sessionId: string,
  signal?: AbortSignal,
  appPath?: string,
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
  const link: DbLink = {
    provider: picked,
    databaseUrl: databaseUrl || undefined,
    projectId: answers.projectId,
    managementToken: answers.managementToken || answers.management_token || undefined,
  };
  linkDatabase(sessionId, link);
  // Persist app-scoped so later chats in the same project reuse it.
  if (appPath) linkAppDatabase(appPath, link);
  return `User completed the ${picked} integration. You can now continue with the next step.`;
}

// --- enable_nitro (donor description verbatim; Caide server-layer mapping) ---

const enableNitroSchema = z.object({
  reason: z.string().describe("One sentence explaining why server-side code is needed for this prompt."),
});

export const enableNitroTool = defineTool({
  name: "enable_nitro",
  description: `
Add a Nitro server layer to this app so it can run secure server-side code
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

// --- create_neon_branch (referenced by the provision-backend guide) ---

const createNeonBranchSchema = z.object({
  projectId: z.string().optional().describe("Neon project id. Defaults to the linked integration's project."),
  branchName: z.string().optional().describe("Branch name, e.g. caide-myapp-dev. Defaults to a caide-<timestamp> name."),
});

// --- create_supabase_project (PAT-based; no hosted broker) ---

const createSupabaseProjectSchema = z.object({
  name: z.string().describe("Project name, e.g. myapp-prod."),
  organizationId: z.string().optional().describe("Organization slug/id. Defaults to the linked integration's organization."),
  region: z.string().optional().describe("Region, e.g. us-east-1. Defaults to us-east-1."),
});

function requireSupabaseManagementToken(sessionId: string): { link: DbLink | undefined; token: string } {
  const link = getDatabaseLink(sessionId);
  // Session link token wins; otherwise the stored settings key or env
  // (Settings → Database → access token, or SUPABASE_ACCESS_TOKEN).
  const token = link?.provider === "supabase" ? link.managementToken : undefined;
  const resolved = token || getVoiceApiKey("supabase");
  if (!resolved) {
    throw new DbToolError("Supabase access token missing — add one in Settings → Database, or re-run add_integration.");
  }
  return { link, token: resolved };
}

function requireNeonManagementToken(sessionId: string): { link: DbLink | undefined; token: string } {
  const link = getDatabaseLink(sessionId);
  const token = link?.provider === "neon" ? link.managementToken : undefined;
  const resolved = token || getVoiceApiKey("neon");
  if (!resolved) {
    throw new DbToolError("Neon API key missing — add one in Settings → Database, or re-run add_integration.");
  }
  return { link, token: resolved };
}

/**
 * One-click wiring: after a successful create, the session link carries the
 * new project id (and branch) so later chats reuse it without copy-paste.
 * Persists to <app>/.caide/db-link.json (tokens stay memory-only).
 */
function upsertSessionProjectLink(
  sessionId: string,
  appPath: string,
  provider: DbProvider,
  projectId: string,
  extra?: { organizationSlug?: string; branchId?: string },
): void {
  const existing = getDatabaseLink(sessionId);
  const next: DbLink = {
    ...(existing ?? { provider }),
    provider,
    projectId,
    ...(extra?.organizationSlug ? { organizationSlug: extra.organizationSlug } : {}),
    ...(extra?.branchId ? { branchId: extra.branchId } : {}),
  };
  linkDatabase(sessionId, next);
  if (appPath) linkAppDatabase(appPath, next);
}

/**
 * Writes DATABASE_URL to <app>/.env.local (append-or-replace, rest of file
 * preserved), then verifies by re-reading. Returns true when the verified
 * value matches. The URI dies in chat if the agent skips this — so create
 * tools call it directly instead of instructing and hoping.
 */
export function writeEnvLocalDatabaseUrl(appPath: string, databaseUrl: string): boolean {
  try {
    const file = path.join(appPath, ".env.local");
    let lines: string[] = [];
    try {
      lines = fs.readFileSync(file, "utf8").split("\n");
    } catch {
      // missing — start fresh
    }
    let replaced = false;
    const next = lines.map((line) => {
      if (/^\s*DATABASE_URL\s*=/.test(line)) {
        replaced = true;
        return `DATABASE_URL="${databaseUrl}"`;
      }
      return line;
    });
    if (!replaced) {
      if (next.length > 0 && next[next.length - 1]?.trim() !== "") next.push("");
      next.push(`DATABASE_URL="${databaseUrl}"`);
    }
    fs.mkdirSync(appPath, { recursive: true });
    fs.writeFileSync(file, `${next.join("\n").replace(/\n+$/, "")}\n`);
    // Verify by re-reading (never trust the write blindly).
    const verify = fs.readFileSync(file, "utf8");
    return verify.split("\n").some((line) => line.trim() === `DATABASE_URL="${databaseUrl}"`);
  } catch {
    return false;
  }
}

export const createSupabaseProjectTool = defineTool({
  name: "create_supabase_project",
  description: [
    "Create a Supabase project inside an organization.",
    "Requires a linked Supabase connection with a personal access token — call add_integration first when unlinked.",
    "After creation, save the connection string to .env.local as DATABASE_URL and link the project id.",
  ].join(" "),
  schema: createSupabaseProjectSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) => {
    const parsed = createSupabaseProjectSchema.parse(args);
    const { link, token } = requireSupabaseManagementToken(ctx.sessionId);
    const orgId = parsed.organizationId?.trim() || link?.organizationSlug || "";
    if (!orgId) {
      throw new DbToolError("No organization — pass organizationId or re-run add_integration.");
    }
    const created = await createSupabaseProject({
      token,
      name: parsed.name,
      organizationId: orgId,
      region: parsed.region,
      signal: ctx.signal,
    });
    upsertSessionProjectLink(ctx.sessionId, ctx.appPath, "supabase", created.id, { organizationSlug: orgId });
    return [
      `Supabase project created and linked: ${created.name} (${created.id}).`,
      "Save its connection string to .env.local as DATABASE_URL with write_file. NEVER print secrets in chat.",
    ].join("\n");
  },
  presentCall: (args: any) => `Create Supabase project${args.name ? `: ${args.name}` : ""}`,
});

// --- deploy_supabase_functions ---

const deploySupabaseFunctionsSchema = z.object({
  projectId: z.string().optional().describe("Project ref. Defaults to the linked integration's project."),
  slugs: z.array(z.string()).describe("Function slugs to deploy from supabase/functions/<slug>/index.ts in the app."),
});

export const deploySupabaseFunctionsTool = defineTool({
  name: "deploy_supabase_functions",
  description: [
    "Deploy Edge Functions from supabase/functions/<slug>/index.ts to the linked Supabase project.",
    "Bundles each function directory and deploys sequentially. Requires a linked Supabase connection.",
  ].join(" "),
  schema: deploySupabaseFunctionsSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) => {
    const parsed = deploySupabaseFunctionsSchema.parse(args);
    const { link, token } = requireSupabaseManagementToken(ctx.sessionId);
    const projectId = parsed.projectId?.trim() || link?.projectId || "";
    if (!projectId) {
      throw new DbToolError("No project ref — pass projectId or re-run add_integration.");
    }
    const deployed: string[] = [];
    for (const slug of parsed.slugs.map((s) => s.trim()).filter(Boolean)) {
      const entry = path.join(ctx.appPath, "supabase", "functions", slug, "index.ts");
      let source: string;
      try {
        source = await fs.promises.readFile(entry, "utf8");
      } catch {
        throw new DbToolError(`Function source missing: supabase/functions/${slug}/index.ts.`);
      }
      await deploySupabaseFunction({
        token,
        projectId,
        slug,
        bundleB64: Buffer.from(source, "utf8").toString("base64"),
        signal: ctx.signal,
      });
      deployed.push(slug);
    }
    return `Deployed ${deployed.length} Edge Function${deployed.length === 1 ? "" : "s"} to ${projectId}: ${deployed.join(", ")}.`;
  },
  presentCall: (args: any) => `Deploy functions: ${(args.slugs ?? []).join(", ") || "none"}`,
});

// --- supabase_test_user (throwaway e2e user; secret key never leaves the call) ---

const supabaseTestUserSchema = z.object({
  action: z.enum(["create", "delete"]).describe("Create or delete the throwaway test user."),
  userId: z.string().optional().describe("User id for action=delete."),
});

export const supabaseTestUserTool = defineTool({
  name: "supabase_test_user",
  description: [
    "Create or delete a throwaway Supabase Auth user (dyad-test+* address) for isolated end-to-end verification.",
    "Uses the project secret key via the Auth Admin API — the key is fetched with reveal, used once, and NEVER stored in the app or printed in chat. The app keeps running on the publishable key.",
  ].join(" "),
  schema: supabaseTestUserSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) => {
    const parsed = supabaseTestUserSchema.parse(args);
    const { link, token } = requireSupabaseManagementToken(ctx.sessionId);
    const projectId = link?.projectId || "";
    if (!projectId) {
      throw new DbToolError("No project ref — re-run add_integration.");
    }
    const keys = await getSupabaseProjectApiKeys({ token, projectId, reveal: true, signal: ctx.signal });
    const secret = keys.find((k) => /secret|service_role/i.test(`${k.name} ${k.apiKey ?? ""}`))?.apiKey
      ?? keys.map((k) => k.apiKey).find(Boolean);
    if (!secret) {
      throw new DbToolError("No secret key revealed for this project — check dashboard permissions.");
    }
    const projectRef = projectId.includes(".") ? projectId.split(".")[0] as string : projectId;
    if (parsed.action === "delete") {
      if (!parsed.userId?.trim()) throw new DbToolError("userId is required for action=delete.");
      await deleteSupabaseTestUser({ projectRef, secretKey: secret, userId: parsed.userId, signal: ctx.signal });
      return `Test user ${parsed.userId} deleted.`;
    }
    const user = await createSupabaseTestUser({ projectRef, secretKey: secret, signal: ctx.signal });
    return `Test user created: ${user.email} (${user.id}). Delete it with supabase_test_user action=delete when done.`;
  },
  presentCall: (args: any) => args.action === "delete" ? "Delete test user" : "Create test user",
});

// --- create_neon_project (PAT-based; no hosted broker) ---

const createNeonProjectSchema = z.object({
  name: z.string().describe("Project name, e.g. myapp."),
  regionId: z.string().optional().describe("Region id, e.g. aws-us-east-2. Defaults to the account default."),
});

export const createNeonProjectTool = defineTool({
  name: "create_neon_project",
  description: [
    "Create a Neon project. Requires a Neon API key — add one in Settings → Database, or re-run add_integration.",
    "After creation, save the connection string to .env.local as DATABASE_URL and link the project id.",
  ].join(" "),
  schema: createNeonProjectSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) => {
    const parsed = createNeonProjectSchema.parse(args);
    const { token } = requireNeonManagementToken(ctx.sessionId);
    let created;
    created = await createNeonProject({
      apiKey: token,
      name: parsed.name,
      regionId: parsed.regionId,
      signal: ctx.signal,
    });
    // Best-effort dev branch so the app has an isolated workspace branch.
    let branchNote = "";
    let branchId: string | undefined;
    try {
      const branch = await createNeonBranch({
        apiKey: token,
        projectId: created.id,
        branchName: "development",
        signal: ctx.signal,
      });
      branchId = branch.id;
      branchNote = ` Development branch ready (${branch.id}).`;
    } catch {
      branchNote = " Development branch could not be created automatically — create one with create_neon_branch.";
    }
    upsertSessionProjectLink(ctx.sessionId, ctx.appPath, "neon", created.id, {
      ...(branchId ? { branchId } : {}),
    });
    const connectionLine = created.connectionUri
      ? writeEnvLocalDatabaseUrl(ctx.appPath, created.connectionUri)
        ? "Connection string saved to .env.local as DATABASE_URL and verified (then forgotten here — NEVER print it in chat)."
        : "Connection string could NOT be written automatically — save it to .env.local as DATABASE_URL with write_file."
      : "Copy its connection string from the Neon console into .env.local as DATABASE_URL with write_file.";
    return [
      `Neon project created and linked: ${created.name} (${created.id}).${branchNote}`,
      connectionLine,
    ].join("\n");
  },
  presentCall: (args: any) => `Create Neon project${args.name ? `: ${args.name}` : ""}`,
});

// --- neon_test_branch (throwaway branch for isolated verification) ---

const neonTestBranchSchema = z.object({
  action: z.enum(["create", "delete"]).describe("Create or delete the throwaway test branch."),
  projectId: z.string().optional().describe("Project id. Defaults to the linked integration's project."),
  branchId: z.string().optional().describe("Branch id for action=delete."),
});

export const neonTestBranchTool = defineTool({
  name: "neon_test_branch",
  description: [
    "Create or delete a throwaway Neon branch (caide-test-*) for isolated end-to-end verification.",
    "Requires a Neon API key. Delete the branch when verification is done.",
  ].join(" "),
  schema: neonTestBranchSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) => {
    const parsed = neonTestBranchSchema.parse(args);
    const { link, token } = requireNeonManagementToken(ctx.sessionId);
    const projectId = parsed.projectId?.trim() || link?.projectId || "";
    if (!projectId) {
      throw new DbToolError("No project id — pass projectId or link a Neon project first.");
    }
    if (parsed.action === "delete") {
      if (!parsed.branchId?.trim()) throw new DbToolError("branchId is required for action=delete.");
      await deleteNeonBranch({ apiKey: token, projectId, branchId: parsed.branchId, signal: ctx.signal });
      return `Test branch ${parsed.branchId} deleted.`;
    }
    const branch = await createNeonBranch({
      apiKey: token,
      projectId,
      branchName: `caide-test-${Date.now().toString(36)}`,
      signal: ctx.signal,
    });
    return [
      `Test branch created: ${branch.name} (${branch.id}).`,
      branch.connectionUri
        ? writeEnvLocalDatabaseUrl(ctx.appPath, branch.connectionUri)
          ? "Connection string saved to .env.local as DATABASE_URL and verified (then forgotten here — NEVER print it in chat). Delete the branch when verification is done."
          : "Connection string could NOT be written automatically — save it to .env.local as DATABASE_URL with write_file."
        : "Copy its connection string from the Neon console for isolated verification, then delete the branch.",
    ].join("\n");
  },
  presentCall: (args: any) => args.action === "delete" ? "Delete Neon test branch" : "Create Neon test branch",
});

export const createNeonBranchTool = defineTool({
  name: "create_neon_branch",
  description: [
    "Create a Neon branch (database) inside the linked Neon project.",
    "Requires a linked Neon connection with a management token — call add_integration first when unlinked.",
    "Returns the branch id/name. The pooled connection URI (when provided) is written to .env.local as",
    "DATABASE_URL automatically and verified — NEVER print it back to the user.",
  ].join(" "),
  schema: createNeonBranchSchema,
  readOnly: false,
  modifiesState: true,
  execute: async (args, ctx) => {
    const parsed = createNeonBranchSchema.parse(args);
    const { link, token } = requireNeonManagementToken(ctx.sessionId);
    const projectId = parsed.projectId?.trim() || link?.projectId;
    if (!projectId) {
      throw new DbToolError("No Neon project id — pass projectId or re-run add_integration.");
    }
    const branchName = parsed.branchName?.trim() || `caide-${Date.now().toString(36)}`;
    const created = await createNeonBranch({
      apiKey: token,
      projectId,
      branchName,
      signal: ctx.signal,
    });
    const lines = [
      `Neon branch created: ${created.name} (${created.id}) in project ${projectId}.`,
    ];
    if (created.connectionUri) {
      lines.push(
        writeEnvLocalDatabaseUrl(ctx.appPath, created.connectionUri)
          ? "Connection string saved to .env.local as DATABASE_URL and verified (then forgotten here — NEVER print it in chat)."
          : "Connection string could NOT be written automatically — save it to .env.local as DATABASE_URL with write_file.",
      );
    } else {
      lines.push("No connection URI returned — copy DATABASE_URL from the Neon console into .env.local.");
    }
    return lines.join("\n");
  },
  presentCall: (args: any) => `Create Neon branch${args.branchName ? `: ${args.branchName}` : ""}`,
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
  createSupabaseProjectTool,
  deploySupabaseFunctionsTool,
  supabaseTestUserTool,
  createNeonProjectTool,
  createNeonBranchTool,
  neonTestBranchTool,
  addIntegrationTool,
  enableNitroTool,
];
