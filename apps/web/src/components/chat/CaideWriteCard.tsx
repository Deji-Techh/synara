import React, { useState } from "react";
import { CaideCard, CaideCardHeader, CaideCardContent, CaideStateIndicator, type ToolCardState } from "./CaideCardPrimitives";

interface CaideWriteCardProps {
  path?: string | undefined;
  description?: string | undefined;
  content?: string | undefined;
  state?: ToolCardState | undefined;
}

export const CaideWriteCard: React.FC<CaideWriteCardProps> = ({
  path = "",
  description,
  content = "",
  state = "complete",
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const fileName = path ? path.split("/").pop() : "File";
  const lineCount = content ? content.split("\n").length : 0;

  return (
    <CaideCard
      accentColor="blue"
      onClick={() => setIsExpanded(!isExpanded)}
      isExpanded={isExpanded}
    >
      <CaideCardHeader
        icon={
          <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        }
      >
        <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
          <div className="truncate flex items-center gap-1.5">
            <span className="font-semibold text-foreground">{fileName}</span>
            <span className="text-[11px] text-muted-foreground/70 truncate">{path}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {lineCount > 0 && (
              <span className="text-[10px] text-muted-foreground/60 px-1.5 py-0.5 rounded bg-muted/50 font-mono">
                {lineCount} lines
              </span>
            )}
            <CaideStateIndicator state={state} pendingLabel="Writing..." />
          </div>
        </div>
      </CaideCardHeader>
      {description && (
        <div className="px-3.5 pb-2 text-[11px] text-muted-foreground">
          {description}
        </div>
      )}
      {isExpanded && content && (
        <CaideCardContent>
          <pre className="p-2.5 rounded-lg bg-muted/40 font-mono text-[11px] overflow-x-auto text-foreground/90 max-h-72 select-text">
            {content}
          </pre>
        </CaideCardContent>
      )}
    </CaideCard>
  );
};
