// FILE: EngineSubagentStrip.tsx
// Purpose: Live rows for engine-registered subagents (spawn_subagent tasks)
// stacked above the composer, mirroring ComposerSubagentStrip's visual
// language. Unlike provider-native subagents these have no navigable thread —
// rows show role, task snippet and live status only.
// Layer: Chat composer UI
// Exports: EngineSubagentStrip

import { useEffect } from "react";
import { pluralize } from "@caide/shared/text";

import {
  useEngineSubagentStore,
  ensureEngineSubagentSubscription,
} from "~/engineSubagentStore";
import { BotIcon, LoaderIcon } from "~/lib/icons";
import {
  subagentStatusDotClassName,
  subagentStatusTextToneClassName,
  type SubagentStatusKind,
} from "~/lib/subagentPresentation";
import { cn } from "~/lib/utils";
import { DisclosureRegion } from "../ui/DisclosureRegion";
import {
  ComposerStackedPanelHeaderRow,
  ComposerStackedPanelRowLabel,
  ComposerStackedPanelRowMain,
} from "./ComposerStackedPanelContent";
import { ComposerStackedPanel } from "./ComposerStackedPanel";
import {
  COMPOSER_STACKED_PANEL_BODY_PADDING_CLASS_NAME,
  COMPOSER_STACKED_PANEL_ICON_BUTTON_CLASS_NAME,
  COMPOSER_STACKED_PANEL_ICON_CLASS_NAME,
  COMPOSER_STACKED_PANEL_SCROLL_REGION_CLASS_NAME,
} from "./composerStackedPanelStyles";
import { Button } from "../ui/button";
import { PanelCollapseIcon, PanelExpandIcon } from "~/lib/icons";

const STATUS_KIND: Record<"running" | "completed" | "failed", SubagentStatusKind> = {
  running: "running",
  completed: "completed",
  failed: "failed",
};

const STATUS_LABEL: Record<"running" | "completed" | "failed", string> = {
  running: "Running…",
  completed: "Completed",
  failed: "Failed",
};

interface EngineSubagentStripProps {
  compact: boolean;
  onCompactChange: (compact: boolean) => void;
  attachedToPrevious?: boolean;
}

export const EngineSubagentStrip = function EngineSubagentStrip({
  compact,
  onCompactChange,
  attachedToPrevious: attachedToPreviousProp,
}: EngineSubagentStripProps) {
  const subagents = useEngineSubagentStore((state) => state.subagents);
  useEffect(() => ensureEngineSubagentSubscription(), []);

  if (subagents.length === 0) {
    return null;
  }
  const attachedToPrevious = attachedToPreviousProp ?? false;
  const runningCount = subagents.filter((row) => row.status === "running").length;

  return (
    <ComposerStackedPanel
      passthroughSideMargins
      attachedToPrevious={attachedToPrevious}
      data-testid="engine-subagent-strip"
    >
      <ComposerStackedPanelHeaderRow>
        <ComposerStackedPanelRowMain>
          {compact && runningCount > 0 ? (
            <LoaderIcon className={cn(COMPOSER_STACKED_PANEL_ICON_CLASS_NAME, "animate-spin")} />
          ) : (
            <BotIcon className={COMPOSER_STACKED_PANEL_ICON_CLASS_NAME} />
          )}
          <ComposerStackedPanelRowLabel tone="meta">
            {runningCount > 0
              ? `${runningCount} of ${subagents.length} engine ${pluralize(subagents.length, "subagent")} running`
              : `${subagents.length} engine ${pluralize(subagents.length, "subagent")}`}
          </ComposerStackedPanelRowLabel>
        </ComposerStackedPanelRowMain>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className={cn("shrink-0", COMPOSER_STACKED_PANEL_ICON_BUTTON_CLASS_NAME)}
          onClick={() => onCompactChange(!compact)}
          aria-label={compact ? "Expand engine subagent strip" : "Collapse engine subagent strip"}
          title={compact ? "Expand engine subagent strip" : "Collapse engine subagent strip"}
        >
          {compact ? (
            <PanelExpandIcon className="size-3" />
          ) : (
            <PanelCollapseIcon className="size-3" />
          )}
        </Button>
      </ComposerStackedPanelHeaderRow>

      <DisclosureRegion open={!compact}>
        <div
          className={cn(
            "space-y-0",
            COMPOSER_STACKED_PANEL_BODY_PADDING_CLASS_NAME,
            COMPOSER_STACKED_PANEL_SCROLL_REGION_CLASS_NAME,
          )}
        >
          {subagents.map((row) => (
            <div
              key={row.taskId}
              data-testid="engine-subagent-row"
              data-status={row.status}
              className="-mx-1 flex w-[calc(100%+0.5rem)] min-w-0 items-center gap-2 rounded-md px-1 py-1"
              title={row.task}
            >
              {row.status === "running" ? (
                <LoaderIcon className="size-3 shrink-0 animate-spin text-primary" />
              ) : (
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    subagentStatusDotClassName(STATUS_KIND[row.status]),
                  )}
                />
              )}
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground/85">
                <span>{row.role}</span>
                <span className="ml-1.5 text-[11px] font-normal text-muted-foreground/45">
                  {row.task}
                </span>
              </span>
              <span
                className={cn(
                  "shrink-0 text-[11px]",
                  subagentStatusTextToneClassName(STATUS_KIND[row.status]),
                )}
              >
                {STATUS_LABEL[row.status]}
              </span>
            </div>
          ))}
        </div>
      </DisclosureRegion>
    </ComposerStackedPanel>
  );
};
