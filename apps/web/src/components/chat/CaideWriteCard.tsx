import React, { useState } from "react";
import { IconFileCode } from "@tabler/icons-react";
import { DisclosureChevron } from "~/components/ui/DisclosureChevron";
import {
  CaideCard,
  CaideCardHeader,
  CaideBadge,
  CaideLazyContent,
  CaideStateIndicator,
  CaideFilePath,
  CaideDescription,
  type ToolCardState,
} from "./CaideCardPrimitives";

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
    <div className="my-2 select-none">
      <CaideCard
        state={state}
        accent="success"
        onClick={() => setIsExpanded(!isExpanded)}
        isExpanded={isExpanded}
      >
        <CaideCardHeader icon={<IconFileCode size={14} />} accent="success">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <CaideBadge accent="success">Write</CaideBadge>
            <span className="truncate text-[12px] font-semibold tracking-tight text-foreground">
              {fileName}
            </span>
            {lineCount > 0 && (
              <span className="shrink-0 rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/60">
                {lineCount} lines
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <CaideStateIndicator state={state} pendingLabel="Writing..." />
            <DisclosureChevron
              open={isExpanded}
              className="h-3.5 w-3.5 text-muted-foreground/70 transition-colors group-hover:text-foreground"
            />
          </div>
        </CaideCardHeader>
        <CaideFilePath path={path} />
        {description && <CaideDescription>{description}</CaideDescription>}
        <CaideLazyContent open={isExpanded}>
          {content ? (
            <div className="overflow-hidden rounded-lg border border-border/50 bg-muted/30">
              <pre className="max-h-72 overflow-x-auto overflow-y-auto p-2.5 font-mono text-[11px] text-foreground/90 select-text">
                {content}
              </pre>
            </div>
          ) : (
            <div className="py-2 text-center text-[11px] text-muted-foreground italic">
              No content recorded
            </div>
          )}
        </CaideLazyContent>
      </CaideCard>
    </div>
  );
};
