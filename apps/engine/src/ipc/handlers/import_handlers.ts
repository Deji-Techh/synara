import fs from "node:fs";
import path from "node:path";
import { db } from "../../db";
import { apps, chats } from "../../db/schema";
import { eq } from "drizzle-orm";
import log from "electron-log";
import { createTypedHandler } from "./base";
import { importContracts } from "../types/import";
import { getCaideAppPath, isAppLocationAccessible } from "../../paths/paths";
import { CaideError, CaideErrorKind } from "@/errors/caide_error";
import { getInitialChatModeForNewChat } from "./chat_mode_resolution";
import { ensureCaideGitignored } from "./gitignoreUtils";

const logger = log.scope("import_handlers");

/**
 * Registers an existing folder as a Caide app without scaffolding or copying.
 * Used by the server adapter (M3) to map legacy folder-opened projects onto
 * engine chats so the local agent can work inside them.
 */
export function registerImportHandlers() {
  createTypedHandler(importContracts.importApp, async (_, params) => {
    const { path: rawPath, appName } = params;
    if (!path.isAbsolute(rawPath)) {
      throw new CaideError(
        `import-app: expected an absolute path, got "${rawPath}"`,
        CaideErrorKind.Validation,
      );
    }
    const fullAppPath = getCaideAppPath(rawPath);
    if (!isAppLocationAccessible(fullAppPath)) {
      throw new CaideError(
        `The path ${fullAppPath} is inaccessible. Please check your custom apps folder setting.`,
        CaideErrorKind.Validation,
      );
    }
    if (!fs.existsSync(fullAppPath)) {
      throw new CaideError(`App path does not exist: ${fullAppPath}`, CaideErrorKind.NotFound);
    }

    const existing = await db.query.apps.findFirst({
      where: eq(apps.path, rawPath),
    });
    if (existing) {
      const existingChat = await db.query.chats.findFirst({
        where: eq(chats.appId, existing.id),
      });
      return {
        appId: existing.id,
        chatId: existingChat?.id ?? (await createInitialChat(existing.id)),
      };
    }

    const [app] = await db
      .insert(apps)
      .values({
        name: appName,
        path: rawPath,
        needsAppBlueprint: false,
      })
      .returning();

    const chatId = await createInitialChat(app.id);

    await ensureCaideGitignored(fullAppPath).catch((error: unknown) =>
      logger.warn("import-app: ensureCaideGitignored failed:", error),
    );

    logger.info(`import-app: registered ${appName} at ${fullAppPath}`);
    return { appId: app.id, chatId };
  });

  createTypedHandler(importContracts.checkAppName, async (_, params) => {
    const fullAppPath = getCaideAppPath(params.appName);
    return { exists: fs.existsSync(fullAppPath) };
  });

  createTypedHandler(importContracts.checkAiRules, async (_, params) => {
    const rulesPath = path.join(params.path, "AI_RULES.md");
    return { exists: fs.existsSync(rulesPath) };
  });
}

async function createInitialChat(appId: number): Promise<number> {
  const initialChatMode = await getInitialChatModeForNewChat(undefined);
  const [chat] = await db.insert(chats).values({ appId, chatMode: initialChatMode }).returning();
  return chat.id;
}
