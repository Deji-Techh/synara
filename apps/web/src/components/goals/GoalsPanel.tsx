// FILE: GoalsPanel.tsx
// Purpose: Right-dock pane for Goals + Subagents. Reads goals/runs/activity from the
//          engine via the goalClient (WS `goals:subscribe` stream + list/get RPCs),
//          surfaces them through the zustand goal store, and issues CRUD/control
//          actions (create/edit/steer/pause/resume/cancel/retry/verify) through the
//          same client. The engine owns execution; this pane is a pure observer + controller.
// Layer: Chat right-dock UI (goals pane)

import { useEffect, useMemo, useState } from "react";

import { cn } from "~/lib/utils";
import {
  ArchiveIcon,
  BotIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  CircleCheckIcon,
  FlagIcon,
  ListTodoIcon,
  LoaderCircleIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  SteerIcon,
  XIcon,
} from "~/lib/icons";
import type {
  Goal,
  GoalActivityEvent,
  GoalRun,
  GoalStatus,
} from "@caide/contracts";

import { IconButton } from "../ui/icon-button";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

import { DockPaneHeader } from "../chat/DockPaneHeader";
import { PanelStateMessage } from "../chat/PanelStateMessage";
import { useGoalStore } from "~/goalStore";
import {
  GOAL_LIVE_STATUSES,
  GOAL_TERMINAL_STATUSES,
  GOAL_WORKING_STATUSES,
  activitySubagentLabel,
  activityToolLabel,
  goalRunKindLabel,
  goalRunStatusLabel,
  goalStatusDotClass,
  goalStatusLabel,
  goalStatusLabelClass,
  goalTaskStatusTone,
  formatGoalDateTime,
  formatGoalRelativeTime,
} from "./goalStatus";
import { subscribeGoalDomainEvents } from "~/lib/goalClient";

const TASK_STATUS_ORDER: Record<string, number> = {
  blocked: 0,
  "in-progress": 1,
  pending: 2,
  verified: 3,
  skipped: 4,
  cancelled: 5,
  "awaiting-approval": 6,
};

function GoalProgress(props: { goal: Goal }) {
  const { goal } = props;
  const pct =
    goal.totalTaskCount > 0
      ? Math.round((goal.verifiedTaskCount / goal.totalTaskCount) * 100)
      : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
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
      <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
        {pct}%
      </span>
    </div>
  );
}

