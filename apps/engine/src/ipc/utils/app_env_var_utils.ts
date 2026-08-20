/**
 * DO NOT USE LOGGER HERE.
 * Environment variables are sensitive and should not be logged.
 */

import { getCaideAppPath } from "@/paths/paths";
import { REDACTED_ENV_VALUE, type AppEnvVar, type EnvVar } from "@/ipc/types/misc";
import type { AppFrameworkType } from "@/lib/framework_constants";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import log from "electron-log";
import { CaideError, CaideErrorKind } from "@/errors/caide_error";
import { queueCloudSandboxSnapshotSync } from "./cloud_sandbox_provider";

const logger = log.scope("app_env_var_utils");

export const ENV_FILE_NAME = ".env.local";

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
      throw new CaideError(
        `A masked value cannot be used for ${envVar.key}; enter a new value`,
        CaideErrorKind.Validation,
      );
    }
    return { key: envVar.key, value: existingValue };
  });
}

export function getEnvFilePath({ appPath }: { appPath: string }): string {
  return path.join(getCaideAppPath(appPath), ENV_FILE_NAME);
}

/**
 * Atomically replaces an app environment file with owner-only permissions.
 * The random, exclusive temporary file prevents partial writes and avoids
 * following a malicious `.env.local` symlink created by generated app code.
 */
