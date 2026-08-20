import { AI_MESSAGES_SDK_VERSION, AiMessagesJsonV6 } from "@/db/schema";
import type { ModelMessage } from "ai";
import log from "electron-log";

const logger = log.scope("ai_messages_utils");

/**
 * Provider option keys that may contain itemId references to OpenAI's
 * server-side storage. These references become stale when items expire.
 */
const PROVIDER_KEYS_WITH_ITEM_ID = ["openai", "azure"] as const;

/**
 * Strip itemId from a content part's provider metadata.
 * Returns true if any itemId was stripped (mutates the part in place).
 */
function stripItemIdFromPart(part: Record<string, unknown>): boolean {
  let didStrip = false;
  for (const field of ["providerOptions", "providerMetadata"] as const) {
    const container = part[field];
    if (!container || typeof container !== "object") continue;

    const containerRecord = container as Record<string, Record<string, unknown>>;
    for (const key of PROVIDER_KEYS_WITH_ITEM_ID) {
      const providerData = containerRecord[key];
      if (providerData && typeof providerData === "object" && "itemId" in providerData) {
        delete providerData.itemId;
        didStrip = true;
        // Clean up empty provider data
        if (Object.keys(providerData).length === 0) {
          delete containerRecord[key];
        }
      }
    }
    // Clean up empty container
    if (Object.keys(containerRecord).length === 0) {
      delete part[field];
    }
  }
  return didStrip;
}

/**
 * Clean up a message's content parts for OpenAI compatibility:
 * 1. Strip itemId from provider metadata (prevents "Item with id not found" errors)
 * 2. Ensure tool-call input is always a valid object (prevents "LiteLLM sending empty string as input when converting OpenAI→Anthropic format")
 *
 * Reasoning parts are ALWAYS preserved here. Thinking-mode providers such as
 * DeepSeek require that a historical assistant turn which originally emitted
 * `reasoning_content` is replayed with that same `reasoning_content` echoed
 * back; dropping it surfaces "The reasoning_content in the thinking mode must
 * be passed back to the API." The old orphaned-reasoning filter (only for
 * OpenAI's Responses API) is intentionally removed so reasoning survives
 * round-tripping through `ai_messages_json`.
 *
 * Returns the original message if no changes were needed, or a new message with cleaned content.
 */
export function cleanMessage<T extends ModelMessage>(message: T): T {
  if (typeof message.content === "string" || !Array.isArray(message.content)) {
    return message;
  }

  const cleanedContent = [];
  let didModify = false;

  for (let i = 0; i < message.content.length; i++) {
    const part = message.content[i] as { type?: string } & Record<string, unknown>;

    // Strip itemId from provider metadata
    if (stripItemIdFromPart(part)) {
      didModify = true;
    }

    // Ensure tool-call input is always a valid object (prevents LiteLLM
    // sending empty string as a tool_ input when converting OpenAI→Anthropic format)
    if (part.type === "tool-call" && (!part.input || typeof part.input !== "object")) {
      part.input = {};
      didModify = true;
    }

    cleanedContent.push(part);
  }

  if (!didModify) {
    return message;
  }

  return { ...message, content: cleanedContent } as T;
}

function cleanMessages(messages: ModelMessage[]): ModelMessage[] {
  return messages.map(cleanMessage);
}

/**
 * Sanitize a message array so every `tool-call` is paired with its
 * `tool-result` before the history is sent to a provider.
 *
 * OpenAI (and compatible gateways) reject histories where an assistant
 * message contains `tool_calls` that have no following tool message:
 * `An assistant message with 'tool_calls' must be followed by tool messages
 * responding to each 'tool_call_id'. (insufficient tool messages following
 * tool_calls message)`.
 *
 * This can happen when:
 * - A turn is interrupted (user cancel / transient stream termination) after
 *   the model emitted tool calls but before the results were executed.
 * - A `stopWhen` predicate stops a step right after the tool calls were
 *   emitted, leaving the final step's tool results out of `response.messages`.
 * - A compaction boundary splits a tool-call/tool-result pair.
 *
 * The fix drops both sides of each unpaired pair: the dangling `tool-call`
 * content part (and any assistant message left empty by it) plus orphaned
 * `tool-result` parts that no longer respond to a kept call.
 *
 * It also guards two related "invalid turn" cases that thinking-mode providers
 * reject even without tool calls, so they are dropped universally:
 * - A message whose content is empty (e.g. `cleanMessage` turned a standalone
 *   orphaned `reasoning` part into `content: []`).
 * - An `assistant` message whose only content is `reasoning` (chain of
 *   thought), which has no usable output to follow.
 *
 * Pairs that are fully answered are left untouched. Returns the original array
 * if nothing needed changing.
 */
