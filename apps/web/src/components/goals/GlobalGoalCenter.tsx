import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtom, useSetAtom } from "./stubs";
import {
  CheckCircle2,
  Circle,
  Clock3,
  ExternalLink,
  Loader2,
  Pause,
  Play,
  ShieldCheck,
  Target,
  XCircle,
  Info,
  ListTodo,
} from "lucide-react";
import { goalCenterAtom, type GoalCenterTab } from "./stubs";
import { selectedAppIdAtom } from "./stubs";
import {
// ipc,
  type Goal,
  type GoalActivityEvent,
  type GoalStatus,
} from "@caide/contracts";
import { BUILTIN_SLASH_COMMANDS } from "./stubs";
import { cn } from "@/lib/utils";
import { showError, showInfo } from "./stubs";
import { ipc } from "./stubs";
import { router } from "@/router";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const LIVE_STATUSES: GoalStatus[] = [
  "draft",
  "active",
  "running",
  "pausing",
  "paused",
  "verifying",
  "repairing",
  "blocked",
  "awaiting-user",
];

function statusLabel(status: GoalStatus): string {
  return status.replace(/-/g, " ");
}

function statusTone(status: GoalStatus): string {
  if (status === "completed") return "text-emerald-600 dark:text-emerald-400";
  if (status === "blocked" || status === "awaiting-user")
    return "text-amber-600 dark:text-amber-400";
  if (status === "cancelled") return "text-destructive";
  if (status === "paused" || status === "pausing")
    return "text-muted-foreground";
  return "text-primary";
}

