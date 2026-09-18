// FILE: envFile.ts
// Purpose: .env.local management for database linkage (parse/serialize,
// secure write, Neon inject/strip, redaction for UI readouts).
// Donor: dyad x caide src/ipc/utils/app_env_var_utils.ts — logic verbatim;
// adaptations: plain Errors (no DyadError), appPath used directly (no
// getDyadAppPath indirection), cloud-sandbox snapshot hook dropped (no
// cloud sandbox in the free build), DYAD_DISABLE_DB_PUSH renamed
// CAIDE_DISABLE_DB_PUSH (nothing in V2 reads the DYAD_ name).

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export const ENV_FILE_NAME = ".env.local";

export const REDACTED_ENV_VALUE = "••••••••";

export interface EnvVar {
  key: string;
  value: string;
  description?: string | undefined;
}

export interface AppEnvVar {
  key: string;
  value: string;
  sensitive: boolean;
}

export class EnvFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvFileError";
  }
}

const SENSITIVE_ENV_KEY =
  /(?:^|_)(?:SECRET|PASSWORD|TOKEN|PRIVATE_KEY|API_KEY|ACCESS_KEY|CLIENT_SECRET|DATABASE_URL|POSTGRES_URL|CONNECTION_STRING)(?:$|_)/i;

export function isSensitiveEnvVarKey(key: string): boolean {
  return SENSITIVE_ENV_KEY.test(key);
}

export function redactAppEnvVars(envVars: EnvVar[]): AppEnvVar[] {
  return envVars.map((envVar) => {
    const sensitive = isSensitiveEnvVarKey(envVar.key);
    return {
      key: envVar.key,
      value: sensitive ? REDACTED_ENV_VALUE : envVar.value,
      sensitive,
    };
  });
}

export function resolveRedactedEnvVarUpdates({
  existing,
  incoming,
}: {
  existing: EnvVar[];
  incoming: EnvVar[];
}): EnvVar[] {
  const existingByKey = new Map(existing.map((envVar) => [envVar.key, envVar.value]));
  return incoming.map((envVar) => {
    if (envVar.value !== REDACTED_ENV_VALUE) return envVar;
    const existingValue = existingByKey.get(envVar.key);
    if (existingValue === undefined || !isSensitiveEnvVarKey(envVar.key)) {
      throw new EnvFileError(`A masked value cannot be used for ${envVar.key}; enter a new value`);
    }
    return { key: envVar.key, value: existingValue };
  });
}

export function getEnvFilePath(appPath: string): string {
  return path.join(appPath, ENV_FILE_NAME);
}

/**
 * Donor writeEnvFileSecurely parity: atomic replace with owner-only
 * permissions. Exclusive temp file prevents partial writes and refuses to
 * follow a malicious `.env.local` symlink planted by generated app code.
 */
export async function writeEnvFileSecurely(destination: string, contents: string): Promise<void> {
  let existing: fs.Stats | undefined;
  try {
    existing = await fs.promises.lstat(destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (existing?.isSymbolicLink()) {
    throw new EnvFileError("Refusing to write environment variables through a symbolic link");
  }
  const temporary = `${destination}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.promises.writeFile(temporary, contents, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await fs.promises.chmod(temporary, 0o600);
    await fs.promises.rename(temporary, destination);
    await fs.promises.chmod(destination, 0o600);
  } finally {
    try {
      await fs.promises.rm(temporary, { force: true });
    } catch {
      // The rename normally consumes the temporary file.
    }
  }
}

export function parseEnvFile(content: string): EnvVar[] {
  const envVars: EnvVar[] = [];
  const lines = content.split("\n");
  let currentDescription: string[] = [];
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      currentDescription = [];
      continue;
    }
    if (trimmedLine.startsWith("#")) {
      const comment = trimmedLine.substring(1).trim();
      if (comment) currentDescription.push(comment);
      continue;
    }
    const equalIndex = trimmedLine.indexOf("=");
    if (equalIndex > 0) {
      const key = trimmedLine.substring(0, equalIndex).trim();
      const value = trimmedLine.substring(equalIndex + 1).trim();
      let cleanValue = value;
      if (value.startsWith('"')) {
        let endQuoteIndex = -1;
        for (let i = 1; i < value.length; i++) {
          if (value[i] === '"' && value[i - 1] !== "\\") {
            endQuoteIndex = i;
            break;
          }
        }
        if (endQuoteIndex !== -1) {
          cleanValue = value.slice(1, endQuoteIndex).replace(/\\"/g, '"');
        }
      } else if (value.startsWith("'")) {
        const endQuoteIndex = value.indexOf("'", 1);
        if (endQuoteIndex !== -1) cleanValue = value.slice(1, endQuoteIndex);
      }
      envVars.push({
        key,
        value: cleanValue,
        description: currentDescription.length > 0 ? currentDescription.join(" ") : undefined,
      });
      currentDescription = [];
    }
  }
  return envVars;
}

function upsertEnvVar(envVars: EnvVar[], key: string, value: string): void {
  const existing = envVars.find((envVar) => envVar.key === key);
  if (existing) {
    existing.value = value;
  } else {
    envVars.push({ key, value });
  }
}

export async function readEnvFile(appPath: string): Promise<string> {
  return fs.promises.readFile(getEnvFilePath(appPath), "utf8");
}

export async function readEnvFileIfExists(appPath: string): Promise<string | null> {
  try {
    return await readEnvFile(appPath);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function readEnvVarsOrEmpty(appPath: string): Promise<EnvVar[]> {
  const content = await readEnvFileIfExists(appPath);
  return content ? parseEnvFile(content) : [];
}

export function serializeEnvFile(envVars: EnvVar[]): string {
  return envVars
    .map(({ key, value, description }) => {
      const needsQuotes = /[\s#"'=&?]/.test(value);
      const quotedValue = needsQuotes ? `"${value.replace(/"/g, '\\"')}"` : value;
      const line = `${key}=${quotedValue}`;
      if (description) {
        const commentLines = description
          .split("\n")
          .map((comment) => `# ${comment}`)
          .join("\n");
        return `${commentLines}\n${line}`;
      }
      return line;
    })
    .join("\n");
}

