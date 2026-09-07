// FILE: connections.ts
// Purpose: Database connection resolution for agent DB tools.
// Order: session-linked provider (via add_integration) → app-scoped link
// (<app>/.caide/db-link.json, persists across chats in the same project,
// never outside it) → app .env / .env.local DATABASE_URL →
// process.env.DATABASE_URL. Supabase/Neon project metadata rides the
// session or app link; management tokens stay memory-only.

import * as fs from "node:fs";
import * as path from "node:path";

export type DbProvider = "supabase" | "neon" | "custom";

export interface DbLink {
  provider: DbProvider;
  databaseUrl?: string;
  projectId?: string;
  organizationSlug?: string | null;
  branchId?: string | null;
  /** Management API token (memory-only; powers project/branch listing). */
  managementToken?: string;
}

const sessionLinks = new Map<string, DbLink>();

export function linkDatabase(sessionId: string, link: DbLink): void {
  sessionLinks.set(sessionId, link);
}

export function unlinkDatabase(sessionId: string): void {
  sessionLinks.delete(sessionId);
}

export function getDatabaseLink(sessionId: string): DbLink | undefined {
  return sessionLinks.get(sessionId);
}

// --- App-scoped links (persist across chats in the same project) ---

const appLinkCache = new Map<string, DbLink>();

function appLinkFile(appPath: string): string {
  return path.join(appPath, ".caide", "db-link.json");
}

/** Read the persisted app link (management tokens never touch disk). */
function readAppLinkFile(appPath: string): DbLink | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(appLinkFile(appPath), "utf8")) as Partial<DbLink>;
    if (parsed && (parsed.provider === "supabase" || parsed.provider === "neon" || parsed.provider === "custom")) {
      const link: DbLink = { provider: parsed.provider };
      if (typeof parsed.databaseUrl === "string" && parsed.databaseUrl) link.databaseUrl = parsed.databaseUrl;
      if (typeof parsed.projectId === "string" && parsed.projectId) link.projectId = parsed.projectId;
      if (typeof parsed.organizationSlug === "string" && parsed.organizationSlug) {
        link.organizationSlug = parsed.organizationSlug;
      }
      if (typeof parsed.branchId === "string" && parsed.branchId) link.branchId = parsed.branchId;
      return link;
    }
  } catch {
    // missing or corrupt — treated as unlinked
  }
  return undefined;
}

/** Persist an app-scoped link (0600; managementToken stays memory-only). */
export function linkAppDatabase(appPath: string, link: DbLink): void {
  const { managementToken: _dropped, ...persistable } = link;
  void _dropped;
  appLinkCache.set(appPath, { ...persistable });
  try {
    fs.mkdirSync(path.join(appPath, ".caide"), { recursive: true });
    fs.writeFileSync(appLinkFile(appPath), `${JSON.stringify(persistable, null, 2)}\n`, { mode: 0o600 });
    try {
      fs.chmodSync(appLinkFile(appPath), 0o600);
    } catch {
      // non-POSIX — best effort
    }
  } catch {
    // disk write failed — in-memory link still applies for this process
  }
}

export function unlinkAppDatabase(appPath: string): void {
  appLinkCache.delete(appPath);
  try {
    fs.unlinkSync(appLinkFile(appPath));
  } catch {
    // already gone — fine
  }
}

export function getAppDatabaseLink(appPath: string): DbLink | undefined {
  const cached = appLinkCache.get(appPath);
  if (cached) return cached;
  const fromDisk = readAppLinkFile(appPath);
  if (fromDisk) appLinkCache.set(appPath, fromDisk);
  return fromDisk;
}

/** Test-only: drop the app-link memory cache (disk files untouched). */
export function clearAppLinkCache(): void {
  appLinkCache.clear();
}

function readEnvFile(appPath: string, file: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const text = fs.readFileSync(path.join(appPath, file), "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][\w]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let value = m[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      out[m[1]] = value;
    }
  } catch {
    // missing file — ignore
  }
  return out;
}

export interface ResolvedDatabase {
  databaseUrl: string;
  source: "session-link" | "app-link" | ".env.local" | ".env" | "environment";
  link?: DbLink;
}

/** Resolve a usable postgres URL or throw a connect-guidance error. */
export function resolveDatabaseUrl(appPath: string, sessionId: string): ResolvedDatabase {
  const link = sessionLinks.get(sessionId);
  if (link?.databaseUrl) {
    return { databaseUrl: link.databaseUrl, source: "session-link", link };
  }
  const appLink = getAppDatabaseLink(appPath);
  if (appLink?.databaseUrl) {
    return { databaseUrl: appLink.databaseUrl, source: "app-link", link: appLink };
  }
  for (const file of [".env.local", ".env"] as const) {
    const vars = readEnvFile(appPath, file);
    if (vars.DATABASE_URL) {
      return { databaseUrl: vars.DATABASE_URL, source: file };
    }
  }
  const envUrl = process.env.DATABASE_URL?.trim();
  if (envUrl) {
    return { databaseUrl: envUrl, source: "environment" };
  }
  throw new DbNotConnectedError();
}

export class DbNotConnectedError extends Error {
  constructor() {
    super(
      "No database connected. Connect one first: call add_integration and have the user pick Supabase or Neon, or set DATABASE_URL in .env.local.",
    );
    this.name = "DbNotConnectedError";
  }
}