function GoalProgress({ goal }: { goal: Goal }) {
  const denominator = Math.max(1, goal.totalTaskCount);
  const percent = Math.round((goal.verifiedTaskCount / denominator) * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {goal.verifiedTaskCount} / {goal.totalTaskCount} tasks verified
        </span>
        <span className="font-bold">{percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-secondary/50 inset-shadow-sm">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-[width] duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function GoalComposerStrip({ appId }: { appId: number | null }) {
  const [goal, setGoal] = useState<Goal | null>(null);
  const setCenter = useSetAtom(goalCenterAtom);

  const refresh = useCallback(async () => {
    setGoal(await ipc.goal.getActiveGoal({ appId: appId ?? 0 }));
  }, [appId]);

  useEffect(() => {
    void refresh();
    const unsubscribe = ipc.events.goal.onUpdated(({ goal: updated }) => {
      if (!appId || updated.appId === appId) void refresh();
    });
    const interval = setInterval(() => void refresh(), 4_000);
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [appId, refresh]);

  if (!goal) return null;
  return (
    <button
      type="button"
      className="w-full border-b border-border bg-primary/[0.04] px-3 py-2 text-left hover:bg-primary/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      onClick={() =>
        setCenter({
          open: true,
          appId: goal.appId,
          goalId: goal.id,
          tab: "overview",
          createObjective: null,
        })
      }
    >
      <div className="flex items-center gap-2">
        <Target className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {goal.title}
        </span>
        <span className={cn("text-xs capitalize", statusTone(goal.status))}>
          {statusLabel(goal.status)}
        </span>
      </div>
      <div className="mt-1 truncate pl-6 text-xs text-muted-foreground">
        {goal.currentTask ?? goal.currentPhase ?? "Preparing the next task"}
      </div>
    </button>
  );
}

function GoalCreateForm({
  appId,
  initialObjective,
  onCreated,
}: {
  appId: number;
  initialObjective?: string | null;
  onCreated: (goal: Goal) => void;
}) {
  const [objective, setObjective] = useState(initialObjective ?? "");
  const [definition, setDefinition] = useState("");
  const [creating, setCreating] = useState(false);
  const submit = async () => {
    if (!objective.trim()) return;
    setCreating(true);
    try {
      const goal = await ipc.goal.createGoal({
        appId,
        objective: objective.trim(),
        definitionOfDone: definition
          .split(/\r?\n/)
          .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
          .filter(Boolean),
        constraints: [
          "Preserve existing architecture and unrelated user changes.",
          "Do not use placeholders or claim completion without current evidence.",
          "Continue automatically through implementation, testing, repair and verification.",
        ],
        executionTarget: "local",
      });
      onCreated(goal);
      showInfo("Goal activated. Background execution has started.");
    } catch (error) {
      showError(error);
    } finally {
      setCreating(false);
    }
  };
  return (
    <div className="space-y-5">
      <div>
        <label
          className="mb-1.5 flex items-center gap-2 text-sm font-medium text-foreground"
          htmlFor="goal-objective"
        >
          <Target className="size-4 text-primary" />
          Objective
        </label>
        <textarea
          id="goal-objective"
          value={objective}
          onChange={(event) => setObjective(event.target.value)}
          placeholder="Build and verify the complete application until it is production-ready."
          className="min-h-28 w-full resize-y rounded-xl border border-border bg-muted/20 px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary focus:bg-background focus:ring-4 focus:ring-primary/10"
        />
      </div>
      <div>
        <label
          className="mb-1.5 flex items-center gap-2 text-sm font-medium text-foreground"
          htmlFor="goal-definition"
        >
          <ListTodo className="size-4 text-primary" />
          Additional definition of done
        </label>
        <textarea
          id="goal-definition"
          value={definition}
          onChange={(event) => setDefinition(event.target.value)}
          placeholder={
            "One criterion per line. Leave blank to use CAIDE’s production-ready defaults."
          }
          className="min-h-24 w-full resize-y rounded-xl border border-border bg-muted/20 px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary focus:bg-background focus:ring-4 focus:ring-primary/10"
        />
      </div>
      <div className="flex gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm leading-relaxed text-foreground/80 shadow-sm">
        <Info className="mt-0.5 size-5 shrink-0 text-primary" />
        <p>
          The local runner continues while CAIDE is open or minimized, survives
          project and chat switching, and automatically resumes after restart.
          Work while the computer is powered off requires a connected remote
          runner.
        </p>
      </div>
      <Button
        onClick={submit}
        disabled={creating || !objective.trim()}
        className="w-full rounded-xl py-6 font-medium shadow-sm transition-all active:scale-[0.98]"
      >
        {creating ? (
          <Loader2 className="mr-2 size-5 animate-spin" />
        ) : (
          <Target className="mr-2 size-5" />
        )}
        Activate goal
      </Button>
    </div>
  );
}

function GoalEditForm({
  goal,
  onSaved,
}: {
  goal: Goal;
  onSaved: (goal: Goal) => void;
}) {
  const [objective, setObjective] = useState(goal.objective);
  const [definition, setDefinition] = useState(
    goal.definitionOfDone.join("\n"),
  );
  const [constraints, setConstraints] = useState(goal.constraints.join("\n"));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const updated = await ipc.goal.editGoal({
        goalId: goal.id,
        objective: objective.trim(),
        definitionOfDone: definition
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean),
        constraints: constraints
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean),
      });
      onSaved(updated);
      showInfo("Goal contract updated and execution reconciled.");
    } catch (error) {
      showError(error);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium">Objective</label>
        <textarea
          value={objective}
          onChange={(event) => setObjective(event.target.value)}
          className="min-h-28 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium">
          Definition of done
        </label>
        <textarea
          value={definition}
          onChange={(event) => setDefinition(event.target.value)}
          className="min-h-32 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium">Constraints</label>
        <textarea
          value={constraints}
          onChange={(event) => setConstraints(event.target.value)}
          className="min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>
      <Button onClick={save} disabled={saving || !objective.trim()}>
        {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}Save
        goal contract
      </Button>
    </div>
  );
}

