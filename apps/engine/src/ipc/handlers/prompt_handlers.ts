import log from "electron-log";
import { db } from "@/db";
import { appPrompts, prompts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createTypedHandler } from "./base";
import { promptContracts } from "../types/prompts";
import { CaideError, CaideErrorKind } from "@/errors/caide_error";

const _logger = log.scope("prompt_handlers");

const toPromptDto = (r: typeof prompts.$inferSelect) => ({
  id: r.id!,
  title: r.title,
  description: r.description,
  content: r.content,
  slug: r.slug,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

export function registerPromptHandlers() {
  createTypedHandler(promptContracts.list, async () => {
    const rows = db.select().from(prompts).all();
    return rows.map(toPromptDto);
  });

  createTypedHandler(promptContracts.listForApp, async (_, appId) => {
    const rows = db
      .select({ prompt: prompts })
      .from(appPrompts)
      .innerJoin(prompts, eq(appPrompts.promptId, prompts.id))
      .where(eq(appPrompts.appId, appId))
      .all();
    return rows.map((r) => toPromptDto(r.prompt));
  });

  createTypedHandler(promptContracts.setForApp, async (_, params) => {
    const { appId, promptIds } = params;
    db.delete(appPrompts).where(eq(appPrompts.appId, appId)).run();
    if (promptIds.length > 0) {
      db.insert(appPrompts)
        .values(promptIds.map((promptId) => ({ appId, promptId })))
        .run();
    }
  });

  createTypedHandler(promptContracts.appIdsForPrompt, async (_, promptId) => {
    const rows = db
      .select({ appId: appPrompts.appId })
      .from(appPrompts)
      .where(eq(appPrompts.promptId, promptId))
      .all();
    return rows.map((r) => r.appId);
  });

  createTypedHandler(promptContracts.setPromptApps, async (_, params) => {
    const { promptId, appIds } = params;
    db.delete(appPrompts).where(eq(appPrompts.promptId, promptId)).run();
    if (appIds.length > 0) {
      db.insert(appPrompts)
        .values(appIds.map((appId) => ({ appId, promptId })))
        .run();
    }
  });

  createTypedHandler(promptContracts.create, async (_, params) => {
    const { title, content, description, slug } = params;
    if (!title || !content) {
      throw new CaideError("Title and content are required", CaideErrorKind.External);
    }
    const result = db
      .insert(prompts)
      .values({
        title,
        description,
        content,
        slug: slug ?? null,
      })
      .run();

    const id = Number(result.lastInsertRowid);
    const row = db.select().from(prompts).where(eq(prompts.id, id)).get();
    if (!row) throw new Error("Failed to fetch created prompt");
    return {
      id: row.id!,
      title: row.title,
      description: row.description,
      content: row.content,
      slug: row.slug,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });

  createTypedHandler(promptContracts.update, async (_, params) => {
    const { id, title, content, description, slug } = params;
    if (!id) throw new Error("Prompt id is required");
    const now = new Date();
    const updateData: Record<string, any> = { updatedAt: now };
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (description !== undefined) updateData.description = description;
    if (slug !== undefined) updateData.slug = slug ?? null;
    db.update(prompts).set(updateData).where(eq(prompts.id, id)).run();
  });

  createTypedHandler(promptContracts.delete, async (_, id) => {
    if (!id) throw new Error("Prompt id is required");
    db.delete(prompts).where(eq(prompts.id, id)).run();
  });
}
