/**
 * DO NOT USE LOGGER HERE.
 * Environment variables are sensitive and should not be logged.
 */
import * as fs from "fs";
import * as path from "path";
import { db } from "../../db";
import { apps } from "../../db/schema";
import { eq } from "drizzle-orm";
import { getCaideAppPath } from "../../paths/paths";
import {
  ENV_FILE_NAME,
  parseEnvFile,
  redactAppEnvVars,
  resolveRedactedEnvVarUpdates,
  serializeEnvFile,
  writeEnvFileSecurely,
} from "../utils/app_env_var_utils";
import { queueCloudSandboxSnapshotSync } from "../utils/cloud_sandbox_provider";
import { createTypedHandler } from "./base";
import { miscContracts } from "../types/misc";
import type { EnvVar } from "../types/misc";
import { CaideError, CaideErrorKind, isCaideError } from "@/errors/caide_error";

export function registerAppEnvVarsHandlers() {
  // Handler to get app environment variables
  createTypedHandler(miscContracts.getAppEnvVars, async (_, { appId }) => {
    try {
      const app = await db.query.apps.findFirst({
        where: eq(apps.id, appId),
      });

      if (!app) {
        throw new CaideError("App not found", CaideErrorKind.NotFound);
      }

      const appPath = getCaideAppPath(app.path);
      const envFilePath = path.join(appPath, ENV_FILE_NAME);

      // If .env.local doesn't exist, return empty array
      try {
        await fs.promises.access(envFilePath);
      } catch {
        return [];
      }

      const content = await fs.promises.readFile(envFilePath, "utf8");
      const envVars = parseEnvFile(content);

      return redactAppEnvVars(envVars);
    } catch (error) {
      if (isCaideError(error)) throw error;
      throw new CaideError("Failed to read app environment variables", CaideErrorKind.External, {
        cause: error,
      });
    }
  });

  // Handler to set app environment variables
  createTypedHandler(miscContracts.setAppEnvVars, async (_, { appId, envVars }) => {
    try {
      const app = await db.query.apps.findFirst({
        where: eq(apps.id, appId),
      });

      if (!app) {
        throw new CaideError("App not found", CaideErrorKind.NotFound);
      }

      const appPath = getCaideAppPath(app.path);
      const envFilePath = path.join(appPath, ENV_FILE_NAME);

      let existingEnvVars: EnvVar[] = [];
      try {
        existingEnvVars = parseEnvFile(await fs.promises.readFile(envFilePath, "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }

      const resolvedEnvVars = resolveRedactedEnvVarUpdates({
        existing: existingEnvVars,
        incoming: envVars,
      });
      const content = serializeEnvFile(resolvedEnvVars);

      // Write to .env.local file
      await writeEnvFileSecurely(envFilePath, content);
      queueCloudSandboxSnapshotSync({
        appId,
        changedPaths: [ENV_FILE_NAME],
      });
    } catch (error) {
      if (isCaideError(error)) throw error;
      throw new CaideError("Failed to save app environment variables", CaideErrorKind.External, {
        cause: error,
      });
    }
  });
}
