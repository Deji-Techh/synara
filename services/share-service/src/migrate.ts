import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pool } from "./db.js";

/**
 * Run pending migrations on server startup.
 * Migrations are read from the ./migrations directory (copied into the
 * Docker image at /app/migrations) and applied in sorted filename order.
 * Each migration is run inside a transaction and tracked in a
 * `_schema_migrations` table so it runs exactly once.
 */
export async function runMigrations(): Promise<void> {
  // Ensure the tracking table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      id serial PRIMARY KEY,
      filename text NOT NULL UNIQUE,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  // Discover migration files
  let migrationDir: string;
  try {
    // When running from compiled dist/server.js
    migrationDir = join(import.meta.dirname, "..", "migrations");
  } catch {
    // Fallback for tsx/dev mode
    migrationDir = join(import.meta.dirname, "migrations");
  }

  let files: string[];
  try {
    files = readdirSync(migrationDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    console.log("No migrations directory found, skipping.");
    return;
  }

  // Find already-applied migrations
  const applied = await pool.query(
    "SELECT filename FROM _schema_migrations ORDER BY id",
  );
  const appliedSet = new Set(applied.rows.map((r) => r.filename as string));

  let count = 0;
  for (const file of files) {
    if (appliedSet.has(file)) continue;

    const sql = readFileSync(join(migrationDir, file), "utf-8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO _schema_migrations (filename) VALUES ($1)",
        [file],
      );
      await client.query("COMMIT");
      console.log(`✓ Applied migration: ${file}`);
      count++;
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`✗ Migration failed: ${file}`, err);
      // Continue — do not crash the server for a single migration failure.
      // The failed migration will be retried on the next deploy.
    } finally {
      client.release();
    }
  }

  if (count === 0) {
    console.log("All migrations up to date.");
  } else {
    console.log(`Applied ${count} migration(s).`);
  }
}
