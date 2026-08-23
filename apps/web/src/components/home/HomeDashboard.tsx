// FILE: HomeDashboard.tsx
// Purpose: Flutter-first landing dashboard rendered at / when there is no restorable thread.
// Adapted from dyad x caide home.tsx but styled with Caide tokens.
// Layer: Route view

import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { Button } from "../ui/button";
import { CreateAppDialog } from "../CreateAppDialog";
import { useStore } from "../../store";
import { deriveAppNameFromPrompt, generateCuteAppName } from "../../lib/appNaming";
import { readNativeApi } from "../../nativeApi";
import { toastManager } from "../ui/toast";
import { useHandleNewThread } from "../../hooks/useHandleNewThread";

const STARTER_BRIEFS = [
  "A booking app for barbers with calendars, payments, and customer reminders",
  "A school attendance app for teachers, students, and parent notifications",
  "A food delivery app with cart, checkout, live orders, and courier tracking",
] as const;

export function HomeDashboard() {
  const navigate = useNavigate();
  const projects = useStore((s) => s.projects);
  const recentProjects = useMemo(() => {
    // Mirrors dyad's localApps.slice(0,4) but using Caide newest-first order already applied in sidebar.
    // Here we sort explicitly by createdAt desc as fallback.
    return [...projects]
      .toSorted((a, b) => {
        const aTs = a.createdAt ? Date.parse(a.createdAt) : 0;
        const bTs = b.createdAt ? Date.parse(b.createdAt) : 0;
        return bTs - aTs;
      })
      .slice(0, 4);
  }, [projects]);
  const [brief, setBrief] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const { handleNewThread } = useHandleNewThread();

  const canCreate = brief.trim().length >= 12;

  const handleCreateFromBrief = useCallback(async () => {
    if (!canCreate) return;
    // Store derived name in sessionStorage so CreateAppDialog can pick it up as initial suggestion
    const derived = deriveAppNameFromPrompt(brief) || generateCuteAppName();
    try { sessionStorage.setItem("caide:home-derived-app-name", derived); } catch {}
    setCreateOpen(true);
  }, [brief, canCreate]);

  const handleOpenProject = useCallback(
    async (projectId: string) => {
      // Reuse sidebar logic: open most recent thread or create one.
      const { ProjectId } = await import("@caide/contracts");
      const pid = ProjectId.makeUnsafe(projectId);
      const api = readNativeApi();
      if (!api) {
        toastManager.add({ type: "error", title: "App server unavailable" });
        return;
      }
      try {
        const snap = await api.orchestration.getShellSnapshot();
        const threads = snap.threads.filter((t) => t.projectId === pid && !t.archivedAt);
        const latest = threads.toSorted((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
        if (latest) {
          await navigate({ to: "/$threadId", params: { threadId: latest.id } });
          return;
        }
        await handleNewThread(pid);
      } catch (e) {
        toastManager.add({
          type: "error",
          title: "Unable to open project",
          description: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [handleNewThread, navigate],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <div className="flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-5xl px-6 py-8 md:px-8 md:py-10">
          {/* Eyebrow + heading */}
          <div className="grid gap-6 md:grid-cols-[1.15fr_0.85fr] md:items-end">
            <div>
              <div className="text-[10px] font-medium tracking-[0.14em] text-muted-foreground">NEW FLUTTER PRODUCT</div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-[40px] md:leading-[0.95]">
                Turn a product brief into a release-ready app.
              </h1>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              Plan the architecture first. Then edit, preview, verify, export, and ship from one workspace.
              Apps live in <code className="rounded bg-muted px-1 py-0.5 text-xs">~/caide-apps</code>.
            </p>
          </div>

          {/* Brief workbench + history */}
          <div className="mt-8 grid gap-4 md:grid-cols-[1.35fr_0.85fr]">
            <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
              <div className="flex items-center gap-3 border-b px-4 py-3">
                <div className="grid size-8 place-items-center rounded-lg border bg-background text-sm">◈</div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">Start from a brief</div>
                  <div className="text-xs text-muted-foreground">Caide turns the brief into a working Flutter project.</div>
                </div>
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground">01</span>
              </div>

              <div className="p-4">
                <label htmlFor="home-brief" className="sr-only">
                  Product brief
                </label>
                <textarea
                  id="home-brief"
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder="Describe the app you want… e.g. A habits tracker with streaks, reminders, and a weekly review"
                  className="min-h-36 w-full resize-y rounded-xl border bg-background p-3 text-sm leading-6 placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-1.5 text-[10px] tracking-wide text-muted-foreground">
                    <span className="rounded-full border bg-muted/50 px-2 py-1">FLUTTER FIRST</span>
                    <span className="rounded-full border bg-muted/50 px-2 py-1">PLAN + BUILD</span>
                    <span className="rounded-full border bg-muted/50 px-2 py-1">LOCAL RUNTIME</span>
                  </div>
                  <Button variant="prominent" size="sm" disabled={!canCreate} onClick={() => void handleCreateFromBrief()}>
                    Create Flutter app →
                  </Button>
                </div>

                <div className="mt-4 border-t pt-3">
                  <div className="text-[10px] font-medium tracking-wide text-muted-foreground">STARTING BRIEFS</div>
                  <div className="mt-2 grid gap-1.5">
                    {STARTER_BRIEFS.map((item, idx) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setBrief(item)}
                        className="flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs hover:bg-accent/50"
                      >
                        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">0{idx + 1}</span>
                        <span className="min-w-0 flex-1 truncate">{item}</span>
                        <span className="shrink-0 text-muted-foreground">→</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div>
                  <div className="text-[10px] font-medium tracking-wide text-muted-foreground">PROJECT HISTORY</div>
                  <div className="text-sm font-medium">Continue building</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => void navigate({ to: "/kanban" })}>
                  View all →
                </Button>
              </div>

              <div className="divide-y">
                {recentProjects.length === 0 ? (
                  <div className="px-4 py-10 text-center">
                    <div className="mx-auto grid size-10 place-items-center rounded-full border bg-muted text-muted-foreground">◐</div>
                    <div className="mt-3 text-sm font-medium">No projects yet</div>
                    <div className="mt-1 text-xs text-muted-foreground">Your Flutter projects will appear here.</div>
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => setCreateOpen(true)}>
                      Create your first app
                    </Button>
                  </div>
                ) : (
                  recentProjects.map((p, idx) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => void handleOpenProject(p.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/40"
                    >
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <span className="grid size-8 shrink-0 place-items-center rounded bg-muted text-xs font-semibold">
                        {p.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{p.name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{p.cwd}</span>
                      </span>
                      <span className="shrink-0 text-muted-foreground">→</span>
                    </button>
                  ))
                )}
              </div>

              {recentProjects.length > 0 && (
                <div className="grid grid-cols-3 divide-x border-t bg-muted/20 text-center">
                  <div className="px-2 py-2.5">
                    <span className="text-sm font-semibold tabular-nums">{recentProjects.length}</span>{" "}
                    <span className="text-[10px] tracking-wide text-muted-foreground">RECENT</span>
                  </div>
                  <div className="px-2 py-2.5">
                    <span className="text-sm font-semibold tabular-nums">{projects.length}</span>{" "}
                    <span className="text-[10px] tracking-wide text-muted-foreground">TOTAL</span>
                  </div>
                  <div className="px-2 py-2.5">
                    <span className="text-[10px] tracking-wide text-muted-foreground">~/caide-apps</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Starting points */}
          <div className="mt-4 grid gap-2 md:grid-cols-4">
            <div className="hidden md:block">
              <div className="text-[10px] font-medium tracking-wide text-muted-foreground">STARTING POINTS</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">Build from a brief, import a project, or continue existing work.</div>
            </div>
            {[
              { label: "Write custom brief", desc: "Start from product requirements.", action: () => document.getElementById("home-brief")?.focus() },
              { label: "Import project", desc: "Bring an existing Flutter codebase.", action: () => setCreateOpen(true) },
              { label: "Open history", desc: recentProjects[0] ? `Continue ${recentProjects[0].name}` : "Create a project first.", action: () => void navigate({ to: "/kanban" }) },
              { label: "View activity", desc: "Per-project commits, builds, tests.", action: () => void navigate({ to: "/kanban" }) },
            ].map((card) => (
              <button
                key={card.label}
                type="button"
                onClick={card.action}
                className="rounded-xl border bg-card px-3 py-3 text-left hover:bg-accent/50"
              >
                <div className="text-sm font-medium">{card.label}</div>
                <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{card.desc}</div>
                <div className="mt-2 text-xs text-muted-foreground">→</div>
              </button>
            ))}
          </div>

          <div className="mt-6 flex items-center justify-between border-t pt-3 text-[10px] tracking-wide text-muted-foreground">
            <span>CAIDE FLUTTER BUILDER</span>
            <span>LOCAL-FIRST · FLUTTER-FIRST · NO SUBSCRIPTION</span>
          </div>
        </div>
      </div>

      <CreateAppDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={async (result) => {
          await navigate({ to: "/$threadId", params: { threadId: result.threadId } });
        }}
      />
    </div>
  );
}
