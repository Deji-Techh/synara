// FILE: ProjectPanel.tsx
// Purpose: Right-dock Project pane — per-project context that used to live
// only in global settings or nowhere: default model (display), project
// instructions (editor), MCP server enable-set (per-project overlay),
// preview display defaults, and environment info. Credentials stay in
// settings; mutations here write project-scoped stores only.

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { ProjectId, ThreadId } from "@caide/contracts";
import { syncAllActiveHarnessSettings } from "~/harnessWs";
import { useStore } from "~/store";
import { createProjectSelector, createThreadWorkspaceMetadataSelector } from "~/storeSelectors";
import { useProjectInstructionsStore } from "~/projectInstructionsStore";
import { loadPreviewDefaults, savePreviewDefaults } from "~/previewDefaultsStore";
import {
  loadServers,
  type McpServerConfig,
} from "../settings/mcpServersStore";
import {
  loadProjectOverrides,
  normalizeProjectRoot,
  setProjectServerEnabled,
} from "../settings/mcpProjectOverrides";
import { DockPaneHeader } from "./DockPaneHeader";
import { PanelStateMessage } from "./PanelStateMessage";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { cn } from "~/lib/utils";

function Section(props: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border">
      <header className="border-b border-border px-3 py-2">
        <div className="font-medium">{props.title}</div>
        {props.hint ? <div className="text-[11px] text-muted-foreground">{props.hint}</div> : null}
      </header>
      <div className="flex flex-col gap-2 p-3">{props.children}</div>
    </section>
  );
}

function ModelSection(props: { projectId: ProjectId | null }) {
  const project = useStore(
    useMemo(() => createProjectSelector(props.projectId), [props.projectId]),
  );
  const fallback = project?.defaultModelSelection as
    | { provider?: unknown; model?: unknown }
    | null
    | undefined;
  const provider = typeof fallback?.provider === "string" ? fallback.provider : null;
  const model = typeof fallback?.model === "string" ? fallback.model : null;
  return (
    <Section
      title="Default model"
      hint="New threads start here; each thread can still pick its own model in the composer."
    >
      {provider ? (
        <div className="font-mono text-[11px]">
          {provider}
          {model ? ` · ${model}` : ""}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">
          No project default — new threads use the global default. The default is set when the
          project is created.
        </div>
      )}
    </Section>
  );
}

function InstructionsSection(props: { projectId: ProjectId | null }) {
  const stored = useProjectInstructionsStore((s) =>
    props.projectId ? (s.instructionsByProjectId[props.projectId] ?? "") : "",
  );
  const setInstructions = useProjectInstructionsStore((s) => s.setInstructions);
  const [draft, setDraft] = useState<string | null>(null);
  if (!props.projectId) return null;
  const value = draft ?? stored;
  const dirty = draft !== null && draft !== stored;
  return (
    <Section title="Project instructions" hint="Injected into thread notes on request.">
      <Textarea
        className="min-h-24 font-mono text-[11px]"
        placeholder="Conventions, constraints, things the agent must always know for this project…"
        value={value}
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        {dirty ? (
          <Button size="xs" variant="ghost" onClick={() => setDraft(null)}>
            Discard
          </Button>
        ) : null}
        <Button
          size="xs"
          disabled={!dirty}
          onClick={() => {
            if (props.projectId && draft !== null) setInstructions(props.projectId, draft);
            setDraft(null);
          }}
        >
          Save instructions
        </Button>
      </div>
    </Section>
  );
}

