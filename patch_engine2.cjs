const fs = require("fs");
const path = "apps/server/src/provider/Layers/EngineAdapter.ts";
let content = fs.readFileSync(path, "utf-8");

content = content.replace(
  "const threadOpt = yield* projectionThreadRepo.getById({ threadId: context.threadId });",
  "const threadOpt = yield* projectionThreadRepo.getById({ threadId: context.threadId }).pipe(Effect.catchAll(() => Effect.succeed(Option.none())));",
);

content = content.replace(
  "yield* projectionThreadRepo.upsert({ ...threadRow, engineChatId: chatId });",
  "yield* projectionThreadRepo.upsert({ ...threadRow, engineChatId: chatId }).pipe(Effect.catchAll(() => Effect.succeed(undefined)));",
);

fs.writeFileSync(path, content, "utf-8");
console.log("Patched EngineAdapter again!");
