// FILE: DatabasePanel.tsx
// Purpose: Right-dock pane for the project's database integrations (Neon +
//          Supabase). Project-scoped by design: every chat in the same project
//          resolves the same engine app row, so the pane shows one persistent
//          configuration regardless of which thread opened it. Connect /
//          disconnect / branch selection relay through the gated
//          `database.invoke` WS method onto the engine's neon:* / supabase:*
//          IPC handlers.
// Layer: Chat right-dock UI (database pane)

import { useCallback, useEffect, useMemo, useState } from "react";

import type { ThreadId } from "@caide/contracts";

import { cn } from "~/lib/utils";
import {
  CheckCircle2Icon,
  CircleAlertIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
  PlusIcon,
  RefreshCwIcon,
  XIcon,
} from "~/lib/icons";

import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";

import { DockPaneHeader } from "./DockPaneHeader";
import { PanelStateMessage } from "./PanelStateMessage";
import { ensureNativeApi } from "~/nativeApi";

interface EngineApp {
  id: number;
  name: string;
  path: string;
  supabaseProjectId: string | null;
  supabaseParentProjectId?: string | null;
  supabaseOrganizationSlug: string | null;
  neonProjectId: string | null;
  neonDevelopmentBranchId: string | null;
  neonPreviewBranchId: string | null;
  neonActiveBranchId: string | null;
  selectedDatabaseBranchType: "production" | "development" | null;
}

interface NeonProject {
  id: string;
  name: string;
}

interface SupabaseOrganization {
  id: string;
  slug: string;
  name?: string;
}

interface SupabaseProject {
  id: string;
  name?: string;
  organization_slug?: string;
}

interface NeonBranch {
  id: string;
  name: string;
}

async function invokeDatabase<T>(
  threadId: ThreadId,
  channel: string,
  payload?: unknown,
): Promise<T> {
  const result = await ensureNativeApi().database.invoke({ threadId, channel, payload });
  return result.value as T;
}

function basename(p: string): string {
  const normalized = p.replace(/\\/g, "/").replace(/\/+$/, "");
  const idx = normalized.lastIndexOf("/");
  return idx === -1 ? normalized : normalized.slice(idx + 1);
}