export function sanitizeToolCallMessages<T extends ModelMessage>(messages: T[]): T[] {
  if (messages.length === 0) return messages;

  // Every tool-call id declared by an assistant message.
  const declaredIds = new Set<string>();
  for (const message of messages) {
    if (message.role !== "assistant" || !Array.isArray(message.content)) {
      continue;
    }
    for (const part of message.content) {
      const p = part as { type?: string; toolCallId?: string };
      if (p.type === "tool-call" && p.toolCallId) {
        declaredIds.add(p.toolCallId);
      }
    }
  }

  // Tool results that actually answer a declared tool call.
  const answeredIds = new Set<string>();
  for (const message of messages) {
    if (message.role !== "tool" || !Array.isArray(message.content)) continue;
    for (const part of message.content) {
      const p = part as { type?: string; toolCallId?: string };
      if (p.type === "tool-result" && p.toolCallId && declaredIds.has(p.toolCallId)) {
        answeredIds.add(p.toolCallId);
      }
    }
  }

  const pairedIds = new Set<string>();
  for (const id of declaredIds) {
    if (answeredIds.has(id)) pairedIds.add(id);
  }

  let didModify = false;
  const sanitized: T[] = [];
  for (const message of messages) {
    if (
      (message.role === "assistant" || message.role === "tool") &&
      Array.isArray(message.content)
    ) {
      const content = message.content.filter((part) => {
        const p = part as { type?: string; toolCallId?: string };
        if (
          (message.role === "assistant" && p.type === "tool-call") ||
          (message.role === "tool" && p.type === "tool-result")
        ) {
          return p.toolCallId != null && pairedIds.has(p.toolCallId);
        }
        return true;
      });
      if (content.length !== message.content.length) {
        didModify = true;
      }
      if (content.length === 0) {
        // Dropping the last remaining part (or cleanMessage emptying a
        // standalone orphaned reasoning part) would orphan the message.
        // The length may be 0 both before and after, so mark the drop explicitly.
        didModify = true;
        continue;
      }
      if (message.role === "assistant") {
        // A chain-of-thought (`reasoning`) part only survives when it brings a
        // real output (text or a tool-call) to its provider. When removing an
        // unpaired tool-call leaves nothing behind but reasoning, the assistant
        // turn has no usable output and thinking-mode providers reject the
        // history with "reasoning_content ... must be passed back". Drop the
        // whole message rather than send a reasoning-only turn.
        const keepsOnlyReasoning = content.every(
          (part) => (part as { type?: string }).type === "reasoning",
        );
        if (keepsOnlyReasoning) {
          didModify = true;
          continue;
        }
      }
      sanitized.push({ ...message, content } as T);
    } else {
      sanitized.push(message);
    }
  }
  return didModify ? sanitized : messages;
}

/**
 * Sentinel injected as the reasoning text of assistant messages that lack a
 * reasoning part. Thinking-mode providers such as DeepSeek V4 reject a request
 * where some assistant messages carry `reasoning_content` and others don't
 * ("The reasoning_content in the thinking mode must be passed back to the API").
 * The AI SDK's openai-compatible provider only emits `reasoning_content` when
 * `reasoning.length > 0` (`reasoning_content: reasoning` guarded by a length
 * check), so an empty-string sentinel never reaches the wire — it must be
 * non-empty. A single space satisfies both the SDK and DeepSeek (which accepts
 * any present field, even empty).
 */
const REASONING_CONSISTENCY_SENTINEL = " ";

