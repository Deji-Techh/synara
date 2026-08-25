import { toastManager } from "~/components/ui/toast";
import { type ChatMode } from "@caide/contracts";
import type { ChatModeFallbackReason } from "./chatMode";

export function getChatModeDisplayName(mode: ChatMode, isPro: boolean): string {
  switch (mode) {
    case "local-agent":
      return isPro ? "Agent" : "Basic Agent";
    case "plan":
      return "Plan";
    default:
      return "Agent";
  }
}

export function getChatModeFallbackToastId({
  chatId,
  reason,
  effectiveMode,
}: {
  chatId?: number;
  reason: ChatModeFallbackReason;
  effectiveMode: ChatMode;
}) {
  return chatId
    ? `chat-mode-fallback:${chatId}:${reason}:${effectiveMode}`
    : `chat-mode-fallback:${reason}:${effectiveMode}`;
}

export function showChatModeFallbackToast({
  effectiveMode,
  isPro,
  toastId,
}: {
  effectiveMode: ChatMode;
  isPro: boolean;
  toastId?: string;
}) {
  const modeName = getChatModeDisplayName(effectiveMode, isPro);
  const message = `Quota exhausted. Using ${modeName} mode.`;

  toastManager.add({
    type: "warning",
    title: message,
    timeout: 8000,
    actionProps: {
      children: "Switch mode",
      onClick: () => {
        const trigger = document.querySelector<HTMLElement>('[data-testid="chat-mode-selector"]');
        if (trigger) {
          trigger.focus();
          trigger.click();
          return;
        }

        toastManager.add({ type: "info", title: "Open a chat to switch modes.", timeout: 5000 });
      },
    },
  });
}