export function DatabasePanel(props: {
  threadId: ThreadId;
  workspaceRoot?: string | null;
  onClose: () => void;
}) {
  const [app, setApp] = useState<EngineApp | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Picker state
  const [showNeonPicker, setShowNeonPicker] = useState(false);
  const [neonProjects, setNeonProjects] = useState<NeonProject[] | null>(null);
  const [showSupabasePicker, setShowSupabasePicker] = useState(false);
  const [supabaseOrgs, setSupabaseOrgs] = useState<SupabaseOrganization[] | null>(null);
  const [supabaseProjects, setSupabaseProjects] = useState<SupabaseProject[] | null>(null);
  const [selectedOrgSlug, setSelectedOrgSlug] = useState<string | null>(null);
  const [branches, setBranches] = useState<NeonBranch[] | null>(null);

  const refreshApp = useCallback(async () => {
    setLoading(true);
    setResolveError(null);
    try {
      const response = await invokeDatabase<{ apps?: EngineApp[] }>(props.threadId, "list-apps");
      const apps = Array.isArray(response?.apps) ? response.apps : [];
      const root = props.workspaceRoot ?? "";
      const match =
        apps.find((candidate) => candidate.path === root) ??
        apps.find((candidate) => basename(candidate.path) === basename(root));
      if (!match) {
        setApp(null);
        setResolveError(
          "No engine app matches this workspace yet. Start a chat to provision it.",
        );
        return;
      }
      setApp(match);
    } catch (cause) {
      setApp(null);
      setResolveError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [props.workspaceRoot]);

  useEffect(() => {
    void refreshApp();
  }, [refreshApp]);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, []);

  const connectNeon = (projectId: string) =>
    run(async () => {
      if (!app) return;
      await invokeDatabase(props.threadId, "neon:set-app-project", { appId: app.id, projectId });
      await refreshApp();
      setShowNeonPicker(false);
      setNeonProjects(null);
    });

  const disconnectNeon = () =>
    run(async () => {
      if (!app) return;
      await invokeDatabase(props.threadId, "neon:unset-app-project", { appId: app.id });
      await refreshApp();
    });

  const connectSupabase = (project: SupabaseProject) =>
    run(async () => {
      if (!app) return;
      await invokeDatabase(props.threadId, "supabase:set-app-project", {
        appId: app.id,
        projectId: project.id,
        parentProjectId: project.id,
        organizationSlug: selectedOrgSlug,
      });
      await refreshApp();
      setShowSupabasePicker(false);
      setSupabaseOrgs(null);
      setSupabaseProjects(null);
      setSelectedOrgSlug(null);
    });

  const disconnectSupabase = () =>
    run(async () => {
      if (!app) return;
      await invokeDatabase(props.threadId, "supabase:unset-app-project", { appId: app.id });
      await refreshApp();
    });

  const loadNeonProjects = () =>
    run(async () => {
      setShowNeonPicker(true);
      const response = await invokeDatabase<{ projects?: NeonProject[] }>(props.threadId, "neon:list-projects");
      setNeonProjects(Array.isArray(response?.projects) ? response.projects : []);
    });

  const loadSupabaseOrgs = () =>
    run(async () => {
      setShowSupabasePicker(true);
      setSupabaseProjects(null);
      const orgs = await invokeDatabase<SupabaseOrganization[]>(
        props.threadId,
        "supabase:list-organizations",
      );
      setSupabaseOrgs(Array.isArray(orgs) ? orgs : []);
    });

  const loadSupabaseProjects = (orgSlug: string) =>
    run(async () => {
      setSelectedOrgSlug(orgSlug);
      const all = await invokeDatabase<SupabaseProject[]>(
        props.threadId,
        "supabase:list-all-projects",
      );
      setSupabaseProjects(
        (Array.isArray(all) ? all : []).filter(
          (project) => !project.organization_slug || project.organization_slug === orgSlug,
        ),
      );
    });

  const loadBranches = useMemo(() => {
    if (!app?.neonProjectId) return null;
    return () =>
      run(async () => {
        const response = await invokeDatabase<{
          branches?: NeonBranch[];
          data?: { branches?: NeonBranch[] };
        }>(props.threadId, "neon:get-project", { projectId: app.neonProjectId });
        const list =
          (Array.isArray(response as unknown as NeonBranch[])
            ? (response as unknown as NeonBranch[])
            : response?.branches ?? response?.data?.branches) ?? [];
        setBranches(list);
      });
  }, [app?.neonProjectId, run]);

  const setNeonBranch = (branchId: string) =>
    run(async () => {
      if (!app) return;
      await invokeDatabase(props.threadId, "neon:set-active-branch", { appId: app.id, branchId });
      await refreshApp();
    });

  const headerTitle = app ? `Database — ${app.name}` : "Database";

  return (
    <div className="flex h-full flex-col">
      <DockPaneHeader title={headerTitle} onClose={props.onClose} />
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-3 text-sm">
          {loading && <PanelStateMessage>Loading database configuration...</PanelStateMessage>}

          {!loading && resolveError && (
            <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
              <span>{resolveError}</span>
            </div>
          )}

          {!loading && actionError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          {!loading && app && (
            <>
              <section className="rounded-lg border border-border">
                <header className="flex items-center justify-between border-b border-border px-3 py-2">
                  <div className="font-medium">Neon (Postgres)</div>
                  {app.neonProjectId ? (
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2Icon className="size-3" /> Connected
                    </Badge>
                  ) : (
                    <Badge variant="outline">Not linked</Badge>
                  )}
                </header>
                <div className="flex flex-col gap-2 p-3">
                  {app.neonProjectId ? (
                    <>
                      <div className="text-xs text-muted-foreground">
                        Project <code className="text-foreground">{app.neonProjectId}</code>
                        {app.neonActiveBranchId ? (
                          <>
                            {" · active branch "}
                            <code className="text-foreground">{app.neonActiveBranchId}</code>
                          </>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => loadBranches?.()}>
                          {busy ? (
                            <LoaderCircleIcon className="size-3 animate-spin" />
                          ) : (
                            <RefreshCwIcon className="size-3" />
                          )}
                          Branches
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => disconnectNeon()}
                        >
                          <XIcon className="size-3" /> Disconnect
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            window.open(
                              `https://console.neon.tech/app/projects/${app.neonProjectId}`,
                              "_blank",
                              "noopener,noreferrer",
                            )
                          }
                        >
                          <ExternalLinkIcon className="size-3" /> Console
                        </Button>
                      </div>
                      {branches && (
                        <ul className="flex flex-col gap-1">
                          {branches.length === 0 && (
                            <li className="text-xs text-muted-foreground">No branches found.</li>
                          )}
                          {branches.map((branch) => (
                            <li key={branch.id}>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setNeonBranch(branch.id)}
                                className={cn(
                                  "flex w-full items-center justify-between rounded-md border border-transparent px-2 py-1 text-left text-xs hover:bg-accent",
                                  branch.id === app.neonActiveBranchId &&
                                    "border-border bg-muted/60 font-medium",
                                )}
                              >
                                <span>{branch.name}</span>
                                {branch.id === app.neonActiveBranchId && (
                                  <Badge variant="secondary">active</Badge>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground">
                        Link a Neon project to give the agent a managed Postgres database with
                        branching.
                      </p>
                      <Button size="sm" variant="outline" disabled={busy} onClick={loadNeonProjects}>
                        <PlusIcon className="size-3" /> Link Neon project
                      </Button>
                    </>
                  )}

                  {showNeonPicker && (
                    <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-border p-1">
                      {(neonProjects ?? []).length === 0 && (
                        <li className="px-2 py-1 text-xs text-muted-foreground">
                          {neonProjects === null ? "Loading projects..." : "No Neon projects found."}
                        </li>
                      )}
                      {(neonProjects ?? []).map((project) => (
                        <li key={project.id}>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => connectNeon(project.id)}
                            className="w-full rounded-md px-2 py-1 text-left text-xs hover:bg-accent"
                          >
                            {project.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>

              <section className="rounded-lg border border-border">
                <header className="flex items-center justify-between border-b border-border px-3 py-2">
                  <div className="font-medium">Supabase</div>
                  {app.supabaseProjectId ? (
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2Icon className="size-3" /> Connected
                    </Badge>
                  ) : (
                    <Badge variant="outline">Not linked</Badge>
                  )}
                </header>
                <div className="flex flex-col gap-2 p-3">
                  {app.supabaseProjectId ? (
                    <>
                      <div className="text-xs text-muted-foreground">
                        Project <code className="text-foreground">{app.supabaseProjectId}</code>
                        {app.supabaseOrganizationSlug ? (
                          <> · org {app.supabaseOrganizationSlug}</>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => disconnectSupabase()}
                        >
                          <XIcon className="size-3" /> Disconnect
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            window.open(
                              `https://supabase.com/dashboard/project/${app.supabaseProjectId}`,
                              "_blank",
                              "noopener,noreferrer",
                            )
                          }
                        >
                          <ExternalLinkIcon className="size-3" /> Dashboard
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground">
                        Link a Supabase project for auth, storage, and edge functions.
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={loadSupabaseOrgs}
                      >
                        <PlusIcon className="size-3" /> Link Supabase project
                      </Button>
                    </>
                  )}

                  {showSupabasePicker && (
                    <div className="flex flex-col gap-2 rounded-md border border-border p-2">
                      {!supabaseProjects && (
                        <ul className="flex flex-col gap-1">
                          {(supabaseOrgs ?? []).length === 0 && (
                            <li className="px-2 py-1 text-xs text-muted-foreground">
                              {supabaseOrgs === null
                                ? "Loading organizations..."
                                : "No organizations found. Connect Supabase in Settings first."}
                            </li>
                          )}
                          {(supabaseOrgs ?? []).map((org) => (
                            <li key={org.slug}>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => loadSupabaseProjects(org.slug)}
                                className="w-full rounded-md px-2 py-1 text-left text-xs hover:bg-accent"
                              >
                                {org.name ?? org.slug}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {supabaseProjects && (
                        <ul className="flex flex-col gap-1">
                          {supabaseProjects.length === 0 && (
                            <li className="px-2 py-1 text-xs text-muted-foreground">
                              No projects in this organization.
                            </li>
                          )}
                          {supabaseProjects.map((project) => (
                            <li key={project.id}>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => connectSupabase(project)}
                                className="w-full rounded-md px-2 py-1 text-left text-xs hover:bg-accent"
                              >
                                {project.name ?? project.id}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </section>

              <div className="flex justify-end">
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => refreshApp()}>
                  <RefreshCwIcon className={cn("size-3", busy && "animate-spin")} /> Refresh
                </Button>
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
