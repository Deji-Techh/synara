// FILE: SidebarConversationHoverCard.tsx
// Purpose: Rich hover details card for conversation rows in the sidebar (Caide style).

import { FolderIcon, ClockIcon } from "~/lib/icons";
import { FrameworkIcon } from "./FrameworkIcon";
import { ThreadRunningSpinner } from "./ThreadRunningSpinner";
import { resolveSidebarDotColorClass } from "~/lib/sidebarStatusColors";
import type { SidebarCompletionDotColor } from "~/appSettings";
import type { ProjectFramework } from "@caide/contracts";
import { cn } from "~/lib/utils";

export interface SidebarConversationHoverCardProps {
  title: string;
  projectName: string;
  projectFramework?: ProjectFramework;
  isWorking: boolean;
  statusLabel?: string;
  updatedAt?: string;
  completionDotColor?: SidebarCompletionDotColor;
}

export function SidebarConversationHoverCard(props: SidebarConversationHoverCardProps) {
  const {
    title,
    projectName,
    projectFramework,
    isWorking,
    statusLabel = isWorking ? "Running" : "Completed",
    updatedAt,
    completionDotColor,
  } = props;

  const dotColorClass = resolveSidebarDotColorClass(completionDotColor);

  return (
    <div className="flex w-64 flex-col gap-2 rounded-xl border border-white/10 bg-[#121215]/95 p-3 text-xs shadow-2xl backdrop-blur-xl">
      {/* Title */}
      <div className="font-semibold text-white leading-snug break-words">
        {title || "Untitled Conversation"}
      </div>

      <div className="space-y-1.5 pt-1 border-t border-white/5 text-[11px] text-muted-foreground">
        {/* Project info */}
        <div className="flex items-center gap-1.5 truncate">
          {projectFramework && projectFramework !== "blank" ? (
            <FrameworkIcon framework={projectFramework} size={13} className="shrink-0" />
          ) : (
            <FolderIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
          )}
          <span className="truncate text-foreground/80">{projectName}</span>
        </div>

        {/* Live status */}
        <div className="flex items-center gap-1.5">
          {isWorking ? (
            <>
              <ThreadRunningSpinner className="size-3 text-sky-400" />
              <span className="font-medium text-sky-400">{statusLabel}</span>
            </>
          ) : (
            <>
              <span className={cn("size-1.5 rounded-full shrink-0 shadow-xs", dotColorClass)} />
              <span className="text-muted-foreground/80">{statusLabel}</span>
            </>
          )}
        </div>

        {/* Updated timestamp */}
        {updatedAt && (
          <div className="flex items-center gap-1.5 text-muted-foreground/60">
            <ClockIcon className="size-3 shrink-0" />
            <span>Updated {updatedAt}</span>
          </div>
        )}
      </div>
    </div>
  );
}
