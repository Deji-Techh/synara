import { ChatMode, ServerSettingsView } from "@caide/contracts";

export type ChatModeFallbackReason = "quota-exhausted";

export interface ChatModeResolution {
  mode: ChatMode;
  fallbackReason?: ChatModeFallbackReason;
}

export function normalizeStoredChatMode(
  mode: string | null | undefined,
): ChatMode | null {
  if (!mode) return null;
  const validModes: ChatMode[] = ["build", "ask", "local-agent", "plan"];
  if (validModes.includes(mode as ChatMode)) return mode as ChatMode;
  if (mode === "agent") return "build"; // legacy fallback
  return null;
}

export function getEffectiveDefaultChatMode(
  settings: ServerSettingsView,
): ChatMode {
  // simplified for the new app
  return "build";
}

export function getUnavailableChatModeReason({
  mode,
  settings,
}: {
  mode: ChatMode | null | undefined;
  settings: ServerSettingsView;
}): ChatModeFallbackReason | undefined {
  if (mode !== "local-agent") {
    return undefined;
  }
  return undefined;
}

export function resolveChatMode({
  storedChatMode,
  settings,
}: {
  storedChatMode: string | null | undefined;
  settings: ServerSettingsView;
}): ChatModeResolution {
  const chatMode = normalizeStoredChatMode(storedChatMode);
  const effectiveDefault = getEffectiveDefaultChatMode(settings);

  if (!chatMode) {
    return { mode: effectiveDefault };
  }

  const fallbackReason = getUnavailableChatModeReason({
    mode: chatMode,
    settings,
  });

  if (fallbackReason && effectiveDefault !== chatMode) {
    return { mode: effectiveDefault, fallbackReason };
  }

  return { mode: chatMode };
}
