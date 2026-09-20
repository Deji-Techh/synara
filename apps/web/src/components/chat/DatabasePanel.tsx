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
  DatabaseIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
  PlusIcon,
  RefreshCwIcon,
  XIcon,
} from "~/lib/icons";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";

import { DockPaneHeader } from "./DockPaneHeader";
import { PanelStateMessage } from "./PanelStateMessage";
import { ensureNativeApi } from "~/nativeApi";
import { useDatabaseAuth } from "~/hooks/useDatabaseAuth";
import { harnessStore } from "~/harnessStore";
import { getHarnessSession } from "~/harnessSessionRegistry";
import { answerUiPrompt } from "~/harnessWs";
import {
  connectionMatchesWorkspace,
  loadConnections,
  normalizeScopeRoot,
  saveConnections,
} from "../settings/databaseSettingsStore";

interface EngineApp {
  id: number;
  name: string;
  path: string;
  resolvedPath?: string;
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
  workspaceRoot?: string | null,
): Promise<T> {
  const result = await ensureNativeApi().database.invoke({
    threadId,
    channel,
    payload: {
      ...((payload ?? {}) as Record<string, unknown>),
      ...(workspaceRoot ? { workspaceRoot } : {}),
    },
  });
  return result.value as T;
}

/** Human error mapping — raw transport/schema messages never reach users. */
export function databaseErrorMessage(cause: unknown): string {
  const raw = cause instanceof Error ? cause.message : String(cause);
  if (/harness offline|socket|ECONNREFUSED|connect|fetch failed|network/i.test(raw)) {
    return "Can't reach Caide's backend. Restart the app; if it persists, check Settings → Providers for connection status.";
  }
  if (/Settings → Database|token|401|403|unauthorized|unauthenticated/i.test(raw)) {
    return "Missing or invalid management token — add it in Settings → Database, Management tokens.";
  }
  if (/Missing key at|Unexpected token|timed out|timeout|aborted/i.test(raw)) {
    return "The backend didn't answer correctly — update to the latest AppImage, then press Refresh.";
  }
  return raw;
}

