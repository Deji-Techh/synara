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
        
        const caideDir = typeof appPath === "string" ? require("path").join(appPath, ".caide") : null;
        const chatsFile = caideDir ? require("path").join(caideDir, "engine_chats.json") : null;
        let threadChatMap = {};
        if (chatsFile && require("fs").existsSync(chatsFile)) {
          try {
            threadChatMap = JSON.parse(require("fs").readFileSync(chatsFile, "utf-8"));
            if (typeof threadChatMap[context.threadId] === "number") {
              chatId = threadChatMap[context.threadId];
            }
          } catch (e) {}
        }

        if (chatId === null) {
          const createChatResponse = yield* Effect.tryPromise({
            try: () => client.dyadInvoke<{ chatId: number }>("create-chat", appId, 120_000),
            catch: (cause) => processError(context.threadId, "engine create-chat failed", cause),
          });
          chatId = createChatResponse?.chatId ?? null;
          
          if (chatId !== null && chatsFile) {
            try {
              if (!require("fs").existsSync(caideDir)) require("fs").mkdirSync(caideDir, { recursive: true });
              threadChatMap[context.threadId] = chatId;
              require("fs").writeFileSync(chatsFile, JSON.stringify(threadChatMap, null, 2));
            } catch (e) {}
          }
        }`;

content = content.replace(oldCode, newCode);
fs.writeFileSync(path, content, "utf-8");
console.log("Patched EngineAdapter again!");
