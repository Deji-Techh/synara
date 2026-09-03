// FILE: migrations.ts
// Purpose: Local migration-file writer (Supabase CLI convention:
// supabase/migrations/<timestamp>_<slug>.sql). Donor wrote migration files
// on Supabase execute_sql; here it's best-effort after mutating DDL so
// schema history survives even though execution goes over DATABASE_URL.

import * as fs from "node:fs";
import * as path from "node:path";

export function slugifyMigrationName(name: string): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "migration";
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return `${stamp}_${slug}.sql`;
}

/** Append a migration file; returns the relative path (never throws). */
export async function writeMigrationFile(
  appPath: string,
  name: string,
  sql: string,
): Promise<string | null> {
  try {
    const dir = path.join(appPath, "supabase", "migrations");
    await fs.promises.mkdir(dir, { recursive: true });
    const file = slugifyMigrationName(name);
    await fs.promises.writeFile(path.join(dir, file), `${sql.trim()}\n`, "utf8");
    return path.join("supabase", "migrations", file);
  } catch {
    return null;
  }
}
