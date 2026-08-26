import { useState, type CSSProperties } from "react";
import {
  buildCollapsedProposedPlanPreviewMarkdown,
  proposedPlanTitle,
  stripDisplayedPlanMarkdown,
} from "../../proposedPlan";
import ChatMarkdown from "../ChatMarkdown";
import { Button } from "../ui/button";
import { cn } from "~/lib/utils";
import { Badge } from "../ui/badge";
import { ProposedPlanActions } from "./ProposedPlanActions";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { toastManager } from "../ui/toast";

export const ProposedPlanCard = function ProposedPlanCard({
  planMarkdown,
  cwd,
  workspaceRoot,
  chatTypographyStyle,
  threadId,
  onApprovePlan,
}: {
  planMarkdown: string;
  cwd: string | undefined;
  workspaceRoot: string | undefined;
  chatTypographyStyle?: CSSProperties;
  threadId?: string;
  onApprovePlan?: (text: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const title = proposedPlanTitle(planMarkdown) ?? "Proposed plan";
  const lineCount = planMarkdown.split("\n").length;
  const canCollapse = planMarkdown.length > 900 || lineCount > 20;
  const displayedPlanMarkdown = stripDisplayedPlanMarkdown(planMarkdown);
  const collapsedPreview = canCollapse
    ? buildCollapsedProposedPlanPreviewMarkdown(planMarkdown, { maxLines: 10 })
    : null;
  const { copyToClipboard } = useCopyToClipboard<void>({
    onCopy: () => toastManager.add({ type: "success", title: "Approval text copied — paste and send" }),
  });
  const approvalText = "Approved — proceed to build. Please call exit_plan with confirmation:true and start implementation.";
  const handleApprove = () => {
    if (onApprovePlan) {
      onApprovePlan(approvalText);
    } else {
      copyToClipboard(approvalText, undefined);
      toastManager.add({ type: "success", title: "Plan approved — paste in composer and send" });
    }
  };
  const handleRequestChanges = () => {
    if (onApprovePlan) {
      onApprovePlan("Request changes: ");
    } else {
      copyToClipboard("Request changes: ", undefined);
    }
  };
  void threadId;
  return (
    <div className="rounded-[24px] border border-border/80 bg-card/70 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant="secondary">Plan</Badge>
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
        </div>
        <ProposedPlanActions planMarkdown={planMarkdown} workspaceRoot={workspaceRoot} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" data-scroll-anchor-ignore onClick={handleApprove} className="bg-blue-600 text-white hover:bg-blue-700">
          Approve & Build
        </Button>
        <Button size="sm" variant="outline" data-scroll-anchor-ignore onClick={handleRequestChanges}>
          Request changes
        </Button>
      </div>
      <div className="mt-4">
        <div className={cn("relative", canCollapse && !expanded && "max-h-104 overflow-hidden")}>
          {canCollapse && !expanded ? (
            <ChatMarkdown
              text={collapsedPreview ?? ""}
              cwd={cwd}
              isStreaming={false}
              style={chatTypographyStyle}
            />
          ) : (
            <ChatMarkdown
              text={displayedPlanMarkdown}
              cwd={cwd}
              isStreaming={false}
              style={chatTypographyStyle}
            />
          )}
          {canCollapse && !expanded ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-card/95 via-card/80 to-transparent" />
          ) : null}
        </div>
        {canCollapse ? (
          <div className="mt-4 flex justify-center">
            <Button
              size="sm"
              variant="outline"
              data-scroll-anchor-ignore
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "Collapse plan" : "Expand plan"}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
};