function McpSection(props: { workspaceRoot?: string | null }) {
  const [version, setVersion] = useState(0);
  const [servers, setServers] = useState<McpServerConfig[]>(() => loadServers());
  if (!props.workspaceRoot) return null;
  const root = props.workspaceRoot;
  const refresh = () => {
    setServers(loadServers());
    setVersion((v) => v + 1);
  };
  void version;
  const overrides = loadProjectOverrides();
  const toggle = (server: McpServerConfig, enabled: boolean) => {
    setProjectServerEnabled(root, server.id, enabled, server.enabled);
    syncAllActiveHarnessSettings();
    refresh();
  };
  if (servers.length === 0) {
    return (
      <Section title="MCP servers" hint="No servers registered. Add them in Settings → MCP servers.">
        <div className="text-xs text-muted-foreground">Nothing to scope yet.</div>
      </Section>
    );
  }
  return (
    <Section
      title="MCP servers"
      hint="Enable servers for this project only. Registry and secrets stay global in Settings."
    >
      {servers.map((server) => {
        const override = overrides[server.id]?.[normalizeProjectRoot(root)];
        const effective = override ?? server.enabled;
        return (
          <div key={server.id} className="flex items-center gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate">
              {server.name}
              <span className="text-muted-foreground"> · {server.transport}</span>
              {override !== undefined ? (
                <span className="text-muted-foreground"> · project override</span>
              ) : null}
            </span>
            <Switch
              checked={effective}
              onCheckedChange={(checked) => toggle(server, Boolean(checked))}
              aria-label={`Enable ${server.name} for this project`}
            />
          </div>
        );
      })}
    </Section>
  );
}

function PreviewSection(props: { workspaceRoot?: string | null }) {
  const [version, setVersion] = useState(0);
  if (!props.workspaceRoot) return null;
  const defaults = loadPreviewDefaults(props.workspaceRoot);
  void version;
  const reset = () => {
    if (!props.workspaceRoot) return;
    savePreviewDefaults(props.workspaceRoot, { viewport: "full", deviceClass: "phone", colorScheme: "light" });
    setVersion((v) => v + 1);
  };
  return (
    <Section
      title="Preview display"
      hint="Defaults applied when the preview stage opens. Change per session in the stage's Display branch."
    >
      <div className="font-mono text-[11px] text-muted-foreground">
        viewport {defaults.viewport} · {defaults.deviceClass} · {defaults.colorScheme}
      </div>
      <div className="flex justify-end">
        <Button size="xs" variant="ghost" onClick={reset}>
          Reset to stage defaults
        </Button>
      </div>
    </Section>
  );
}

function EnvironmentSection(props: { threadId: ThreadId }) {
  const workspace = useStore(useMemo(() => createThreadWorkspaceMetadataSelector(props.threadId), [props.threadId]));
  return (
    <Section title="Environment" hint="Managed in the thread handoff dialog; shown here for context.">
      <div className="font-mono text-[11px] text-muted-foreground">
        <div>mode {workspace.envMode ?? "local"}</div>
        {workspace.worktreePath ? <div className="truncate" title={workspace.worktreePath}>{workspace.worktreePath}</div> : null}
        {workspace.workingDirectory ? (
          <div className="truncate" title={workspace.workingDirectory}>{workspace.workingDirectory}</div>
        ) : null}
      </div>
    </Section>
  );
}

function SkillsSection() {
  return (
    <Section
      title="Skills"
      hint="Skill enable/disable is global today. Per-project assignment lives here next."
    >
      <div className="text-xs text-muted-foreground">
        Manage skills in Settings → Skills. Project-local skill files under{" "}
        <code>.agents/</code> are picked up automatically.
      </div>
    </Section>
  );
}

export function ProjectPanel(props: {
  threadId: ThreadId;
  projectId: ProjectId | null;
  workspaceRoot?: string | null;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <DockPaneHeader title="Project" onClose={props.onClose} closeLabel="Close project pane" />
      <div className={cn("min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2")}>
        {!props.projectId ? (
          <PanelStateMessage>This chat has no project yet.</PanelStateMessage>
        ) : (
          <>
            <ModelSection projectId={props.projectId} />
            <InstructionsSection projectId={props.projectId} />
            <McpSection workspaceRoot={props.workspaceRoot} />
            <PreviewSection workspaceRoot={props.workspaceRoot} />
            <EnvironmentSection threadId={props.threadId} />
            <SkillsSection />
          </>
        )}
      </div>
    </div>
  );
}
