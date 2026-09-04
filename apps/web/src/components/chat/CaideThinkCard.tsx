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
        className="group inline-flex items-center gap-1.5 py-0.5 px-1 rounded hover:bg-muted/35 transition-colors duration-150 cursor-pointer text-left"
      >
        <span className="text-[12px] font-medium text-muted-foreground group-hover:text-foreground/90 transition-colors">
          {isStreaming ? "Thinking..." : "Thought"}
        </span>
        <DisclosureChevron
          open={isExpanded}
          className="size-2.5 text-muted-foreground/50 group-hover:text-foreground/70 transition-transform"
        />
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
