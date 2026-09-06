// FILE: chatMode.ts
// Purpose: Pure chat-mode resolution for turns (stored vs requested vs
// default + legacy normalization). Donor pattern:
// src/ipc/handlers/chat_mode_resolution.ts + lib/chatMode.ts — Pro gates
// (free-Pro build/model compatibility, subscription settings, env-var
// presence) intentionally dropped (free-entirely); the stored/requested/
// default precedence and legacy normalization are kept.

/** Modes the runner accepts on turn start. */
export type TurnChatMode = "build" | "ask" | "agent" | "plan";

/**
 * Normalize a stored or requested mode. Returns null for unknown values
 * (caller falls back to default). Legacy "local-agent" is preserved as-is;
 * "build" stays "build" (runner maps it to the local-agent engine).
 */
export function normalizeStoredChatMode(value: unknown): TurnChatMode | null {
  if (value === "build" || value === "ask" || value === "agent" || value === "plan") {
    return value;
  }
  if (value === "local-agent") return "agent";
  return null;
}

export type ChatModeSource = "requested" | "stored" | "default";

export interface ChatModeResolution {
  mode: TurnChatMode;
  source: ChatModeSource;
}

/**
 * Resolve the mode for a turn. Requested wins over stored; unknown values
 * fall through to the next source; default is "agent".
 */
export function resolveChatModeForTurn(options: {
  storedChatMode?: string | null;
  requestedChatMode?: string | null;
  defaultMode?: TurnChatMode;
}): ChatModeResolution {
  const fallback = options.defaultMode ?? "agent";
  const requested = normalizeStoredChatMode(options.requestedChatMode ?? null);
  if (requested) return { mode: requested, source: "requested" };
  const stored = normalizeStoredChatMode(options.storedChatMode ?? null);
  if (stored) return { mode: stored, source: "stored" };
  return { mode: fallback, source: "default" };
}

/** Initial mode for a new chat (passthrough; null defers to the default). */
export function getInitialChatModeForNewChat(
  initialChatMode?: TurnChatMode | null,
): TurnChatMode | null {
  return initialChatMode ?? null;
}
