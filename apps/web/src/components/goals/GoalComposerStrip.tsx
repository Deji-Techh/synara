// FILE: GoalComposerStrip.tsx
// Purpose: Compact active-goal strip for the composer area: live goal title,
//          status dot/label, progress bar, and pause/resume control. A click
//          opens the Goals right-dock pane via the onOpen callback (wired by
//          the owning surface). Reads the shared zustand goal store.
// Layer: Chat composer UI (goals)
// Note: Mounted by the composer surface that owns it — this file exports the
//       component only; no pane-opening logic lives here.

import { cn } from "~/lib/utils";
import { PauseIcon, PlayIcon } from "~/lib/icons";
import type { Goal } from "@caide/contracts";

import { IconButton } from "../ui/icon-button";
import { useGoalStore } from "~/goalStore";
import {
  GOAL_LIVE_STATUSES,
  GOAL_WORKING_STATUSES,
  goalStatusDotClass,
  goalStatusLabel,
} from "./goalStatus";

function ActiveGoalStrip(props: { goal: Goal; onOpen: (() => void) | undefined }) {
  const { goal, onOpen } = props;
  const store = useGoalStore();
  const paused = goal.status === "paused" || goal.status === "pausing";
  const isWorking = GOAL_WORKING_STATUSES.includes(goal.status);
  const pct =
    goal.totalTaskCount > 0
      ? Math.round((goal.verifiedTaskCount / goal.totalTaskCount) * 100)
      : 0;

  const handlePauseToggle = () => {
    if (paused) {
      void store.resumeGoal(goal.id);
    } else {
      void store.pauseGoal(goal.id);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen?.();
        }
      }}
      className="group flex w-full cursor-pointer items-center gap-2.5 rounded-lg border border-border/60 bg-background px-2.5 py-1.5 transition-colors hover:border-border hover:bg-accent/40"
    >
      <span className={cn("size-2 shrink-0 rounded-full", goalStatusDotClass(goal.status))} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[12px] font-medium text-foreground">{goal.title}</p>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {goalStatusLabel(goal.status)}
          </span>
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-300",
              goal.status === "completed"
                ? "bg-emerald-500"
                : goal.status === "blocked"
                  ? "bg-red-500"
                  : "bg-primary",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      {isWorking || paused ? (
        <IconButton
          size="icon-sm"
          variant="ghost"
          label={paused ? "Resume goal" : "Pause goal"}
          onClick={(event) => {
            event.stopPropagation();
            handlePauseToggle();
          }}
          className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          {paused ? <PlayIcon className="size-3.5" /> : <PauseIcon className="size-3.5" />}
        </IconButton>
      ) : null}
    </div>
  );
}

export function GoalComposerStrip(props: { onOpen?: () => void }) {
  const activeGoal = useGoalStore((state) => state.activeGoal);
  if (!activeGoal || !GOAL_LIVE_STATUSES.includes(activeGoal.status)) {
    return null;
  }
  return <ActiveGoalStrip goal={activeGoal} onOpen={props.onOpen} />;
}