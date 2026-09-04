// FILE: CaideThinkCard.tsx
// Purpose: Claude Code style thinking card with smooth reveal and shared disclosure motion.
// Layer: Web chat presentation component

import React, { useState } from "react";
import { IconSparkles } from "@tabler/icons-react";
import { useSmoothStreamedText } from "~/hooks/useSmoothStreamedText";
import { DisclosureChevron } from "~/components/ui/DisclosureChevron";
import { DisclosureRegion } from "~/components/ui/DisclosureRegion";

interface CaideThinkCardProps {
  content: string;
  isStreaming?: boolean;
}

export const CaideThinkCard: React.FC<CaideThinkCardProps> = ({ content, isStreaming = false }) => {
  const [isExpanded, setIsExpanded] = useState(isStreaming);
  const smoothedContent = useSmoothStreamedText(content, isStreaming);

  return (
    <div className="my-1 select-none">
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="group flex items-center justify-between gap-2 px-1.5 py-1 rounded-md hover:bg-muted/35 transition-colors duration-150 cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0">
          <IconSparkles
            size={13}
            className={`${
              isStreaming
                ? "text-amber-500 dark:text-amber-400 animate-spin"
                : "text-muted-foreground/60 group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors"
            }`}
          />
          <span className="text-[12px] text-muted-foreground group-hover:text-foreground transition-colors">
            {isStreaming ? (
              <span className="inline-flex items-center gap-1">
                <span>Thinking</span>
                <span className="animate-pulse">...</span>
              </span>
            ) : (
              "Thinking process"
            )}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground/50 group-hover:text-muted-foreground font-mono">
            {isExpanded ? "hide" : "show"}
          </span>
          <DisclosureChevron
            open={isExpanded}
            className="w-3 h-3 text-muted-foreground/40 group-hover:text-foreground transition-colors"
          />
        </div>
      </div>

      <DisclosureRegion open={isExpanded}>
        <div className="mt-1 ml-3 pl-3 py-1 border-l border-border/50">
          <div className="font-mono text-[11px] text-muted-foreground/80 leading-relaxed italic whitespace-pre-wrap select-text">
            {smoothedContent || <span className="opacity-50">Contemplating approach...</span>}
          </div>
        </div>
      </DisclosureRegion>
    </div>
  );
};
