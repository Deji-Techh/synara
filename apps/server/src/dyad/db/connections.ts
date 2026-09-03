// FILE: connections.ts
// Purpose: Database connection resolution for agent DB tools.
// Order: session-linked provider (via add_integration) → app .env /
// .env.local DATABASE_URL → process.env.DATABASE_URL. Supabase/Neon project
// metadata rides the session link; M3 settings UI persists links to SQLite.

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
  source: "session-link" | ".env.local" | ".env" | "environment";
  link?: DbLink;
}

/** Resolve a usable postgres URL or throw a connect-guidance error. */
export function resolveDatabaseUrl(appPath: string, sessionId: string): ResolvedDatabase {
  const link = sessionLinks.get(sessionId);
  if (link?.databaseUrl) {
    return { databaseUrl: link.databaseUrl, source: "session-link", link };
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
