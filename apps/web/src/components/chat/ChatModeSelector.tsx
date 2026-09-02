import React from "react";
import { type ChatMode } from "@caide/contracts";
import { cn } from "~/lib/utils";
import { Select, SelectPopup, SelectItem, SelectValue } from "~/components/ui/select";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Tooltip, TooltipTrigger, TooltipPopup } from "~/components/ui/tooltip";
import {
  BotIcon as Bot,
  LightBulbIcon as Lightbulb,
  AskIcon,
  HammerIcon as Hammer,
} from "~/lib/icons";

export const CHAT_MODE_ORDER: ChatMode[] = ["local-agent", "plan", "build", "ask"];

export const CHAT_MODE_META: Record<
  ChatMode,
  { name: string; description: string; Icon: React.ElementType }
> = {
  "local-agent": {
    name: "Agent",
    description: "Execute larger changes with project tools",
    Icon: Bot,
  },
  plan: {
    name: "Plan",
    description: "Design before you build",
    Icon: Lightbulb,
  },
  ask: {
    name: "Ask",
    description: "Q&A only — no file edits",
    Icon: AskIcon,
  },
  build: {
    name: "Build",
    description: "Legacy alias for Agent",
    Icon: Hammer,
  },
};

export function getChatModeDisplayName(mode: ChatMode): string {
  return CHAT_MODE_META[mode]?.name || "Agent";
}

interface ChatModeSelectorProps {
  mode: ChatMode;
  onChatModeChange: (mode: ChatMode) => void;
}

export function ChatModeSelector({ mode, onChatModeChange }: ChatModeSelectorProps) {
  const meta = CHAT_MODE_META[mode] || CHAT_MODE_META["local-agent"];
  const Icon = meta.Icon;

  return (
    <div className="flex items-center gap-1.5">
      <Select value={mode} onValueChange={(v) => v && onChatModeChange(v as ChatMode)}>
        <Tooltip>
          <TooltipTrigger
            render={
              <SelectPrimitive.Trigger
                data-testid="chat-mode-selector"
                aria-label={`Chat mode: ${meta.name}`}
                className={cn(
                  "cursor-pointer inline-flex items-center w-fit px-2 py-0 h-7 text-xs font-medium border-none shadow-none gap-1 rounded-lg transition-colors outline-none",
                  mode === "local-agent"
                    ? "text-foreground/80 hover:text-foreground hover:bg-muted/60"
                    : mode === "plan"
                      ? "bg-blue-500/10 text-blue-600 hover:bg-blue-500/15 dark:bg-blue-500/15 dark:text-blue-400 dark:hover:bg-blue-500/20"
                      : "text-foreground/80 hover:text-foreground hover:bg-muted/60",
                )}
              />
            }
          >
            <SelectValue>
              <span className="flex items-center gap-1.5">
                <Icon size={14} />
                {meta.name}
              </span>
            </SelectValue>
          </TooltipTrigger>
          <TooltipPopup>Open mode menu (Ctrl + . to toggle)</TooltipPopup>
        </Tooltip>
        <SelectPopup surface="composer" align="start">
          {CHAT_MODE_ORDER.map((m) => {
            const mMeta = CHAT_MODE_META[m];
            const MIcon = mMeta.Icon;
            return (
              <SelectItem key={m} value={m}>
                <div className="flex flex-col items-start">
                  <div className="flex items-center gap-1.5">
                    <MIcon
                      size={14}
                      className={m === "plan" ? "text-blue-500" : "text-muted-foreground"}
                    />
                    <span className="font-medium">{mMeta.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground ml-[22px]">
                    {mMeta.description}
                  </span>
                </div>
              </SelectItem>
            );
          })}
        </SelectPopup>
      </Select>
    </div>
  );
}
