import React, { useState } from "react";
import { CaideCard, CaideCardHeader, CaideCardContent } from "./CaideCardPrimitives";

interface CaideThinkCardProps {
  content: string;
  isStreaming?: boolean;
}

export const CaideThinkCard: React.FC<CaideThinkCardProps> = ({
  content,
  isStreaming = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(isStreaming);

  return (
    <CaideCard
      accentColor="gray"
      onClick={() => setIsExpanded(!isExpanded)}
      isExpanded={isExpanded}
      className="bg-muted/20 border-border/40"
    >
      <CaideCardHeader
        icon={
          <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        }
      >
        <div className="flex-1 flex items-center justify-between">
          <span className="text-[11px] font-medium text-muted-foreground">
            {isStreaming ? "Thinking..." : "Thought process"}
          </span>
          <span className="text-[10px] text-muted-foreground/60">
            {isExpanded ? "Collapse ▲" : "Expand ▼"}
          </span>
        </div>
      </CaideCardHeader>
      {isExpanded && (
        <CaideCardContent className="text-muted-foreground/80 font-mono text-[11px] leading-relaxed whitespace-pre-wrap select-text">
          {content}
        </CaideCardContent>
      )}
    </CaideCard>
  );
};