/** Generate a random cookie secret for Neon Auth session signing. */
export function generateCookieSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Donor updateNeonEnvVars parity: selective inject — DATABASE_URL +
 * POSTGRES_URL always; NEON_AUTH_* only with an auth base URL (cookie
 * secret Next.js-only); stale auth vars stripped unless preserving after a
 * transient activation failure. The `.neon.tech` strip-guard lives in
 * removeNeonEnvVars below.
 */
export async function updateNeonEnvVars({
  appPath,
  connectionUri,
  neonAuthBaseUrl,
  frameworkType,
  cookieSecret,
  preserveExistingAuth = false,
}: {
  appPath: string;
  connectionUri: string;
  neonAuthBaseUrl?: string;
  /** Only Next.js consumes NEON_AUTH_COOKIE_SECRET — set for Next.js apps. */
  frameworkType?: string | null;
  cookieSecret?: string;
  preserveExistingAuth?: boolean;
}): Promise<void> {
  let envVars = await readEnvVarsOrEmpty(appPath);
  upsertEnvVar(envVars, "DATABASE_URL", connectionUri);
  upsertEnvVar(envVars, "POSTGRES_URL", connectionUri);
  const cookieSecretUsed = frameworkType === "nextjs";
  if (neonAuthBaseUrl) {
    upsertEnvVar(envVars, "NEON_AUTH_BASE_URL", neonAuthBaseUrl);
    if (cookieSecretUsed) {
      if (cookieSecret) {
        upsertEnvVar(envVars, "NEON_AUTH_COOKIE_SECRET", cookieSecret);
      } else if (!preserveExistingAuth) {
        envVars = envVars.filter((v) => v.key !== "NEON_AUTH_COOKIE_SECRET");
      }
    }
  } else if (!preserveExistingAuth) {
    envVars = envVars.filter(
      (v) => v.key !== "NEON_AUTH_BASE_URL" && v.key !== "NEON_AUTH_COOKIE_SECRET",
    );
  }
  await writeEnvFileSecurely(getEnvFilePath(appPath), serializeEnvFile(envVars));
}

/** Keys unambiguously Neon-owned and always safe to remove. */
const NEON_ONLY_ENV_VAR_KEYS = ["NEON_AUTH_BASE_URL", "NEON_AUTH_COOKIE_SECRET"];
/** Generic DB keys removed only when their value looks Neon-owned. */
const GENERIC_DB_ENV_VAR_KEYS = ["DATABASE_URL", "POSTGRES_URL"];

/**
 * Donor removeNeonEnvVars parity (disconnect path): drops Neon-owned keys;
 * generic keys only when the value carries the `.neon.tech` marker, so a
 * hand-rolled Postgres URL is never stripped.
 */
export async function removeNeonEnvVars(appPath: string): Promise<void> {
  const existingContent = await readEnvFileIfExists(appPath);
  if (!existingContent) return;
  const envVars = parseEnvFile(existingContent);
  const filtered = envVars.filter((envVar) => {
    if (NEON_ONLY_ENV_VAR_KEYS.includes(envVar.key)) return false;
    if (GENERIC_DB_ENV_VAR_KEYS.includes(envVar.key) && envVar.value.includes(".neon.tech")) {
      return false;
    }
    return true;
  });
  await writeEnvFileSecurely(getEnvFilePath(appPath), serializeEnvFile(filtered));
}

/** Sync POSTGRES_URL + DATABASE_URL to a connection URI (Supabase flows). */
export async function updatePostgresUrlEnvVar(
  appPath: string,
  connectionUri: string,
): Promise<void> {
  const envVars = parseEnvFile(await readEnvFile(appPath));
  for (const key of ["POSTGRES_URL", "DATABASE_URL"]) {
    const existingVar = envVars.find((envVar) => envVar.key === key);
    if (existingVar) {
      existingVar.value = connectionUri;
    } else {
      envVars.push({ key, value: connectionUri });
    }
  }
  await writeEnvFileSecurely(getEnvFilePath(appPath), serializeEnvFile(envVars));
}

export async function readPostgresUrlFromEnvFile(appPath: string): Promise<string> {
  const contents = await readEnvFile(appPath);
  const postgresUrl = parseEnvFile(contents).find((envVar) => envVar.key === "POSTGRES_URL")?.value;
  if (!postgresUrl) throw new EnvFileError("POSTGRES_URL not found in .env.local");
  return postgresUrl;
}
