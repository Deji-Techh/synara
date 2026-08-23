import React, { useState } from "react";
import { CaideCard, CaideCardHeader, CaideCardContent, CaideStateIndicator, type ToolCardState } from "./CaideCardPrimitives";

interface CaideGenericToolCardProps {
  toolName: string;
  attributes?: Record<string, string>;
  content?: string;
  state?: ToolCardState;
}

const TOOL_ICONS: Record<string, string> = {
  "caide-read": "📄",
  "dyad-read": "📄",
  "caide-list-files": "📁",
  "dyad-list-files": "📁",
  "caide-grep": "🔍",
  "dyad-grep": "🔍",
  "caide-search-replace": "✂",
  "dyad-search-replace": "✂",
  "caide-multi-replace": "✂",
  "dyad-multi-replace": "✂",
  "caide-delete": "🗑",
  "dyad-delete": "🗑",
  "caide-rename": "🏷",
  "dyad-rename": "🏷",
  "caide-add-dependency": "📦",
  "dyad-add-dependency": "📦",
};

export const CaideGenericToolCard: React.FC<CaideGenericToolCardProps> = ({
  toolName,
  attributes = {},
  content = "",
  state = "complete",
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const icon = TOOL_ICONS[toolName] || "⚙";
  const displayTitle = toolName.replace(/^(caide-|dyad-)/, "").replace(/-/g, " ");
  const targetPath = attributes.path || attributes.file || attributes.packages || attributes.pattern || "";

  return (
    <CaideCard
      accentColor="gray"
      onClick={() => setIsExpanded(!isExpanded)}
      isExpanded={isExpanded}
    >
      <CaideCardHeader
        icon={<span className="text-xs">{icon}</span>}
      >
        <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
          <div className="truncate flex items-center gap-1.5">
            <span className="font-semibold capitalize text-foreground">{displayTitle}</span>
            {targetPath && (
              <span className="text-[11px] text-muted-foreground/80 font-mono truncate">
                {targetPath}
              </span>
            )}
          </div>
          <CaideStateIndicator state={state} />
        </div>
      </CaideCardHeader>
      {isExpanded && content && (
        <CaideCardContent>
          <pre className="p-2.5 rounded-lg bg-muted/40 font-mono text-[11px] overflow-x-auto text-foreground/80 max-h-60 select-text">
            {content}
          </pre>
        </CaideCardContent>
      )}
    </CaideCard>
  );
};
