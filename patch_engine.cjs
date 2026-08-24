const fs = require("fs");
const path = "apps/server/src/provider/Layers/EngineAdapter.ts";
let content = fs.readFileSync(path, "utf-8");

const oldCode = `        let chatId: number | null = chatFromCreate;
        if (chatId === null) {
          const chatsResponse = yield* Effect.tryPromise({
            try: () => client.dyadInvoke<Array<Record<string, unknown>>>("get-chats", appId),
            catch: (cause) => processError(context.threadId, "engine get-chats failed", cause),
          });
          chatId =
            Array.isArray(chatsResponse) &&
            chatsResponse.length > 0 &&
            typeof chatsResponse[0]?.id === "number"
              ? chatsResponse[0].id
              : null;
        }
        if (chatId === null) {
          const createChatResponse = yield* Effect.tryPromise({
            try: () => client.dyadInvoke<{ chatId: number }>("create-chat", appId, 120_000),
            catch: (cause) => processError(context.threadId, "engine create-chat failed", cause),
          });
          chatId = createChatResponse?.chatId ?? null;
        }`;

const newCode = `        let chatId: number | null = chatFromCreate;
        
        const threadOpt = yield* projectionThreadRepo.getById({ threadId: context.threadId });
        const threadRow = Option.getOrNull(threadOpt);
        
        if (chatId === null && threadRow !== null && typeof threadRow.engineChatId === "number") {
          chatId = threadRow.engineChatId;
        }

        if (chatId === null) {
          const createChatResponse = yield* Effect.tryPromise({
            try: () => client.dyadInvoke<{ chatId: number }>("create-chat", appId, 120_000),
            catch: (cause) => processError(context.threadId, "engine create-chat failed", cause),
          });
          chatId = createChatResponse?.chatId ?? null;
          
          if (chatId !== null && threadRow !== null) {
            yield* projectionThreadRepo.upsert({ ...threadRow, engineChatId: chatId });
          }
        }`;

if (!content.includes(oldCode)) {
  console.log("Could not find old code in EngineAdapter!");
} else {
  content = content.replace(oldCode, newCode);
  fs.writeFileSync(path, content, "utf-8");
  console.log("Patched EngineAdapter!");
}
