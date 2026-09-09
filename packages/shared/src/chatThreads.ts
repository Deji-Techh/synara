// FILE: chatThreads.ts
// Purpose: Shared chat-thread title helpers used by web and server flows.
// Layer: Shared util
// Exports: generic title checks plus fallback/generated title sanitizers

export const GENERIC_CHAT_THREAD_TITLE = "New thread";
const MAX_CHAT_THREAD_TITLE_LENGTH = 60;
// Single source for the title word cap. Exported so the server-side title prompt
// (textGenerationShared.buildThreadTitlePrompt) derives its wording and fallback
// limits from the same number the sanitizers enforce here.
export const MAX_CHAT_THREAD_TITLE_WORDS = 6;

function normalizeTitleWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function trimTitleToken(token: string): string {
  return token.replace(/^[\s"'`([{]+|[\s"'`)\]}:;,.!?]+$/g, "");
}

function titleWords(value: string): string[] {
  return normalizeTitleWhitespace(value)
    .split(" ")
    .map(trimTitleToken)
    .filter((token) => token.length > 0);
}

export function truncateChatThreadTitle(
  text: string,
  maxLength = MAX_CHAT_THREAD_TITLE_LENGTH,
): string {
  const trimmed = normalizeTitleWhitespace(text);
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength)}...`;
}

// Build a short deterministic title while the model-generated rename is pending.
export function buildPromptThreadTitleFallback(message: string): string {
  const words = titleWords(message).slice(0, MAX_CHAT_THREAD_TITLE_WORDS);
  if (words.length === 0) {
    return GENERIC_CHAT_THREAD_TITLE;
  }
  return truncateChatThreadTitle(words.join(" "));
}

// Keep generated titles compact so the sidebar never renders sentence-length prompts.
export function sanitizeGeneratedThreadTitle(raw: string): string {
  const unquoted = normalizeTitleWhitespace(raw).replace(/^['"`]+|['"`]+$/g, "");
  const words = titleWords(unquoted).slice(0, MAX_CHAT_THREAD_TITLE_WORDS);
  if (words.length === 0) {
    return GENERIC_CHAT_THREAD_TITLE;
  }
  return truncateChatThreadTitle(words.join(" "));
}

export function isGenericChatThreadTitle(title: string | null | undefined): boolean {
  return normalizeTitleWhitespace(title ?? "") === GENERIC_CHAT_THREAD_TITLE;
}

// Titles a fresh chat carries before its AI-generated name lands. Covers the
// legacy harness defaults ("New Chat", "Home") plus empty strings so the
// sidebar can render a skeleton for any untitled thread.
const PENDING_CHAT_THREAD_TITLES = new Set(["New thread", "New Chat", "Home", ""]);

export function isPendingChatThreadTitle(title: string | null | undefined): boolean {
  return PENDING_CHAT_THREAD_TITLES.has(normalizeTitleWhitespace(title ?? ""));
}

// Deterministic last-resort label when no title model is available.
// `index` is the 1-based position of the chat within its project.
export function buildChatNumberFallbackTitle(index: number): string {
  const safeIndex = Number.isSafeInteger(index) && index > 0 ? index : 1;
  return `Chat ${safeIndex}`;
}

// Auto-created initial threads carry the deterministic `thread-<projectId>`
// id (see the project.create handler). The id match alone does not prove a
// row is disposable — callers must also verify it holds no messages/turns
// and that the project has surviving sibling chats before purging.
export function isPhantomInitialThreadId(
  threadId: string | null | undefined,
  projectId: string | null | undefined,
): boolean {
  if (!threadId || !projectId) {
    return false;
  }
  return threadId === `thread-${projectId}`;
}
