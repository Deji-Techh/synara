// FILE: index.ts
// Purpose: Barrel for the Dyad-transplant chat-history tools.

export {
  ALL_CHAT_HISTORY_TOOLS,
  executeExploreChatHistory,
  executeReadChat,
  executeSearchChats,
  exploreChatHistoryTool,
  readChatTool,
  readSessionLines,
  searchChatsTool,
} from "./chatHistoryTools.ts";
export {
  closeSearchIndex,
  indexSessionLines,
  searchIndexedSessions,
  type FtsHit,
} from "./chatSearchIndex.ts";
