// FILE: ChatModeSelector.tsx
// Purpose: Composer chat-mode picker (build / ask / local-agent / plan). Mirrors
// dyad x caide's ChatModeSelector but on Synara's Base UI menu primitives. The
// chosen mode is stamped onto the thread.turn.start command so the engine can
// swap behavior: ask strips tools, plan single-shots with a plan prompt, and
// local-agent/build run the tooling loop.
// Layer: App composer presentation
// Depends on: shared composer menu primitives and icon glyphs.

import type { ChatMode } from "@caide/contracts";

import { cn } from "~/lib/utils";
import { AskIcon, BotIcon, HammerIcon, LightBulbIcon } from "~/lib/icons";
import { ComposerPickerMenuPopup } from "./ComposerPickerMenuPopup";
import { Menu, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "../ui/menu";

export const CHAT_MODE_ORDER: readonly ChatMode[] = ["local-agent", "plan", "build", "ask"];

export const CHAT_MODE_META: Record<
  ChatMode,
  { label: string; hint: string; Icon: typeof HammerIcon }
> = {
  "local-agent": {
    label: "Agent",
    hint: "Execute larger changes with project tools",
    Icon: BotIcon,
  },
  plan: {
    label: "Plan",
    hint: "Design before you build",
    Icon: LightBulbIcon,
  },
  build: {
    label: "Build",
    hint: "Generate and edit code",
    Icon: HammerIcon,
  },
  ask: {
    label: "Ask",
    hint: "Ask questions about the app",
    Icon: AskIcon,
  },
};

export function getChatModeDisplayName(mode: ChatMode): string {
  return CHAT_MODE_META[mode].label;
}

type ChatModeSelectorProps = {
  readonly mode: ChatMode;
  readonly onChatModeChange: (mode: ChatMode) => void;
  readonly className?: string;
};

export function ChatModeSelector({ mode, onChatModeChange, className }: ChatModeSelectorProps) {
  const meta = CHAT_MODE_META[mode];
  return (
    <Menu>
      <MenuTrigger
        render={
          <button
            type="button"
            data-testid="chat-mode-selector"
            aria-label={`Chat mode: ${meta.label}`}
            title={`Chat mode: ${meta.label} — switch to plan/ask/agent per turn`}
            className={cn(
              "shrink-0 cursor-pointer whitespace-nowrap rounded-md px-2 py-1 text-[length:var(--app-font-size-ui-sm,11px)] font-medium text-[var(--color-text-foreground-secondary)] transition-colors hover:bg-[var(--color-background-button-secondary-hover)] hover:text-[var(--color-text-foreground)]",
              className,
            )}
          >
            <span className="flex items-center gap-1.5">
              <meta.Icon className="size-3.5" />
              {meta.label}
            </span>
          </button>
        }
      >
        {null}
      </MenuTrigger>
      <ComposerPickerMenuPopup align="start" size="small">
        <MenuRadioGroup value={mode} onValueChange={(next) => next && onChatModeChange(next)}>
          {CHAT_MODE_ORDER.map((candidate) => {
            const candidateMeta = CHAT_MODE_META[candidate];
            return (
              <MenuRadioItem
                key={candidate}
                value={candidate}
                preserveChildLayout
                className="py-1.5"
              >
                <span className="flex flex-col items-start">
                  <span className="flex items-center gap-1.5">
                    <candidateMeta.Icon className="size-3.5 text-muted-foreground" />
                    <span className="font-medium">{candidateMeta.label}</span>
                  </span>
                  <span className="ml-[22px] text-xs text-[var(--color-text-foreground-secondary)]">
                    {candidateMeta.hint}
                  </span>
                </span>
              </MenuRadioItem>
            );
          })}
        </MenuRadioGroup>
      </ComposerPickerMenuPopup>
    </Menu>
  );
}