export function DatabasePanel(props: {
  threadId: ThreadId;
  workspaceRoot?: string | null;
  onClose: () => void;
}) {
  const dbAuth = useDatabaseAuth();
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
  const [newProjectName, setNewProjectName] = useState("");

  const resolvePendingIntegration = useCallback(
    (provider: "neon" | "supabase", projectId?: string) => {
      const session = getHarnessSession(props.threadId);
      const prompt = harnessStore
        .getState()
        .sessions[props.threadId]?.prompts.find((p) => p.kind === "integration");
      if (session && prompt) {
        answerUiPrompt(session.send, prompt.requestId, {
          provider,
          ...(projectId ? { projectId } : {}),
        });
        harnessStore.resolvePrompt(props.threadId, prompt.requestId);
      }
    },
    [props.threadId],
  );

  const refreshApp = useCallback(async () => {
    setLoading(true);
    setResolveError(null);
    try {
      const response = await invokeDatabase<{ apps?: EngineApp[] }>(
        props.threadId,
        "list-apps",
        undefined,
        props.workspaceRoot ?? undefined,
      );
      const apps = Array.isArray(response?.apps) ? response.apps : [];
      const root = props.workspaceRoot;
      const normalize = (p?: string | null) =>
        p ? p.replace(/\\/g, "/").replace(/\/+$/, "") : "";
      const normRoot = normalize(root);
      const match =
        (normRoot
          ? apps.find(
              (candidate) =>
                normalize(candidate.resolvedPath ?? candidate.path) === normRoot,
            )
          : null) ?? (apps.length > 0 ? apps[0] : null);

      if (!match) {
        if (!root) {
          setApp(null);
          setResolveError("This chat has no project workspace.");
          return;
        }
        const appName =
          normRoot.split("/").filter(Boolean).pop() || "Project";
        setApp({
          id: 1,
          name: appName,
          path: root,
          resolvedPath: root,
          supabaseProjectId: null,
          neonProjectId: null,
          neonActiveBranchId: null,
          neonDevelopmentBranchId: null,
          neonPreviewBranchId: null,
          selectedDatabaseBranchType: null,
          supabaseOrganizationSlug: null,
        });
        return;
      }
      setApp(match);
    } catch (cause) {
      if (props.workspaceRoot) {
        const root = props.workspaceRoot;
        const normRoot = root.replace(/\\/g, "/").replace(/\/+$/, "");
        const appName = normRoot.split("/").filter(Boolean).pop() || "Project";
        setApp({
          id: 1,
          name: appName,
          path: root,
          resolvedPath: root,
          supabaseProjectId: null,
          neonProjectId: null,
          neonActiveBranchId: null,
          neonDevelopmentBranchId: null,
          neonPreviewBranchId: null,
          selectedDatabaseBranchType: null,
          supabaseOrganizationSlug: null,
        });
      } else {
        setApp(null);
        setResolveError(databaseErrorMessage(cause));
      }
    } finally {
      setLoading(false);
    }
  }, [props.threadId, props.workspaceRoot]);

  useEffect(() => {
    void refreshApp();
  }, [refreshApp]);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
    } catch (cause) {
      setActionError(databaseErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }, []);

  const connectNeon = (projectId: string) =>
    run(async () => {
      if (!app) return;
      await invokeDatabase(
        props.threadId,
        "neon:set-app-project",
        { appId: app.id, projectId },
        props.workspaceRoot,
      );
      await refreshApp();
      setShowNeonPicker(false);
      setNeonProjects(null);
      resolvePendingIntegration("neon", projectId);
    });

  const disconnectNeon = () =>
    run(async () => {
      if (!app) return;
      await invokeDatabase(
        props.threadId,
        "neon:unset-app-project",
        { appId: app.id },
        props.workspaceRoot,
      );
      await refreshApp();
    });

  const connectSupabase = (project: SupabaseProject) =>
    run(async () => {
      if (!app) return;
      await invokeDatabase(
        props.threadId,
        "supabase:set-app-project",
        {
          appId: app.id,
          projectId: project.id,
          parentProjectId: project.id,
          organizationSlug: selectedOrgSlug,
        },
        props.workspaceRoot,
      );
      await refreshApp();
      setShowSupabasePicker(false);
      setSupabaseOrgs(null);
      setSupabaseProjects(null);
      setSelectedOrgSlug(null);
      resolvePendingIntegration("supabase", project.id);
    });

  const disconnectSupabase = () =>
    run(async () => {
      if (!app) return;
      await invokeDatabase(
        props.threadId,
        "supabase:unset-app-project",
        { appId: app.id },
        props.workspaceRoot,
      );
      await refreshApp();
    });

  const loadNeonProjects = () =>
    run(async () => {
      setShowNeonPicker(true);
      const response = await invokeDatabase<{ projects?: NeonProject[] }>(
        props.threadId,
        "neon:list-projects",
        undefined,
        props.workspaceRoot,
      );
      setNeonProjects(Array.isArray(response?.projects) ? response.projects : []);
    });

  const loadSupabaseOrgs = () =>
    run(async () => {
      setShowSupabasePicker(true);
      setSupabaseProjects(null);
      const orgs = await invokeDatabase<SupabaseOrganization[]>(
        props.threadId,
        "supabase:list-organizations",
        undefined,
        props.workspaceRoot,
      );
      setSupabaseOrgs(Array.isArray(orgs) ? orgs : []);
    });

  const loadSupabaseProjects = (orgSlug: string) =>
    run(async () => {
      setSelectedOrgSlug(orgSlug);
      const all = await invokeDatabase<SupabaseProject[]>(
        props.threadId,
        "supabase:list-all-projects",
        undefined,
        props.workspaceRoot,
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
        }>(
          props.threadId,
          "neon:get-project",
          { projectId: app.neonProjectId },
          props.workspaceRoot,
        );
        const list =
          (Array.isArray(response as unknown as NeonBranch[])
            ? (response as unknown as NeonBranch[])
            : (response?.branches ?? response?.data?.branches)) ?? [];
        setBranches(list);
      });
  }, [app?.neonProjectId, run]);

  const setNeonBranch = (branchId: string) =>
    run(async () => {
      if (!app) return;
      await invokeDatabase(
        props.threadId,
        "neon:set-active-branch",
        { appId: app.id, branchId },
        props.workspaceRoot,
      );
      await refreshApp();
    });

  const createNeonProject = () =>
    run(async () => {
      if (!app || !newProjectName.trim()) return;
      const res = await invokeDatabase<{ project?: { id: string } }>(
        props.threadId,
        "neon:create-project",
        { appId: app.id, workspaceRoot: props.workspaceRoot, name: newProjectName.trim() },
        props.workspaceRoot,
      );
      setNewProjectName("");
      setShowNeonPicker(false);
      setNeonProjects(null);
      await refreshApp();
      resolvePendingIntegration("neon", res?.project?.id);
    });

  const createSupabaseProject = () =>
    run(async () => {
      if (!app || !selectedOrgSlug || !newProjectName.trim()) return;
      const res = await invokeDatabase<{ project?: { id: string } }>(
        props.threadId,
        "supabase:create-project",
        {
          appId: app.id,
          workspaceRoot: props.workspaceRoot,
          name: newProjectName.trim(),
          organizationId: selectedOrgSlug,
        },
        props.workspaceRoot,
      );
      setNewProjectName("");
      setShowSupabasePicker(false);
      setSupabaseProjects(null);
      await refreshApp();
      resolvePendingIntegration("supabase", res?.project?.id);
    });

  const headerTitle = app ? `Database — ${app.name}` : "Database";

  return (
    <div className="flex h-full flex-col">
      <DockPaneHeader title={headerTitle} onClose={props.onClose} />
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-3 text-sm">
          {loading && <PanelStateMessage>Loading database configuration...</PanelStateMessage>}

          {!loading && resolveError && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-muted/20 p-6 text-center text-xs text-muted-foreground my-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
                <DatabaseIcon className="size-5" />
              </div>
              <div className="flex flex-col gap-1 max-w-xs">
                <span className="font-medium text-foreground text-sm">Database Unavailable</span>
                <span className="text-muted-foreground leading-relaxed">{resolveError}</span>
              </div>
              <Button
                size="xs"
                variant="outline"
                onClick={() => refreshApp()}
                className="gap-1.5 mt-2"
              >
                <RefreshCwIcon className="size-3" /> Retry
              </Button>
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
                    <div className="flex flex-col gap-2">
                      <p className="text-xs text-muted-foreground">
                        Link a Neon project to give the agent a managed Postgres database with
                        branching.
                      </p>
                      {dbAuth.neonConnected ? (
                        <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-2.5 py-1.5 text-xs">
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2Icon className="size-3.5 text-emerald-500" />
                            <span>Neon account linked</span>
                          </div>
                          <Button size="xs" variant="ghost" onClick={dbAuth.disconnectNeon}>
                            Disconnect
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          onClick={dbAuth.connectNeon}
                          className="gap-1.5"
                        >
                          Connect Neon (1-Click OAuth)
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={loadNeonProjects}
                      >
                        <PlusIcon className="size-3" /> Link Neon project
                      </Button>
                    </div>
                  )}

                  {showNeonPicker && (
                    <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-border p-1">
                      {(neonProjects ?? []).length === 0 && (
                        <li className="px-2 py-1 text-xs text-muted-foreground">
                          {neonProjects === null
                            ? "Loading projects..."
                            : "No Neon projects found — create one below or add a token in Settings → Database."}
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
                      <li className="flex gap-1 border-t border-border p-1">
                        <Input
                          className="min-w-0 flex-1 text-xs"
                          placeholder="New project name"
                          value={newProjectName}
                          disabled={busy}
                          onChange={(e) => setNewProjectName(e.target.value)}
                        />
                        <Button
                          size="xs"
                          disabled={busy || !newProjectName.trim()}
                          onClick={createNeonProject}
                        >
                          Create
                        </Button>
                      </li>
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
                    <div className="flex flex-col gap-2">
                      <p className="text-xs text-muted-foreground">
                        Link a Supabase project for auth, storage, and edge functions.
                      </p>
                      {dbAuth.supabaseConnected ? (
                        <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-2.5 py-1.5 text-xs">
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2Icon className="size-3.5 text-emerald-500" />
                            <span>Supabase account linked</span>
                          </div>
                          <Button size="xs" variant="ghost" onClick={dbAuth.disconnectSupabase}>
                            Disconnect
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          onClick={dbAuth.connectSupabase}
                          className="gap-1.5"
                        >
                          Connect Supabase (1-Click OAuth)
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={loadSupabaseOrgs}
                      >
                        <PlusIcon className="size-3" /> Link Supabase project
                      </Button>
                    </div>
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
                          <li className="flex gap-1 border-t border-border p-1">
                            <input
                              className="min-w-0 flex-1 rounded-md border border-border bg-transparent px-2 py-1 text-xs"
                              placeholder="New project name"
                              value={newProjectName}
                              disabled={busy}
                              onChange={(e) => setNewProjectName(e.target.value)}
                            />
                            <Button
                              size="xs"
                              disabled={busy || !newProjectName.trim()}
                              onClick={createSupabaseProject}
                            >
                              Create
                            </Button>
                          </li>
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
              <ProjectConnectionSection workspaceRoot={props.workspaceRoot} />
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

/**
 * Project default assignment: binds one settings connection to this
 * project's workspace so its chats use it instead of the global default.
 * Writes through the settings store (triggers a settings sync).
 */
function ProjectConnectionSection(props: { workspaceRoot?: string | null | undefined }) {
  const [version, setVersion] = useState(0);
  if (!props.workspaceRoot) return null;
  const root = props.workspaceRoot;
  const connections = loadConnections().filter((c) => c.enabled && c.databaseUrl);
  const bound = connections.find((c) => connectionMatchesWorkspace(c, root));
  const assign = (id: string | null) => {
    saveConnections(
      loadConnections().map((c) =>
        c.id === id
          ? { ...c, scope: { type: "project" as const, workspaceRoot: normalizeScopeRoot(root) } }
          : c.scope?.type === "project" &&
              c.scope.workspaceRoot &&
              normalizeScopeRoot(c.scope.workspaceRoot) === normalizeScopeRoot(root)
            ? { ...c, scope: { type: "global" as const } }
            : c,
      ),
    );
    setVersion((v) => v + 1);
  };
  void version;
  if (connections.length === 0) {
    return (
      <section className="rounded-lg border border-border">
        <header className="border-b border-border px-3 py-2">
          <div className="font-medium">Project default</div>
        </header>
        <div className="p-3 text-xs text-muted-foreground">
          No saved connections. Add one in Settings → Database, then bind it here.
        </div>
      </section>
    );
  }
  return (
    <section className="rounded-lg border border-border">
      <header className="border-b border-border px-3 py-2">
        <div className="font-medium">Project default</div>
      </header>
      <div className="flex flex-col gap-1 p-2">
        {connections.map((c) => {
          const isBound = bound?.id === c.id;
          return (
            <div key={c.id} className="flex items-center gap-2 rounded-md px-2 py-1 text-xs">
              <span className="min-w-0 flex-1 truncate">
                {c.name} <span className="text-muted-foreground">· {c.provider}</span>
              </span>
              {isBound ? (
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2Icon className="size-3" /> This project
                </Badge>
              ) : (
                <Button size="xs" variant="outline" onClick={() => assign(c.id)}>
                  Use for this project
                </Button>
              )}
            </div>
          );
        })}
        {bound ? (
          <div className="px-2 pb-1">
            <Button size="xs" variant="ghost" onClick={() => assign("__clear__")}>
              Clear project binding (fall back to global default)
            </Button>
          </div>
        ) : (
          <div className="px-2 pb-1 text-[11px] text-muted-foreground">
            No binding — this project uses the global default connection.
          </div>
        )}
      </div>
    </section>
  );
}
