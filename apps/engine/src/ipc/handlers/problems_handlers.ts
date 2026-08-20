import { db } from "../../db";
import { apps } from "../../db/schema";
import { eq } from "drizzle-orm";
import {
  generateProblemReport,
  getTypeCheckPreconditionGuidance,
  getTypeCheckPreconditionKind,
} from "../processors/tsc";
import { getCaideAppPath } from "@/paths/paths";
import log from "electron-log";
import { createTypedHandler } from "./base";
import { miscContracts } from "../types/misc";
import { CaideError, CaideErrorKind } from "@/errors/caide_error";

const logger = log.scope("problems_handlers");

export function registerProblemsHandlers() {
  createTypedHandler(miscContracts.checkProblems, async (_, params) => {
    let appPath = "";
    try {
      // Get the app to find its path
      const app = await db.query.apps.findFirst({
        where: eq(apps.id, params.appId),
      });

      if (!app) {
        throw new CaideError(`App not found: ${params.appId}`, CaideErrorKind.NotFound);
      }

      appPath = getCaideAppPath(app.path);

      // Call autofix with empty full response to just run TypeScript checking
      const problemReport = await generateProblemReport({
        fullResponse: "",
        appPath,
      });

      return problemReport;
    } catch (error) {
      const preconditionKind = getTypeCheckPreconditionKind(error);
      if (preconditionKind) {
        if (!appPath) {
          throw error;
        }

        const message = await getTypeCheckPreconditionGuidance({
          kind: preconditionKind,
          appPath,
        });
        logger.info("Type checking precondition failed:", message);
        throw new CaideError(message, CaideErrorKind.Precondition, {
          cause: error,
        });
      }

      logger.error("Error checking problems:", error);
      throw error;
    }
  });
}