export async function writeEnvFileSecurely(destination: string, contents: string): Promise<void> {
  let existing: fs.Stats | undefined;
  try {
    existing = await fs.promises.lstat(destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  if (existing?.isSymbolicLink()) {
    throw new CaideError(
      "Refusing to write environment variables through a symbolic link",
      CaideErrorKind.Precondition,
    );
  }

  const temporary = `${destination}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.promises.writeFile(temporary, contents, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
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

export async function updatePostgresUrlEnvVar({
  appPath,
  connectionUri,
}: {
  appPath: string;
  connectionUri: string;
}) {
  // Given the connection uri, update the env vars for POSTGRES_URL and DATABASE_URL
  const envVars = parseEnvFile(await readEnvFile({ appPath }));

  // Update both POSTGRES_URL and DATABASE_URL to keep them in sync
  for (const key of ["POSTGRES_URL", "DATABASE_URL"]) {
    const existingVar = envVars.find((envVar) => envVar.key === key);
    if (existingVar) {
      existingVar.value = connectionUri;
    } else {
      envVars.push({
        key,
        value: connectionUri,
      });
    }
  }

  const envFileContents = serializeEnvFile(envVars);
  await writeEnvFileSecurely(getEnvFilePath({ appPath }), envFileContents);
  queueCloudSandboxSnapshotSync({
    appPath: getCaideAppPath(appPath),
    changedPaths: [ENV_FILE_NAME],
  });
}

export async function updateDbPushEnvVar({
  appPath,
  disabled,
}: {
  appPath: string;
  disabled: boolean;
}) {
  try {
    const envVars = await readEnvVarsOrEmpty({ appPath });

    // Update or add CAIDE_DISABLE_DB_PUSH
    const existingVar = envVars.find((envVar) => envVar.key === "CAIDE_DISABLE_DB_PUSH");
    if (existingVar) {
      existingVar.value = disabled ? "true" : "false";
    } else {
      envVars.push({
        key: "CAIDE_DISABLE_DB_PUSH",
        value: disabled ? "true" : "false",
      });
    }

    const envFileContents = serializeEnvFile(envVars);
    await writeEnvFileSecurely(getEnvFilePath({ appPath }), envFileContents);
    queueCloudSandboxSnapshotSync({
      appPath: getCaideAppPath(appPath),
      changedPaths: [ENV_FILE_NAME],
    });
  } catch (error) {
    logger.error(`Failed to update DB push environment variable for app ${appPath}: ${error}`);
    throw error;
  }
}

export async function readPostgresUrlFromEnvFile({
  appPath,
}: {
  appPath: string;
}): Promise<string> {
  const contents = await readEnvFile({ appPath });
  const envVars = parseEnvFile(contents);
  const postgresUrl = envVars.find((envVar) => envVar.key === "POSTGRES_URL")?.value;
  if (!postgresUrl) {
    throw new CaideError("POSTGRES_URL not found in .env.local", CaideErrorKind.NotFound);
  }
  return postgresUrl;
}

export async function readEnvFile({ appPath }: { appPath: string }): Promise<string> {
  return fs.promises.readFile(getEnvFilePath({ appPath }), "utf8");
}

export async function readEnvFileIfExists({
  appPath,
}: {
  appPath: string;
}): Promise<string | null> {
  try {
    return await readEnvFile({ appPath });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function readEnvVarsOrEmpty({ appPath }: { appPath: string }): Promise<EnvVar[]> {
  const content = await readEnvFileIfExists({ appPath });
  return content ? parseEnvFile(content) : [];
}

// Helper function to parse .env.local file content
export function parseEnvFile(content: string): EnvVar[] {
  const envVars: EnvVar[] = [];
  const lines = content.split("\n");

  let currentDescription: string[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Skip empty lines
    if (!trimmedLine) {
      currentDescription = [];
      continue;
    }

    if (trimmedLine.startsWith("#")) {
      const comment = trimmedLine.substring(1).trim();
      if (comment) {
        currentDescription.push(comment);
      }
      continue;
    }

    // Parse key=value pairs
    const equalIndex = trimmedLine.indexOf("=");
    if (equalIndex > 0) {
      const key = trimmedLine.substring(0, equalIndex).trim();
      const value = trimmedLine.substring(equalIndex + 1).trim();

      // Handle quoted values with potential inline comments
      let cleanValue = value;
      if (value.startsWith('"')) {
        // Find the closing quote, handling escaped quotes
        let endQuoteIndex = -1;
        for (let i = 1; i < value.length; i++) {
          if (value[i] === '"' && value[i - 1] !== "\\") {
            endQuoteIndex = i;
            break;
          }
        }
        if (endQuoteIndex !== -1) {
          cleanValue = value.slice(1, endQuoteIndex);
          // Unescape escaped quotes
          cleanValue = cleanValue.replace(/\\"/g, '"');
        }
      } else if (value.startsWith("'")) {
        // Find the closing quote for single quotes
        const endQuoteIndex = value.indexOf("'", 1);
        if (endQuoteIndex !== -1) {
          cleanValue = value.slice(1, endQuoteIndex);
        }
      }
      // For unquoted values, keep everything as-is (including potential # symbols)

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

/**
 * Generate a random cookie secret for Neon Auth session signing.
 */
export function generateCookieSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

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
  /** Auth base URL returned by the Neon Auth API */
  neonAuthBaseUrl?: string;
  /**
   * App framework. Used to decide whether to write NEON_AUTH_COOKIE_SECRET —
   * only the Next.js `createNeonAuth` integration consumes it (to sign the
   * optional `session_data` cache cookie), so we only write it for Next.js.
   */
  frameworkType?: AppFrameworkType | null;
  /** Persisted per-branch cookie secret. Used when neonAuthBaseUrl is set on a Next.js app. */
  cookieSecret?: string;
  /** Preserve existing auth vars when auth activation failed transiently. */
  preserveExistingAuth?: boolean;
}): Promise<void> {
  let envVars = await readEnvVarsOrEmpty({ appPath });

  upsertEnvVar(envVars, "DATABASE_URL", connectionUri);
  upsertEnvVar(envVars, "POSTGRES_URL", connectionUri);

  const cookieSecretUsed = frameworkType === "nextjs";

  if (neonAuthBaseUrl) {
    upsertEnvVar(envVars, "NEON_AUTH_BASE_URL", neonAuthBaseUrl);
    if (cookieSecretUsed) {
      if (cookieSecret) {
        upsertEnvVar(envVars, "NEON_AUTH_COOKIE_SECRET", cookieSecret);
      } else if (!preserveExistingAuth) {
        // Auth claimed active but caller didn't supply a secret — strip stale
        // value rather than silently keep a wrong one.
        envVars = envVars.filter((v) => v.key !== "NEON_AUTH_COOKIE_SECRET");
      }
    }
  } else if (!preserveExistingAuth) {
    // Auth activation failed or is not available on this branch —
    // remove stale auth env vars so the old branch's values don't linger.
    envVars = envVars.filter(
      (v) => v.key !== "NEON_AUTH_BASE_URL" && v.key !== "NEON_AUTH_COOKIE_SECRET",
    );
  }

  const envFileContents = serializeEnvFile(envVars);
  await writeEnvFileSecurely(getEnvFilePath({ appPath }), envFileContents);
  queueCloudSandboxSnapshotSync({
    appPath: getCaideAppPath(appPath),
    changedPaths: [ENV_FILE_NAME],
  });
}

/** Keys that are unambiguously Neon-owned and always safe to remove. */
const NEON_ONLY_ENV_VAR_KEYS = ["NEON_AUTH_BASE_URL", "NEON_AUTH_COOKIE_SECRET"];

/** Generic DB keys that should only be removed if their value looks Neon-owned. */
const GENERIC_DB_ENV_VAR_KEYS = ["DATABASE_URL", "POSTGRES_URL"];

export async function removeNeonEnvVars({ appPath }: { appPath: string }): Promise<void> {
  const existingContent = await readEnvFileIfExists({ appPath });
  if (!existingContent) {
    return;
  }

  const envVars = parseEnvFile(existingContent);

  const filtered = envVars.filter((envVar) => {
    if (NEON_ONLY_ENV_VAR_KEYS.includes(envVar.key)) return false;
    if (GENERIC_DB_ENV_VAR_KEYS.includes(envVar.key) && envVar.value.includes(".neon.tech")) {
      return false;
    }
    return true;
  });

  const envFileContents = serializeEnvFile(filtered);
  await writeEnvFileSecurely(getEnvFilePath({ appPath }), envFileContents);
  queueCloudSandboxSnapshotSync({
    appPath: getCaideAppPath(appPath),
    changedPaths: [ENV_FILE_NAME],
  });
}

// Helper function to serialize environment variables to .env.local format
export function serializeEnvFile(envVars: EnvVar[]): string {
  return envVars
    .map(({ key, value, description }) => {
      // Add quotes if value contains spaces or special characters
      const needsQuotes = /[\s#"'=&?]/.test(value);
      const quotedValue = needsQuotes ? `"${value.replace(/"/g, '\\"')}"` : value;

      const line = `${key}=${quotedValue}`;
      if (description) {
        // Prefix description lines with #
        const commentLines = description
          .split("\n")
          .map((line) => `# ${line}`)
          .join("\n");
        return `${commentLines}\n${line}`;
      }
      return line;
    })
    .join("\n");
}