function BlockerAlert(props: { goal: Goal }) {
  const blocker = props.goal.blocker;
  if (!blocker) return null;
  return (
    <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3">
      <div className="flex items-start gap-2">
        <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-red-500" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-foreground">Blocker</p>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            {blocker.reason}
          </p>
          {blocker.userAction ? (
            <p className="mt-1 text-[12px] text-foreground/80">
              Action: {blocker.userAction}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function OverviewTab(props: { goal: Goal }) {
  const { goal } = props;
  return (
    <div className="flex flex-col gap-3">
      <BlockerAlert goal={goal} />
      <div className="space-y-1.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Objective
        </p>
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">
          {goal.objective}
        </p>
      </div>
      <div className="space-y-1.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Definition of done
        </p>
        <ul className="space-y-1">
          {goal.definitionOfDone.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-[13px] text-foreground/85">
              <CircleCheckIcon className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-1.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Constraints
        </p>
        <ul className="space-y-1">
          {goal.constraints.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-[13px] text-foreground/85">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        {goal.constraints.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">No constraints set.</p>
        ) : null}
      </div>
    </div>
  );
}

function taskStatusIcon(status: string) {
  switch (status) {
    case "verified":
      return <CircleCheckIcon className="size-3.5 shrink-0 text-emerald-500" />;
    case "in-progress":
      return <LoaderCircleIcon className="size-3.5 shrink-0 animate-spin text-primary" />;
    case "blocked":
      return <CircleAlertIcon className="size-3.5 shrink-0 text-red-500" />;
    case "skipped":
      return <ArchiveIcon className="size-3.5 shrink-0 text-muted-foreground" />;
    case "cancelled":
      return <XIcon className="size-3.5 shrink-0 text-muted-foreground" />;
    default:
      return <span className="size-3.5 shrink-0 rounded-full border border-muted-foreground/40" />;
  }
}

function TasksTab(props: { goal: Goal }) {
  const tasks = useMemo(() => {
    return [...props.goal.tasks].sort((a, b) => {
      const statusDiff =
        (TASK_STATUS_ORDER[a.status] ?? 99) - (TASK_STATUS_ORDER[b.status] ?? 99);
      if (statusDiff !== 0) return statusDiff;
      return a.order - b.order;
    });
  }, [props.goal.tasks]);

  if (tasks.length === 0) {
    return (
<PanelStateMessage>
      <div className="flex flex-col items-center gap-1.5">
        <ListTodoIcon className="size-6 text-muted-foreground/60" />
        <span className="text-sm font-medium text-foreground/70">No tasks yet</span>
        <span className="text-xs text-muted-foreground">
          Tasks are broken out when the goal starts running.
        </span>
      </div>
    </PanelStateMessage>
    );
  }

  return (
    <div className="divide-y divide-border/60">
      {tasks.map((task) => (
        <div key={task.id} className="flex items-start gap-2.5 px-1 py-2">
          <span className="mt-px">{taskStatusIcon(task.status)}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-foreground">{task.title}</p>
            {task.description ? (
              <p className="text-[12px] text-muted-foreground">{task.description}</p>
            ) : null}
          </div>
          <Badge variant="outline" className={goalTaskStatusTone(task.status)}>
            {task.status}
          </Badge>
        </div>
      ))}
    </div>
  );
}

function runDotClass(status: GoalRun["status"]) {
  switch (status) {
    case "running":
      return "bg-primary";
    case "succeeded":
      return "bg-emerald-500";
    case "failed":
      return "bg-red-500";
    case "cancelled":
      return "bg-muted-foreground";
    default:
      return "bg-muted-foreground/60";
  }
}

function RunRow(props: { run: GoalRun }) {
  const { run } = props;
  return (
    <div className="flex items-start gap-2.5 px-1 py-2">
      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", runDotClass(run.status))} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-medium text-foreground">
            {goalRunKindLabel(run.kind)}
          </span>
          <Badge variant="outline" className={goalRunStatusLabelClass(run.status)}>
            {goalRunStatusLabel(run.status)}
          </Badge>
          <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
            #{run.attempt}
          </span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
          {run.prompt}
        </p>
      </div>
    </div>
  );
}

function ActivityRow(props: { event: GoalActivityEvent }) {
  const { event } = props;
  const subagent = activitySubagentLabel(event.metadata);
  const tool = activityToolLabel(event.metadata);
  return (
    <div className="flex items-start gap-2.5 px-1 py-2">
      {subagent ? (
        <BotIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[12px] leading-relaxed text-foreground/90">{event.summary}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {subagent ? subagent : null}
          {tool ? (
            <span className="ml-1.5 rounded bg-muted px-1 py-px font-mono text-[10px]">
              {tool}
            </span>
          ) : null}
          <span className="ml-1.5">{formatGoalRelativeTime(event.createdAt)}</span>
        </p>
      </div>
    </div>
  );
}

function SubagentsTab(props: { runs: GoalRun[]; events: GoalActivityEvent[] }) {
  const { runs, events } = props;
  const activityEvents = useMemo(
    () => [...events].sort((a, b) => b.createdAt - a.createdAt),
    [events],
  );

  if (runs.length === 0 && events.length === 0) {
    return (
      <PanelStateMessage>
        <div className="flex flex-col items-center gap-1.5">
          <BotIcon className="size-6 text-muted-foreground/60" />
          <span className="text-sm font-medium text-foreground/70">No subagent activity yet</span>
          <span className="text-xs text-muted-foreground">
            Subagent runs and tool activity will appear here as the goal executes.
          </span>
        </div>
      </PanelStateMessage>
    );
  }

  return (
    <div className="px-1">
      {runs.length > 0 ? (
        <div>
          <p className="sticky top-0 z-10 bg-background px-0 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Subagents
          </p>
          <div className="divide-y divide-border/60">
            {runs.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
          </div>
        </div>
      ) : null}
      {activityEvents.length > 0 ? (
        <div className="mt-3">
          <p className="sticky top-0 z-10 bg-background px-0 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Activity
          </p>
          <div className="divide-y divide-border/60">
            {activityEvents.map((event) => (
              <ActivityRow key={event.id} event={event} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EvidenceTab(props: { goal: Goal }) {
  const { goal } = props;
  const evidence = goal.evidence;
  if (!evidence || evidence.length === 0) {
    return (
<PanelStateMessage>
      <div className="flex flex-col items-center gap-1.5">
        <CheckCircle2Icon className="size-6 text-muted-foreground/60" />
        <span className="text-sm font-medium text-foreground/70">No evidence captured</span>
        <span className="text-xs text-muted-foreground">
          Failed checks and verification results will be listed here.
        </span>
      </div>
    </PanelStateMessage>
    );
  }
  return (
    <div className="space-y-2">
      {evidence.map((item) => (
        <div
          key={item.reference ?? item.label}
          className="flex items-start gap-2.5 rounded-md border border-border/60 p-2.5"
        >
          {item.passed ? (
            <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-500" />
          ) : (
            <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-red-500" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-[13px] font-medium text-foreground">{item.label}</p>
              <Badge
                variant={item.passed ? "default" : "destructive"}
                className={item.passed ? "!bg-emerald-500/15 !text-emerald-600" : undefined}
              >
                {item.passed ? "passed" : "failed"}
              </Badge>
            </div>
            {item.reference ? (
              <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                {item.reference}
              </p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function GoalList(props: {
  goals: Goal[];
  selectedId: string | null;
  onSelect: (goalId: string) => void;
}) {
  const { goals, selectedId, onSelect } = props;
  const ordered = useMemo(() => {
    return [...goals].sort((a, b) => {
      const liveDiff = Number(GOAL_LIVE_STATUSES.includes(a.status)) - Number(GOAL_LIVE_STATUSES.includes(b.status));
      if (liveDiff !== 0) return liveDiff;
      return b.createdAt - a.createdAt;
    });
  }, [goals]);

  return (
    <div className="divide-y divide-border/60">
      {ordered.map((goal) => {
        const selected = goal.id === selectedId;
        const isLive = GOAL_LIVE_STATUSES.includes(goal.status);
        return (
          <button
            key={goal.id}
            type="button"
            onClick={() => onSelect(goal.id)}
            className={cn(
              "flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors",
              selected ? "bg-accent/50" : "hover:bg-accent/40",
            )}
          >
            <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", goalStatusDotClass(goal.status))} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-[13px] font-medium text-foreground">{goal.title}</p>
                {isLive ? (
                  <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                ) : null}
              </div>
              <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                {goalStatusLabel(goal.status)}
                {goal.currentTask ? ` · ${goal.currentTask}` : ""}
              </p>
            </div>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {formatGoalRelativeTime(goal.updatedAt ?? goal.createdAt)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function GoalDetail(props: {
  goal: Goal;
  runs: GoalRun[];
  activity: GoalActivityEvent[];
  onEdit: () => void;
  onSteer: () => void;
}) {
  const { goal, runs, activity, onEdit, onSteer } = props;
  const store = useGoalStore();
  const [tab, setTab] = useState<"overview" | "tasks" | "subagents" | "evidence">("overview");
  const isLive = GOAL_LIVE_STATUSES.includes(goal.status);
  const isWorking = GOAL_WORKING_STATUSES.includes(goal.status);

  const handleCancel = () => {
    store.cancelGoal(goal.id, "Cancelled from goals pane");
  };
  const handlePauseToggle = () => {
    if (goal.status === "paused" || goal.status === "pausing") {
      store.resumeGoal(goal.id);
    } else {
      store.pauseGoal(goal.id);
    }
  };
  const handleRetry = () => {
    store.retryGoal(goal.id);
  };
  const handleVerify = () => {
    store.verifyGoal(goal.id);
  };

  const runActivity = useMemo(
    () => activity.filter((event) => event.goalId === goal.id),
    [activity, goal.id],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 px-3 pt-2">
        <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
          <span className={cn("size-2 shrink-0 rounded-full", goalStatusDotClass(goal.status))} />
          <span className="truncate">{goal.title}</span>
        </div>
        <Badge className={goalStatusLabelClass(goal.status)}>{goalStatusLabel(goal.status)}</Badge>
        <div className="ml-auto flex items-center gap-0.5">
          {isLive ? (
            <>
              <IconButton
                size="icon-sm"
                variant="ghost"
                label={goal.status === "paused" || goal.status === "pausing" ? "Resume" : "Pause"}
                onClick={handlePauseToggle}
              >
                {goal.status === "paused" || goal.status === "pausing" ? (
                  <PlayIcon className="size-3.5" />
                ) : (
                  <PauseIcon className="size-3.5" />
                )}
              </IconButton>
              <IconButton size="icon-sm" variant="ghost" label="Cancel goal" onClick={handleCancel}>
                <XIcon className="size-3.5" />
              </IconButton>
            </>
          ) : null}
          {isWorking || goal.status === "blocked" ? (
            <IconButton size="icon-sm" variant="ghost" label="Retry" onClick={handleRetry}>
              <RefreshCwIcon className="size-3.5" />
            </IconButton>
          ) : null}
          {isLive ? (
            <IconButton size="icon-sm" variant="ghost" label="Verify" onClick={handleVerify}>
              <CircleCheckIcon className="size-3.5" />
            </IconButton>
          ) : null}
          <IconButton size="icon-sm" variant="ghost" label="Edit goal" onClick={onEdit}>
            <PencilIcon className="size-3.5" />
          </IconButton>
          <IconButton size="icon-sm" variant="ghost" label="Steer" onClick={onSteer}>
            <SteerIcon className="size-3.5" />
          </IconButton>
        </div>
      </div>
      <div className="px-3 pb-2 pt-1.5">
        <GoalProgress goal={goal} />
      </div>
      <div className="flex gap-0.5 border-b border-border/60 px-2 pb-2">
        {(
          [
            ["overview", "Overview"],
            ["tasks", "Tasks"],
            ["subagents", "Subagents"],
            ["evidence", "Evidence"],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            size="sm"
            variant="ghost"
            className={cn(
              "text-[12px]",
              tab === key ? "bg-accent/60 text-foreground" : "text-muted-foreground",
            )}
            onClick={() => setTab(key)}
          >
            {label}
          </Button>
        ))}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-3">
          {tab === "overview" ? <OverviewTab goal={goal} /> : null}
          {tab === "tasks" ? <TasksTab goal={goal} /> : null}
          {tab === "subagents" ? (
            <SubagentsTab runs={runs} events={runActivity} />
          ) : null}
          {tab === "evidence" ? <EvidenceTab goal={goal} /> : null}
        </div>
      </ScrollArea>
    </div>
  );
}

function GoalEditorDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Goal;
  onSave: (input: {
    title?: string;
    objective: string;
    executionTarget?: "local" | "remote" | "hybrid";
    definitionOfDone?: string[];
    constraints?: string[];
  }) => void;
}) {
  const { open, onOpenChange, initial, onSave } = props;
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [target, setTarget] = useState<"local" | "remote" | "hybrid">("local");
  const [dod, setDod] = useState("");
  const [constraints, setConstraints] = useState("");

  useEffect(() => {
    if (open) {
      setTitle(initial?.title ?? "");
      setObjective(initial?.objective ?? "");
      setTarget(initial?.executionTarget ?? "local");
      setDod(initial?.definitionOfDone.join("\n") ?? "");
      setConstraints(initial?.constraints.join("\n") ?? "");
    }
  }, [open, initial]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      title: title.trim() || undefined,
      objective: objective.trim(),
      executionTarget: target,
      definitionOfDone: dod.split("\n").map((s) => s.trim()).filter(Boolean),
      constraints: constraints.split("\n").map((s) => s.trim()).filter(Boolean),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit goal" : "New goal"}</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-muted-foreground">Title</label>
            <input
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-primary"
              value={title}
              placeholder={initial ? undefined : "e.g. Fix checkout flow"}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-muted-foreground">
              Objective <span className="text-red-500">*</span>
            </label>
            <textarea
              className="min-h-16 w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-primary"
              value={objective}
              required
              onChange={(e) => setObjective(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-muted-foreground">Execution target</label>
            <Select value={target} onValueChange={(v) => setTarget(v as typeof target)}>
              <SelectTrigger className="w-full">
                <SelectValue>{target}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="center">
                <SelectItem value="local">local</SelectItem>
                <SelectItem value="hybrid">hybrid</SelectItem>
                <SelectItem value="remote">remote</SelectItem>
              </SelectPopup>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-muted-foreground">
              Definition of done (one per line)
            </label>
            <textarea
              className="min-h-16 w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-primary"
              value={dod}
              onChange={(e) => setDod(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-muted-foreground">
              Constraints (one per line)
            </label>
            <textarea
              className="min-h-12 w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-primary"
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
            />
          </div>
          <DialogFooter className="mt-4">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit">{initial ? "Save changes" : "Create goal"}</Button>
          </DialogFooter>
        </form>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}

export function GoalsPanel(props: { onClose?: () => void }) {
  const store = useGoalStore();
  const [createOpen, setCreateOpen] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [steerOpen, setSteerOpen] = useState(false);
  const [steerText, setSteerText] = useState("");

  const goals = store.goals;
  const selected = goals.find((goal) => goal.id === store.selectedGoalId) ?? goals[0] ?? null;
  const runs = selected ? store.runsByGoalId[selected.id] ?? [] : [];
  const activity = selected ? store.activityByGoalId[selected.id] ?? [] : [];

  useEffect(() => {
    void store.refresh();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeGoalDomainEvents((event) => {
      store.handleDomainEvent(event);
    });
    const poll = window.setInterval(() => {
      void store.refresh();
    }, 4_000);
    return () => {
      unsubscribe();
      window.clearInterval(poll);
    };
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DockPaneHeader
        title={<span className="flex items-center gap-2"><FlagIcon className="size-4 text-muted-foreground" /> Goals</span>}
        onClose={props.onClose}
        actions={
          <IconButton size="icon-sm" variant="ghost" label="New goal" onClick={() => setCreateOpen(true)}>
            <PlusIcon className="size-3.5" />
          </IconButton>
        }
      />
      {store.loading && goals.length === 0 ? (
        <PanelStateMessage>
          <div className="flex flex-col items-center gap-1.5">
            <LoaderCircleIcon className="size-6 animate-spin text-muted-foreground/60" />
            <span className="text-sm font-medium text-foreground/70">Loading goals…</span>
          </div>
        </PanelStateMessage>
      ) : goals.length === 0 ? (
        <PanelStateMessage>
          <div className="flex flex-col items-center gap-1.5">
            <FlagIcon className="size-6 text-muted-foreground/60" />
            <span className="text-sm font-medium text-foreground/70">No goals yet</span>
            <span className="text-xs text-muted-foreground">
              Goals let the engine plan and execute work autonomously.
            </span>
            <Button size="sm" className="mt-2" onClick={() => setCreateOpen(true)}>
              <PlusIcon className="mr-1.5 size-3.5" />
              New goal
            </Button>
          </div>
        </PanelStateMessage>
      ) : (
        <div className="grid h-full min-h-0 grid-cols-[220px_minmax(0,1fr)]">
          <div className="min-h-0 border-r border-border/60">
            <ScrollArea className="h-full">
              <GoalList goals={goals} selectedId={store.selectedGoalId} onSelect={store.selectGoal} />
            </ScrollArea>
          </div>
          <div className="min-h-0">
            {selected ? (
              <GoalDetail
                goal={selected}
                runs={runs}
                activity={activity}
                onEdit={() => setEditGoal(selected)}
                onSteer={() => setSteerOpen(true)}
              />
            ) : (
              <PanelStateMessage>
                <div className="flex flex-col items-center gap-1.5">
                  <FlagIcon className="size-6 text-muted-foreground/60" />
                  <span className="text-sm font-medium text-foreground/70">Select a goal</span>
                </div>
              </PanelStateMessage>
            )}
          </div>
        </div>
      )}

      <GoalEditorDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSave={(input) => {
          void store.createGoal(input);
        }}
      />
      <GoalEditorDialog
        open={editGoal !== null}
        onOpenChange={(open) => {
          if (!open) setEditGoal(null);
        }}
        initial={editGoal ?? undefined}
        onSave={(input) => {
          if (editGoal) void store.editGoal({ goalId: editGoal.id, ...input });
        }}
      />

      <Dialog open={steerOpen} onOpenChange={setSteerOpen}>
        <DialogPopup className="w-full max-w-md">
          <DialogHeader>
            <DialogTitle>Steer goal</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <textarea
              className="min-h-24 w-full resize-y rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-primary"
              placeholder="Adjust course: refine the objective, add constraints, or redirect execution…"
              value={steerText}
              onChange={(e) => setSteerText(e.target.value)}
            />
            <DialogFooter className="mt-4">
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                disabled={!steerText.trim()}
                onClick={() => {
                  if (selected) {
                    void store.steerGoal(selected.id, steerText.trim());
                    setSteerText("");
                    setSteerOpen(false);
                  }
                }}
              >
                Steer
              </Button>
            </DialogFooter>
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </div>
  );
}