/**
 * Make every assistant message in a history carry a reasoning part when the
 * history is a thinking-mode conversation.
 *
 * DeepSeek V4's thinking mode rejects histories where assistant messages are
 * inconsistent about `reasoning_content` — if ANY assistant message in the
 * request has it, EVERY assistant message must have it. This breaks after
 * compaction: the compaction summary is stored as a plain assistant message
 * with no `ai_messages_json` (no reasoning part), while the in-flight tool-loop
 * assistant messages retain their reasoning parts. Mixing the two in one
 * request triggers the 400.
 *
 * When the history already contains at least one reasoning part (i.e. this is
 * a thinking-mode conversation), inject the sentinel into every other assistant
 * message. Non-assistant messages and histories without any reasoning parts are
 * left untouched. Returns the original array if nothing needed changing.
 */
export function ensureReasoningConsistency<T extends ModelMessage>(messages: T[]): T[] {
  const hasReasoning = messages.some(
    (m) =>
      m.role === "assistant" &&
      Array.isArray(m.content) &&
      m.content.some((part) => (part as { type?: string }).type === "reasoning"),
  );
  if (!hasReasoning) {
    return messages;
  }

  let didModify = false;
  const result = messages.map((m) => {
    if (m.role !== "assistant") {
      return m;
    }
    const content = Array.isArray(m.content) ? m.content : [{ type: "text", text: m.content }];
    if (content.some((part) => (part as { type?: string }).type === "reasoning")) {
      return m;
    }
    didModify = true;
    return {
      ...m,
      content: [...content, { type: "reasoning", text: REASONING_CONSISTENCY_SENTINEL }],
    } as T;
  });
  return didModify ? result : messages;
}

/** Maximum size in bytes for ai_messages_json (10MB) */
export const MAX_AI_MESSAGES_SIZE = 10_000_000;

/**
 * Check if ai_messages_json is within size limits and return the value to save.
 * Returns undefined if the messages exceed the size limit.
 */
export function getAiMessagesJsonIfWithinLimit(
  aiMessages: ModelMessage[],
): AiMessagesJsonV6 | undefined {
  if (!aiMessages || aiMessages.length === 0) {
    return undefined;
  }

  const payload: AiMessagesJsonV6 = {
    messages: aiMessages,
    sdkVersion: AI_MESSAGES_SDK_VERSION,
  };

  const jsonStr = JSON.stringify(payload);
  if (jsonStr.length <= MAX_AI_MESSAGES_SIZE) {
    return payload;
  }

  logger.warn(`ai_messages_json too large (${jsonStr.length} bytes), skipping save`);
  return undefined;
}

// Type for a message from the database used by parseAiMessagesJson
export type DbMessageForParsing = {
  id: number;
  role: string;
  content: string;
  aiMessagesJson: AiMessagesJsonV6 | ModelMessage[] | null;
};

/**
 * Parse ai_messages_json with graceful fallback to simple content reconstruction.
 * If aiMessagesJson is missing, malformed, or incompatible with the current AI SDK,
 * falls back to constructing a basic message from role and content.
 */
export function parseAiMessagesJson(msg: DbMessageForParsing): ModelMessage[] {
  if (msg.aiMessagesJson) {
    const parsed = msg.aiMessagesJson;

    // Legacy shape: stored directly as a ModelMessage[]
    if (Array.isArray(parsed) && parsed.every((m) => m && typeof m.role === "string")) {
      return cleanMessages(parsed);
    }

    if (
      parsed &&
      typeof parsed === "object" &&
      "sdkVersion" in parsed &&
      (parsed as AiMessagesJsonV6).sdkVersion === AI_MESSAGES_SDK_VERSION &&
      "messages" in parsed &&
      Array.isArray((parsed as AiMessagesJsonV6).messages) &&
      (parsed as AiMessagesJsonV6).messages.every(
        (m: ModelMessage) => m && typeof m.role === "string",
      )
    ) {
      return cleanMessages((parsed as AiMessagesJsonV6).messages);
    }
  }

  // Fallback for legacy messages, missing data, or incompatible formats
  return [
    {
      role: msg.role as "user" | "assistant",
      content: msg.content,
    },
  ];
}
