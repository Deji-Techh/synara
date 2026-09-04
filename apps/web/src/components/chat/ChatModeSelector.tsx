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
  ChevronDownIcon,
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
  effort?: string | null;
  iconOnly?: boolean;
}

export function ChatModeSelector({ mode, onChatModeChange, effort, iconOnly = false }: ChatModeSelectorProps) {
  const meta = CHAT_MODE_META[mode] || CHAT_MODE_META["local-agent"];
  const Icon = meta.Icon;
  const label = effort ? `${effort} · ${meta.name}` : meta.name;

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <Select value={mode} onValueChange={(v) => v && onChatModeChange(v as ChatMode)}>
        <Tooltip>
          <TooltipTrigger
            render={
              <SelectPrimitive.Trigger
                data-testid="chat-mode-selector"
                aria-label={`Chat mode: ${label}`}
                className={cn(
                  "cursor-pointer inline-flex items-center transition-all duration-150 outline-none select-none rounded-md",
                  iconOnly
                    ? "h-7 w-7 justify-center p-0 hover:bg-white/5"
                    : "h-7 min-h-7 px-2 py-0 text-xs font-normal gap-1.5 hover:bg-white/5 border-0 shadow-none bg-transparent text-muted-foreground/90 hover:text-foreground",
                  mode === "plan" && "text-blue-400 hover:text-blue-300",
                  mode === "ask" && "text-amber-400 hover:text-amber-300",
                )}
              />
            }
          >
            <SelectValue>
              <span className="flex items-center gap-1.5">
                <Icon size={14} className={mode === "plan" ? "text-blue-400" : mode === "ask" ? "text-amber-400" : "opacity-80"} />
                {!iconOnly && <span>{label}</span>}
                <ChevronDownIcon className="size-3 opacity-50 ml-0.5" />
              </span>
            </SelectValue>
          </TooltipTrigger>
          <TooltipPopup>
            {iconOnly ? `Mode: ${label} (Ctrl + . to toggle)` : "Open mode menu (Ctrl + . to toggle)"}
          </TooltipPopup>
        </Tooltip>
        <SelectPopup
          surface="composer"
          side="top"
          align="start"
          sideOffset={6}
          alignItemWithTrigger={false}
        >
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