function Overview({ goal }: { goal: Goal }) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div
              className={cn(
                "text-sm font-semibold capitalize",
                statusTone(goal.status),
              )}
            >
              {statusLabel(goal.status)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Runner: {goal.executionTarget} · Revision {goal.stateRevision}
            </div>
          </div>
          {goal.lastHeartbeatAt ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock3 className="size-3.5" /> Last heartbeat{" "}
              {new Date(goal.lastHeartbeatAt).toLocaleTimeString()}
            </div>
          ) : null}
        </div>
        <div className="mt-4">
          <GoalProgress goal={goal} />
        </div>
      </div>
      <section>
        <h3 className="text-sm font-semibold">Objective</h3>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
          {goal.objective}
        </p>
      </section>
      <section>
        <h3 className="text-sm font-semibold">Current work</h3>
        <div className="mt-2 rounded-lg border border-border p-3 text-sm">
          <div className="font-medium">{goal.currentPhase ?? "Execution"}</div>
          <div className="mt-1 text-muted-foreground">
            {goal.currentTask ?? "Selecting the next executable task"}
          </div>
        </div>
      </section>
      <section>
        <h3 className="text-sm font-semibold">Definition of done</h3>
        <ul className="mt-2 space-y-2">
          {goal.definitionOfDone.map((criterion) => (
            <li
              key={criterion}
              className="flex gap-2 text-sm text-muted-foreground"
            >
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              <span>{criterion}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Tasks({ goal }: { goal: Goal }) {
  return (
    <div className="space-y-2">
      {goal.tasks.length ? (
        goal.tasks.map((task) => (
          <div key={task.id} className="rounded-lg border border-border p-3">
            <div className="flex items-start gap-2">
              {task.status === "verified" ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
              ) : task.status === "running" ||
                task.status === "verifying" ||
                task.status === "repairing" ? (
                <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
              ) : task.status === "blocked" ||
                task.status === "awaiting-approval" ? (
                <XCircle className="mt-0.5 size-4 shrink-0 text-amber-500" />
              ) : (
                <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{task.title}</span>
                  <span className="text-xs capitalize text-muted-foreground">
                    {statusLabel(task.status as GoalStatus)}
                  </span>
                </div>
                {task.description ? (
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {task.description}
                  </p>
                ) : null}
                {task.dependencies.length ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Depends on: {task.dependencies.join(", ")}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">
          The first goal run is preparing the task graph.
        </p>
      )}
    </div>
  );
}

function Evidence({ goal }: { goal: Goal }) {
  return goal.evidence.length ? (
    <div className="space-y-2">
      {goal.evidence
        .slice()
        .reverse()
        .map((evidence) => (
          <div
            key={evidence.id}
            className="rounded-lg border border-border p-3"
          >
            <div className="flex items-center gap-2">
              {evidence.passed ? (
                <CheckCircle2 className="size-4 text-emerald-500" />
              ) : (
                <XCircle className="size-4 text-destructive" />
              )}
              <span className="text-sm font-medium">{evidence.label}</span>
              <span className="ml-auto text-xs capitalize text-muted-foreground">
                {evidence.kind.replace(/-/g, " ")}
              </span>
            </div>
            <div className="mt-1 break-all text-xs text-muted-foreground">
              {evidence.reference}
            </div>
            {evidence.revision ? (
              <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                Revision {evidence.revision}
              </div>
            ) : null}
          </div>
        ))}
    </div>
  ) : (
    <p className="text-sm text-muted-foreground">
      No verification evidence has been recorded yet.
    </p>
  );
}

function Activity({ events }: { events: GoalActivityEvent[] }) {
  return events.length ? (
    <div className="relative ml-2 space-y-5 border-l border-border/50 py-2">
      {events.map((event) => (
        <div key={event.id} className="relative pl-6">
          <div className="absolute left-[-5px] top-1.5 size-2.5 rounded-full bg-primary ring-4 ring-background" />
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold capitalize text-foreground">
              {event.type.replace(/-/g, " ")}
            </span>
            <span className="text-[11px] text-muted-foreground font-medium">
              {new Date(event.createdAt).toLocaleTimeString()}
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {event.summary}
          </p>
        </div>
      ))}
    </div>
  ) : (
    <p className="text-sm text-muted-foreground italic">
      No goal activity has been recorded.
    </p>
  );
}

function Commands() {
  return (
    <div className="space-y-2">
      {BUILTIN_SLASH_COMMANDS.map((command) => (
        <div key={command.id} className="rounded-lg border border-border p-3">
          <div className="font-mono text-sm font-semibold">{command.usage}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {command.description}
          </div>
        </div>
      ))}
    </div>
  );
}

const TABS: Array<{ id: GoalCenterTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "tasks", label: "Tasks" },
  { id: "activity", label: "Activity" },
  { id: "evidence", label: "Evidence" },
  { id: "blockers", label: "Blockers" },
  { id: "history", label: "History" },
  { id: "edit", label: "Edit" },
];

export function GlobalGoalCenter() {
  const [center, setCenter] = useAtom(goalCenterAtom);
  const setSelectedAppId = useSetAtom(selectedAppIdAtom);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [events, setEvents] = useState<GoalActivityEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const hasLoadedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
    try {
      const result = await ipc.goal.listGoals({});
      hasLoadedRef.current = true;
      setGoals(result);
      const scoped =
        center.appId === null
          ? result
          : result.filter((goal) => goal.appId === center.appId);
      const selected = center.goalId
        ? result.find((goal) => goal.id === center.goalId)
        : (scoped.find((goal) => LIVE_STATUSES.includes(goal.status)) ??
          scoped[0]);
      if (selected) {
        setEvents(
          await ipc.goal.listActivity({ goalId: selected.id, limit: 300 }),
        );
      } else {
        setEvents([]);
      }
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  }, [center.appId, center.goalId]);

  useEffect(() => {
    void refresh();
    const unsubscribe = ipc.events.goal.onUpdated(() => void refresh());
    const interval = setInterval(() => void refresh(), 4_000);
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [refresh]);

  const selectedGoal = useMemo(() => {
    if (center.createObjective !== null) return null;
    if (center.goalId)
      return goals.find((goal) => goal.id === center.goalId) ?? null;
    const scopedGoals =
      center.appId === null
        ? goals
        : goals.filter((goal) => goal.appId === center.appId);
    return (
      scopedGoals.find((goal) => LIVE_STATUSES.includes(goal.status)) ??
      scopedGoals[0] ??
      null
    );
  }, [center.appId, center.createObjective, center.goalId, goals]);

  const openGoalChat = async (goal: Goal) => {
    if (!goal.goalChatId) return;
    setSelectedAppId(goal.appId);
    await router.navigate({ to: "/chat", search: { id: goal.goalChatId } });
    setCenter((current) => ({ ...current, open: false }));
  };

  const runControl = async (
    action: "pause" | "resume" | "retry" | "verify" | "cancel",
  ) => {
    if (!selectedGoal) return;
    try {
      if (action === "pause")
        await ipc.goal.pauseGoal({ goalId: selectedGoal.id });
      if (action === "resume")
        await ipc.goal.resumeGoal({ goalId: selectedGoal.id });
      if (action === "retry")
        await ipc.goal.retryGoal({ goalId: selectedGoal.id });
      if (action === "verify")
        await ipc.goal.verifyGoal({ goalId: selectedGoal.id });
      if (action === "cancel") {
        if (
          !window.confirm(
            `Cancel “${selectedGoal.title}” permanently? Existing changes will remain.`,
          )
        )
          return;
        await ipc.goal.cancelGoal({ goalId: selectedGoal.id });
      }
      await refresh();
    } catch (error) {
      showError(error);
    }
  };

  const liveGoals = goals.filter((goal) => LIVE_STATUSES.includes(goal.status));

  return (
    <>
      {liveGoals.length > 0 && !center.open ? (
        <button
          type="button"
          onClick={() => setCenter((current) => ({ ...current, open: true }))}
          className="fixed bottom-4 right-4 z-40 flex max-w-80 items-center gap-3 rounded-xl border border-border bg-background/95 px-3 py-2.5 text-left shadow-xl backdrop-blur hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
            {liveGoals.some((goal) =>
              ["running", "verifying", "repairing"].includes(goal.status),
            ) ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Target className="size-4" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">
              {liveGoals.length === 1
                ? liveGoals[0].title
                : `${liveGoals.length} active goals`}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {liveGoals[0].currentTask ?? statusLabel(liveGoals[0].status)}
            </div>
          </div>
        </button>
      ) : null}

      <Dialog
        open={center.open}
        onOpenChange={(open) => setCenter((current) => ({ ...current, open }))}
      >
        <DialogContent className="flex max-h-[85vh] w-[95vw] max-w-7xl flex-col p-0">
          <DialogHeader className="shrink-0 border-b border-border px-6 py-5 pr-14">
            <DialogTitle className="flex items-center gap-2">
              <Target className="size-5 text-primary" /> Goal Center
            </DialogTitle>
            <DialogDescription>
              Durable execution, background continuation, task evidence and
              production-readiness verification.
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 overflow-hidden md:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="overflow-y-auto border-b border-border bg-muted/20 p-3 md:border-b-0 md:border-r">
              <button
                type="button"
                onClick={() =>
                  setCenter((current) => ({
                    ...current,
                    goalId: null,
                    tab: "overview",
                    createObjective: current.appId === null ? null : "",
                  }))
                }
                className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-2.5 text-sm font-medium text-muted-foreground transition-all hover:border-primary/50 hover:bg-primary/5 hover:text-primary active:scale-[0.98]"
              >
                + New goal
              </button>
              {goals.map((goal) => (
                <button
                  key={goal.id}
                  type="button"
                  onClick={() =>
                    setCenter((current) => ({
                      ...current,
                      appId: goal.appId,
                      goalId: goal.id,
                      tab: "overview",
                      createObjective: null,
                    }))
                  }
                  className={cn(
                    "mb-2 flex w-full flex-col items-start gap-1 rounded-xl p-3 text-left transition-all duration-200",
                    selectedGoal?.id === goal.id
                      ? "bg-primary text-primary-foreground shadow-md scale-[1.02]"
                      : "bg-background border border-transparent hover:border-border/50 hover:bg-muted/50 text-foreground hover:shadow-sm",
                  )}
                >
                  <div className="line-clamp-2 text-sm font-semibold leading-snug">
                    {goal.title}
                  </div>
                  <div
                    className={cn(
                      "text-[11px] font-medium tracking-wide uppercase",
                      selectedGoal?.id === goal.id
                        ? "text-primary-foreground/80"
                        : statusTone(goal.status),
                    )}
                  >
                    {statusLabel(goal.status)}
                  </div>
                </button>
              ))}
            </aside>
            <main className="flex min-h-0 flex-col bg-background/50">
              {loading && !goals.length ? (
                <div className="grid flex-1 place-items-center">
                  <Loader2 className="size-6 animate-spin text-primary" />
                </div>
              ) : null}
              {center.tab === "commands" ? (
                <div className="overflow-y-auto p-5"><Commands /></div>
              ) : !selectedGoal && center.appId ? (
                <div className="overflow-y-auto p-5">
                  <GoalCreateForm
                    appId={center.appId}
                    initialObjective={center.createObjective}
                    onCreated={(goal) => {
                      setGoals((current) => [goal, ...current]);
                      setCenter((current) => ({
                        ...current,
                        goalId: goal.id,
                        tab: "overview",
                        createObjective: null,
                      }));
                    }}
                  />
                </div>
              ) : !selectedGoal ? (
                <div className="flex flex-1 flex-col p-5">
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Open a project to create a goal, or select an existing goal
                      from the list.
                    </p>
                    <Commands />
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 flex-col overflow-hidden">
                  <div className="shrink-0 border-b border-border/50 bg-background/80 p-5 backdrop-blur-md">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <h2 className="line-clamp-2 text-xl font-bold tracking-tight text-foreground">
                          {selectedGoal.title}
                        </h2>
                        <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">
                            Project #{selectedGoal.appId}
                          </span>
                          <span>
                            Created {new Date(selectedGoal.createdAt).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 shadow-sm transition-all hover:bg-primary hover:text-primary-foreground"
                        onClick={() => void openGoalChat(selectedGoal)}
                      >
                        <ExternalLink className="mr-1.5 size-3.5" /> Open goal chat
                      </Button>
                    </div>
                    <div className="mt-6 flex gap-1 overflow-x-auto">
                      {TABS.map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() =>
                            setCenter((current) => ({ ...current, tab: tab.id }))
                          }
                          className={cn(
                            "relative whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                            center.tab === tab.id
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground",
                          )}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-5">
                    {center.tab === "overview" ? (
                      <Overview goal={selectedGoal} />
                    ) : null}
                    {center.tab === "tasks" ? (
                      <Tasks goal={selectedGoal} />
                    ) : null}
                    {center.tab === "activity" ? (
                      <Activity events={events} />
                    ) : null}
                    {center.tab === "evidence" ? (
                      <Evidence goal={selectedGoal} />
                    ) : null}
                    {center.tab === "blockers" ? (
                      selectedGoal.blocker ? (
                        <div className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-500/5 p-5 shadow-sm">
                          <h3 className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-400">
                            <ShieldCheck className="size-4" />
                            {selectedGoal.blocker.reason}
                          </h3>
                          {selectedGoal.blocker.userAction ? (
                            <p className="mt-3 text-sm font-medium leading-relaxed text-foreground">
                              {selectedGoal.blocker.userAction}
                            </p>
                          ) : null}
                          <div className="mt-4 inline-flex items-center rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200">
                            Retryable:{" "}
                            {selectedGoal.blocker.retryable ? "Yes" : "No"}
                          </div>
                        </div>
                      ) : (
                        <div className="flex min-h-[200px] flex-col items-center justify-center text-center">
                          <ShieldCheck className="mb-3 size-10 text-muted-foreground/30" />
                          <p className="text-sm font-medium text-muted-foreground">
                            No unresolved blockers.
                          </p>
                        </div>
                      )
                    ) : null}
                    {center.tab === "history" ? (
                      <Activity
                        events={events.filter((event) =>
                          [
                            "completed",
                            "cancelled",
                            "edited",
                            "steered",
                          ].includes(event.type),
                        )}
                      />
                    ) : null}
                    {center.tab === "edit" ? (
                      <GoalEditForm
                        goal={selectedGoal}
                        onSaved={(goal) => {
                          setGoals((current) =>
                            current.map((item) =>
                              item.id === goal.id ? goal : item,
                            ),
                          );
                          setCenter((current) => ({
                            ...current,
                            tab: "overview",
                          }));
                        }}
                      />
                    ) : null}
                  </div>
                  
                  <div className="shrink-0 border-t border-border/50 bg-background/95 px-5 py-4 backdrop-blur-sm">
                    <div className="flex flex-wrap gap-2">
                      {selectedGoal.status === "paused" ||
                      selectedGoal.status === "blocked" ||
                      selectedGoal.status === "awaiting-user" ? (
                        <Button
                          size="sm"
                          className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all"
                          onClick={() => void runControl("resume")}
                        >
                          <Play className="mr-1.5 size-4" /> Resume execution
                        </Button>
                      ) : !["completed", "cancelled"].includes(
                          selectedGoal.status,
                        ) ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="shadow-sm transition-all hover:bg-secondary/80"
                          onClick={() => void runControl("pause")}
                        >
                          <Pause className="mr-1.5 size-4" /> Pause
                        </Button>
                      ) : null}
                      {!["completed", "cancelled"].includes(
                        selectedGoal.status,
                      ) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="shadow-sm transition-all"
                          onClick={() => void runControl("verify")}
                        >
                          <ShieldCheck className="mr-1.5 size-4 text-emerald-500" /> Verify
                        </Button>
                      ) : null}
                      {selectedGoal.status === "blocked" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="shadow-sm transition-all hover:bg-amber-500/10 hover:text-amber-600 border-amber-500/30"
                          onClick={() => void runControl("retry")}
                        >
                          <Play className="mr-1.5 size-4 text-amber-500" /> Retry now
                        </Button>
                      ) : null}
                      {!["completed", "cancelled"].includes(
                        selectedGoal.status,
                      ) ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive transition-all"
                          onClick={() => void runControl("cancel")}
                        >
                          <XCircle className="mr-1.5 size-4" /> Cancel goal
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}
            </main>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
