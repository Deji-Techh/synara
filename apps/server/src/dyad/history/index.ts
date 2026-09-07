// FILE: index.ts
// Purpose: Barrel for the Dyad-transplant chat-history tools.

export {
  ALL_CHAT_HISTORY_TOOLS,
  executeExploreChatHistory,
  executeReadChat,
  executeSearchChats,
  exploreChatHistoryTool,
  readChatTool,
  searchChatsTool,
} from "./chatHistoryTools.ts";
export {
  keywordsOf,
  listSessionIds,
  readSessionLines,
  type LogLine,
} from "./chatHistoryFiles.ts";
export {
  closeSearchIndex,
  indexSessionLines,
  searchIndexedSessions,
  type FtsHit,
} from "./chatSearchIndex.ts";
