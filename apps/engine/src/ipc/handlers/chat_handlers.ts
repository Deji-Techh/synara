import { db } from "../../db";
import { apps, chats, messages } from "../../db/schema";
import { desc, eq, and, like } from "drizzle-orm";
import type { ChatSearchResult, ChatSummary } from "../../lib/schemas";

import log from "electron-log";
import { CaideError, CaideErrorKind } from "@/errors/caide_error";
import { getCaideAppPath } from "../../paths/paths";
import { getCurrentCommitHash } from "../utils/git_utils";
import { createTypedHandler } from "./base";
import { chatContracts } from "../types/chat";
import { getInitialChatModeForNewChat, normalizeStoredChatMode } from "./chat_mode_resolution";
import { rendererMessageColumns, toRendererMessage } from "../utils/renderer_chat_message";
import { backgroundTaskRegistry } from "../utils/background_task_registry";

const logger = log.scope("chat_handlers");

export function registerChatHandlers() {
  createTypedHandler(chatContracts.createChat, async (_, input) => {
    const { appId, initialChatMode } =
      typeof input === "number" ? { appId: input, initialChatMode: undefined } : input;

    // Get the app's path first
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId),
      columns: {
        path: true,
      },
    });

    if (!app) {
      throw new CaideError("App not found", CaideErrorKind.NotFound);
    }

    let initialCommitHash = null;
    try {
      // Get the current git revision of the currently checked-out branch
      initialCommitHash = await getCurrentCommitHash({
        path: getCaideAppPath(app.path),
      });
    } catch (error) {
      logger.error("Error getting git revision:", error);
      // Continue without the git revision
    }

    const chatMode = await getInitialChatModeForNewChat(initialChatMode);

    // Create a new chat
    const [chat] = await db
      .insert(chats)
      .values({
        appId,
        initialCommitHash,
        chatMode,
      })
      .returning();
    logger.info(
      "Created chat:",
      chat.id,
      "for app:",
      appId,
      "with initial commit hash:",
      initialCommitHash,
    );
    return chat.id;
  });

  createTypedHandler(chatContracts.forkChat, async (_, input) => {
    const { chatId: sourceChatId, messageId: targetMessageId } = input;

    // Get source chat
    const sourceChat = await db.query.chats.findFirst({
      where: eq(chats.id, sourceChatId),
    });
    if (!sourceChat) throw new CaideError("Chat not found", CaideErrorKind.NotFound);

    // Get messages to copy
    const sourceMessages = await db.query.messages.findMany({
      where: eq(messages.chatId, sourceChatId),
      orderBy: (messages, { asc }) => [asc(messages.id)],
    });

    // Find the cutoff point
    let messagesToCopy = sourceMessages;
    if (targetMessageId !== undefined) {
      const targetIndex = sourceMessages.findIndex((m) => m.id === targetMessageId);
      if (targetIndex === -1) {
        throw new CaideError("Target message not found in chat", CaideErrorKind.NotFound);
      }
      messagesToCopy = sourceMessages.slice(0, targetIndex + 1);
    }

    return await db.transaction(async (tx) => {
      // Create new chat
      const [newChat] = await tx
        .insert(chats)
        .values({
          appId: sourceChat.appId,
          title: sourceChat.title ? `${sourceChat.title} (Fork)` : null,
          initialCommitHash: sourceChat.initialCommitHash,
          chatMode: sourceChat.chatMode,
        })
        .returning();

      // Copy messages
      if (messagesToCopy.length > 0) {
        await tx.insert(messages).values(
          messagesToCopy.map((m) => ({
            chatId: newChat.id,
            role: m.role,
            content: m.content,
            approvalState: m.approvalState,
            sourceCommitHash: m.sourceCommitHash,
            commitHash: m.commitHash,
            requestId: m.requestId,
            maxTokensUsed: m.maxTokensUsed,
            model: m.model,
            aiMessagesJson: m.aiMessagesJson,
            usingFreeAgentModeQuota: m.usingFreeAgentModeQuota,
            isCompactionSummary: m.isCompactionSummary,
            createdAt: m.createdAt,
          })),
        );
      }

      return newChat.id;
    });
  });

  createTypedHandler(chatContracts.getChat, async (_, chatId) => {
    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
      columns: {
        id: true,
        appId: true,
        title: true,
        initialCommitHash: true,
        chatMode: true,
      },
      with: {
        messages: {
          columns: rendererMessageColumns,
          orderBy: (messages, { asc }) => [asc(messages.createdAt)],
        },
      },
    });

    if (!chat) {
      throw new CaideError("Chat not found", CaideErrorKind.NotFound);
    }

    return {
      id: chat.id,
      appId: chat.appId,
      title: chat.title ?? "",
      initialCommitHash: chat.initialCommitHash,
      chatMode: normalizeStoredChatMode(chat.chatMode),
      messages: chat.messages.map(toRendererMessage),
    };
  });

  createTypedHandler(chatContracts.getChatMetadata, async (_, chatId) => {
    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
      columns: {
        id: true,
        appId: true,
        title: true,
        createdAt: true,
        chatMode: true,
      },
    });

    if (!chat) {
      throw new CaideError("Chat not found", CaideErrorKind.NotFound);
    }

    return {
      id: chat.id,
      appId: chat.appId,
      title: chat.title,
      createdAt: chat.createdAt,
      chatMode: normalizeStoredChatMode(chat.chatMode),
    };
  });

  createTypedHandler(chatContracts.getChats, async (_, appId) => {
    // If appId is provided, filter chats for that app
    const query = appId
      ? db.query.chats.findMany({
          where: eq(chats.appId, appId),
          columns: {
            id: true,
            title: true,
            createdAt: true,
            appId: true,
            chatMode: true,
          },
          orderBy: [desc(chats.createdAt)],
        })
      : db.query.chats.findMany({
          columns: {
            id: true,
            title: true,
            createdAt: true,
            appId: true,
            chatMode: true,
          },
          orderBy: [desc(chats.createdAt)],
        });

    const allChats = await query;
    return allChats.map((chat) => ({
      ...chat,
      chatMode: normalizeStoredChatMode(chat.chatMode),
    })) satisfies ChatSummary[];
  });

  createTypedHandler(chatContracts.deleteChat, async (_, chatId) => {
    await db.delete(chats).where(eq(chats.id, chatId));
  });

  createTypedHandler(chatContracts.updateChat, async (_, params) => {
    const { chatId, title, chatMode } = params;
    const updates: Partial<typeof chats.$inferInsert> = {};
    if (title !== undefined) {
      updates.title = title;
    }
    if (chatMode !== undefined) {
      updates.chatMode = chatMode;
    }
    if (Object.keys(updates).length === 0) {
      return;
    }
    await db.update(chats).set(updates).where(eq(chats.id, chatId));
  });

  createTypedHandler(chatContracts.deleteMessages, async (_, chatId) => {
    await db.delete(messages).where(eq(messages.chatId, chatId));
  });

  createTypedHandler(chatContracts.runSilentAgent, async (_, params) => {
    const { appId, prompt, title } = params;

    const taskId = `task_${Math.random().toString(36).substring(2, 9)}`;
    backgroundTaskRegistry.registerTask(taskId, title || "Silent Auto-Fix Agent", "running");

    try {
      // Find the most recent active chat for this app or create a new one
      let chat = await db.query.chats.findFirst({
        where: eq(chats.appId, appId),
        orderBy: [desc(chats.createdAt)],
      });

      if (!chat) {
        const [newChat] = await db
          .insert(chats)
          .values({
            appId,
            title: title || "Code Doctor Diagnostics",
            chatMode: "local-agent",
          })
          .returning();
        chat = newChat;
      }

      // Record the repair prompt into messages table so user sees it in the active project chat
      await db.insert(messages).values({
        chatId: chat.id,
        role: "user",
        content: prompt,
        createdAt: new Date(),
      });

      backgroundTaskRegistry.updateTaskStatus(taskId, "completed");
    } catch (err) {
      logger.error("Error running silent agent:", err);
      backgroundTaskRegistry.updateTaskStatus(taskId, "failed");
    }

    return { success: true };
  });

  createTypedHandler(chatContracts.searchChats, async (_, params) => {
    const { appId, query } = params;
    // 1) Find chats by title and map to ChatSearchResult with no matched message
    const chatTitleMatches = await db
      .select({
        id: chats.id,
        appId: chats.appId,
        title: chats.title,
        createdAt: chats.createdAt,
      })
      .from(chats)
      .where(and(eq(chats.appId, appId), like(chats.title, `%${query}%`)))
      .orderBy(desc(chats.createdAt))
      .limit(10);

    const titleResults: ChatSearchResult[] = chatTitleMatches.map((c) => ({
      id: c.id,
      appId: c.appId,
      title: c.title,
      createdAt: c.createdAt,
      matchedMessageContent: null,
    }));

    // 2) Find messages that match and join to chats to build one result per message
    const messageResults = await db
      .select({
        id: chats.id,
        appId: chats.appId,
        title: chats.title,
        createdAt: chats.createdAt,
        matchedMessageContent: messages.content,
      })
      .from(messages)
      .innerJoin(chats, eq(messages.chatId, chats.id))
      .where(and(eq(chats.appId, appId), like(messages.content, `%${query}%`)))
      .orderBy(desc(chats.createdAt))
      .limit(10);

    // Combine: keep title matches and per-message matches
    const combined: ChatSearchResult[] = [...titleResults, ...messageResults];
    const uniqueChats = Array.from(new Map(combined.map((item) => [item.id, item])).values());

    // Sort newest chats first
    uniqueChats.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return uniqueChats;
  });

  logger.debug("Registered chat IPC handlers");
}
