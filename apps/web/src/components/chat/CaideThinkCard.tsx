// FILE: CaideThinkCard.tsx
// Purpose: Collapsible "thinking" card. While streaming it stays open and the content
//          reveals at the same smooth cadence as the answer text; when the turn settles
//          it collapses with the shared disclosure motion.
// Layer: Web chat presentation component

import React, { useState } from "react";
import { useSmoothStreamedText } from "~/hooks/useSmoothStreamedText";
import { DisclosureChevron } from "~/components/ui/DisclosureChevron";
import { DisclosureRegion } from "~/components/ui/DisclosureRegion";
import { CaideCard, CaideCardContent, CaideCardHeader } from "./CaideCardPrimitives";

interface CaideThinkCardProps {
  content: string;
  isStreaming?: boolean;
}

export const CaideThinkCard: React.FC<CaideThinkCardProps> = ({ content, isStreaming = false }) => {
  const [isExpanded, setIsExpanded] = useState(isStreaming);
  // Same reveal engine as the answer text, so thinking content flows instead of
  // jumping in ~100ms clumps. No-ops (returns full content) when not streaming.
  const smoothedContent = useSmoothStreamedText(content, isStreaming);

  return (
    <CaideCard
      accentColor="gray"
      onClick={() => setIsExpanded(!isExpanded)}
      isExpanded={isExpanded}
      className="bg-muted/20 border-border/40"
    >
      <CaideCardHeader
        icon={
          <svg
            className="w-3.5 h-3.5 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        }
      >
        <div className="flex-1 flex items-center justify-between">
          <span className="text-[11px] font-medium text-muted-foreground">
            {isStreaming ? "Thinking..." : "Thought process"}
          </span>
          <DisclosureChevron open={isExpanded} className="w-3 h-3 text-muted-foreground/60" />
        </div>
      </CaideCardHeader>
      <DisclosureRegion open={isExpanded}>
        <CaideCardContent className="text-muted-foreground/80 font-mono text-[11px] leading-relaxed whitespace-pre-wrap select-text">
          {smoothedContent}
        </CaideCardContent>
      </DisclosureRegion>
    </CaideCard>
  );
};