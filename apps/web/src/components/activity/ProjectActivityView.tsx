import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import type {
  GoalStatus,
  ProjectActivityItem,
  ProjectActivityKind,
  ProjectId,
} from "@caide/contracts";
import { RefreshCwIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import { GOAL_WORKING_STATUSES } from "../goals/goalStatus";
import { readNativeApi } from "../../nativeApi";
import { RouteInsetSurface } from "../RouteInsetSurface";
import { Button } from "../ui/button";
import { groupProjectActivityByDay, formatActivityTime } from "./projectActivity";

// M4b: main-pane per-project Activity timeline. Day-grouped dot rows over
// chat / goal / commit / build / analyze / test activity aggregated by the
// server (orchestration.getProjectActivity).

const KIND_DOT_CLASS: Record<ProjectActivityKind, string> = {
  chat: "bg-sky-500/80",
  goal: "bg-violet-500/80",
  commit: "bg-amber-500/80",
  build: "bg-orange-500/80",
  analyze: "bg-cyan-500/80",
  test: "bg-emerald-500/80",
};

function activityRowIdParts(id: string): { threadId?: string } {
  if (id.startsWith("chat:")) {
    return { threadId: id.slice("chat:".length) };
  }
  return {};
}

export function ProjectActivityView({ projectId }: { projectId: ProjectId }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<readonly ProjectActivityItem[]>([]);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    void readNativeApi()
      .orchestration.getProjectActivity({ projectId, limit: 200 })
      .then((result) => {
        setItems(result.items);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Failed to load activity");
        setLoading(false);
      });
  };

  useEffect(() => {
    load();
    void readNativeApi()
      .orchestration.getShellSnapshot()
      .then((shell) => {
        const project = shell.projects.find((candidate) => candidate.id === projectId);
        setProjectName(project?.title ?? null);
      })
      .catch(() => undefined);
  }, [projectId]);

  const groups = useMemo(() => groupProjectActivityByDay(items), [items]);

  return (
    <RouteInsetSurface>
      <div className="flex h-full min-h-0 flex-col p-4">
        <div className="mb-3 flex shrink-0 items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">Activity</div>
            <div className="truncate text-[length:var(--app-font-size-ui,12px)] text-muted-foreground/58">
              {projectName ?? "Project"}
            </div>
          </div>
          <Button size="sm" variant="ghost" className="gap-1.5" disabled={loading} onClick={load}>
            <RefreshCwIcon className={cn("size-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && items.length === 0 ? (
            <div className="px-2 pt-4 text-center text-[length:var(--app-font-size-ui,12px)] text-muted-foreground/58">
              Loading activity...
            </div>
          ) : error !== null ? (
            <div className="px-2 pt-4 text-center text-[length:var(--app-font-size-ui,12px)] text-destructive">
              {error}
            </div>
          ) : groups.length === 0 ? (
            <div className="px-2 pt-4 text-center text-[length:var(--app-font-size-ui,12px)] text-muted-foreground/58">
              No activity yet
            </div>
          ) : (
            <div className="space-y-4">
              {groups.map((group) => (
                <div key={group.dayKey}>
                  <div className="mb-1 px-2 text-[10px] font-medium tracking-wide text-muted-foreground/58 uppercase">
                    {group.label}
                  </div>
                  <div className="space-y-0.5">
                    {group.items.map((item) => (
                      <div
                        key={item.id}
                        role={item.kind === "chat" ? "button" : undefined}
                        tabIndex={item.kind === "chat" ? 0 : undefined}
                        className={cn(
                          "group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[length:var(--app-font-size-ui,12px)]",
                          item.kind === "chat" && "cursor-pointer hover:bg-[var(--sidebar-accent)]",
                        )}
                        onClick={() => {
                          if (item.kind !== "chat") return;
                          const { threadId } = activityRowIdParts(item.id);
                          if (threadId !== undefined) {
                            void navigate({ to: "/$threadId", params: { threadId } });
                          }
                        }}
                        onKeyDown={(event) => {
                          if (item.kind !== "chat") return;
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          const { threadId } = activityRowIdParts(item.id);
                          if (threadId !== undefined) {
                            void navigate({ to: "/$threadId", params: { threadId } });
                          }
                        }}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "size-1.5 shrink-0 rounded-full",
                            KIND_DOT_CLASS[item.kind],
                            item.kind === "goal" &&
                              GOAL_WORKING_STATUSES.includes(item.status as GoalStatus) &&
                              "animate-pulse",
                          )}
                        />
                        <span className="shrink-0 text-muted-foreground/58 tabular-nums">
                          {formatActivityTime(item.at)}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{item.summary}</span>
                        {item.status !== null ? (
                          <span className="shrink-0 rounded-sm bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {item.status}
                          </span>
                        ) : null}
                        {item.detail !== null ? (
                          <span
                            className="max-w-[16rem] shrink-0 truncate text-muted-foreground/48"
                            title={item.detail}
                          >
                            {item.detail}
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </RouteInsetSurface>
  );
}
