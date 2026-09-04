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
  iconOnly?: boolean;
}

export function ChatModeSelector({ mode, onChatModeChange, iconOnly = false }: ChatModeSelectorProps) {
  const meta = CHAT_MODE_META[mode] || CHAT_MODE_META["local-agent"];
  const Icon = meta.Icon;

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <Select value={mode} onValueChange={(v) => v && onChatModeChange(v as ChatMode)}>
        <Tooltip>
          <TooltipTrigger
            render={
              <SelectPrimitive.Trigger
                data-testid="chat-mode-selector"
                aria-label={`Chat mode: ${meta.name}`}
                className={cn(
                  "cursor-pointer inline-flex items-center transition-all duration-150 outline-none select-none",
                  iconOnly
                    ? "h-7 w-7 justify-center p-0 rounded-lg border border-border/50 bg-background/50 hover:bg-muted/60"
                    : "h-7 px-2.5 py-0 text-xs font-medium gap-1.5 rounded-lg border border-border/50 bg-background/50 shadow-2xs hover:bg-muted/60",
                  mode === "local-agent"
                    ? "text-foreground/80 hover:text-foreground"
                    : mode === "plan"
                      ? "bg-blue-500/10 text-blue-600 border-blue-500/25 hover:bg-blue-500/15 dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-500/30 dark:hover:bg-blue-500/20"
                      : mode === "ask"
                        ? "bg-amber-500/10 text-amber-600 border-amber-500/25 hover:bg-amber-500/15 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30"
                        : "text-foreground/80 hover:text-foreground",
                )}
              />
            }
          >
            <SelectValue>
              <span className="flex items-center gap-1.5">
                <Icon size={14} className={mode === "plan" ? "text-blue-500" : mode === "ask" ? "text-amber-500" : undefined} />
                {!iconOnly && <span>{meta.name}</span>}
              </span>
            </SelectValue>
          </TooltipTrigger>
          <TooltipPopup>
            {iconOnly ? `Mode: ${meta.name} (Ctrl + . to toggle)` : "Open mode menu (Ctrl + . to toggle)"}
          </TooltipPopup>
        </Tooltip>
        <SelectPopup surface="composer" align="start">
          {CHAT_MODE_ORDER.map((m) => {
            const mMeta = CHAT_MODE_META[m];
            const MIcon = mMeta.Icon;
            return (
              <SelectItem key={m} value={m}>
                <div className="flex flex-col items-start py-0.5">
                  <div className="flex items-center gap-2">
                    <MIcon
                      size={14}
                      className={
                        m === "plan"
                          ? "text-blue-500"
                          : m === "ask"
                            ? "text-amber-500"
                            : "text-muted-foreground"
                      }
                    />
                    <span className="font-medium text-xs text-foreground">{mMeta.name}</span>
                  </div>
                  <span className="text-[11px] text-muted-foreground ml-[22px]">
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
