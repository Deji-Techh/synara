// FILE: McpServersSettingsPanel.tsx
// Purpose: Dyad-style MCP settings — servers YOUR agent connects to
// (stdio/SSE/OAuth), per-server consent defaults, safe auto-approve policy.
// Replaces ExternalMcpSettingsPanel (which exposed Caide outward to other
// agents — the opposite direction). Same Caide settings primitives/styling.

import { useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import { DisclosureChevron } from "~/components/ui/DisclosureChevron";
import { DisclosureRegion } from "~/components/ui/DisclosureRegion";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";
import { toastManager } from "~/components/ui/toast";
import { copyTextToClipboard } from "~/hooks/useCopyToClipboard";
import { cn } from "~/lib/utils";
import { SettingsListRow, SettingsRow, SettingsSection } from "./SettingsPanelPrimitives";
import {
  defaultPrefs,
  loadPrefs,
  loadServers,
  newServerId,
  savePrefs,
  saveServers,
  validateServer,
  type McpServerConfig,
  type McpTransportKind,
} from "./mcpServersStore";

function transportLabel(t: McpTransportKind): string {
  return t === "stdio" ? "stdio" : t === "sse" ? "SSE" : "OAuth";
}

function emptyDraft(): McpServerConfig {
  return {
    id: newServerId(),
    name: "",
    transport: "stdio",
    enabled: true,
    command: "",
    args: [],
    env: {},
    url: "",
    headers: {},
    defaultConsent: "ask",
    createdAt: Date.now(),
  };
}

export function McpServersSettingsPanel(props: { active: boolean }) {
  const [servers, setServers] = useState<McpServerConfig[]>(() => loadServers());
  const [prefs, setPrefs] = useState(() => loadPrefs());
  const [draft, setDraft] = useState<McpServerConfig>(() => emptyDraft());
  const [draftArgs, setDraftArgs] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const persist = (next: McpServerConfig[]) => {
    setServers(next);
    saveServers(next);
  };
  const persistPrefs = (next: typeof prefs) => {
    setPrefs(next);
    savePrefs(next);
  };

  const draftProblems = useMemo(() => validateServer(draft, servers), [draft, servers]);

  if (!props.active) return null;

  const addServer = () => {
    if (draftProblems.length > 0) return;
    const server: McpServerConfig = {
      ...draft,
      name: draft.name.trim(),
      args: draftArgs.split(/\s+/).map((a) => a.trim()).filter(Boolean),
      createdAt: Date.now(),
    };
    persist([...servers, server]);
    setDraft(emptyDraft());
    setDraftArgs("");
    setAdding(false);
    toastManager.add({ type: "success", title: `MCP server "${server.name}" added` });
  };

  const exportJson = () => {
    const payload = JSON.stringify({ servers, prefs }, null, 2);
    void copyTextToClipboard(payload).then(
      () => toastManager.add({ type: "success", title: "MCP configuration copied" }),
      () =>
        toastManager.add({ type: "error", title: "Could not copy", description: "Clipboard access failed." }),
    );
  };

  const importJson = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const parsed = JSON.parse(text) as { servers?: McpServerConfig[]; prefs?: typeof prefs };
      if (!Array.isArray(parsed.servers)) throw new Error("bad shape");
      const problems = parsed.servers.flatMap((s) => validateServer(s, []));
      if (problems.length > 0) throw new Error(problems[0]);
      persist(parsed.servers);
      if (parsed.prefs) persistPrefs({ autoApproveSafe: parsed.prefs.autoApproveSafe !== false });
      toastManager.add({ type: "success", title: `${parsed.servers.length} MCP server(s) imported` });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not import",
        description: error instanceof Error ? error.message : "Clipboard did not contain MCP configuration.",
      });
    }
  };

  return (
    <div className="space-y-6">
      <SettingsSection
        title="MCP servers"
        action={
          <div className="flex items-center gap-2">
            <Button size="xs" variant="ghost" onClick={importJson}>
              Import
            </Button>
            <Button size="xs" variant="ghost" onClick={exportJson}>
              Export
            </Button>
            <Button size="xs" variant="outline" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
              Add server
              <DisclosureChevron open={adding} className="ml-1 size-3.5" />
            </Button>
          </div>
        }
      >
        <DisclosureRegion open={adding} contentClassName="mt-3 space-y-3 border-t border-border/70 pt-3">
          <SettingsRow
            title="Name"
            description="How this server appears in consent prompts and tool names (server__tool)."
            control={
              <Input
                className="w-full sm:w-64"
                value={draft.name}
                maxLength={80}
                placeholder="github"
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            }
          />
          <SettingsRow
            title="Transport"
            description="stdio runs a local command. SSE connects to a URL. OAuth adds an authorize step."
            control={
              <div className="flex gap-1 rounded-lg border border-border/70 p-0.5">
                {(["stdio", "sse", "oauth"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setDraft({ ...draft, transport: t })}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                      draft.transport === t ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {transportLabel(t)}
                  </button>
                ))}
              </div>
            }
          />
          {draft.transport === "stdio" ? (
            <>
              <SettingsRow
                title="Command"
                description="Executable on PATH (npx, uvx, node, python…)."
                control={
                  <Input
                    className="w-full sm:w-64"
                    value={draft.command ?? ""}
                    placeholder="npx"
                    onChange={(e) => setDraft({ ...draft, command: e.target.value })}
                  />
                }
              />
              <SettingsRow
                title="Arguments"
                description="Space-separated (e.g. -y @modelcontextprotocol/server-github)."
                control={
                  <Input
                    className="w-full sm:w-64"
                    value={draftArgs}
                    placeholder="-y mcp-server …"
                    onChange={(e) => setDraftArgs(e.target.value)}
                  />
                }
              />
            </>
          ) : (
            <>
              <SettingsRow
                title="URL"
                description={draft.transport === "oauth" ? "MCP endpoint URL." : "SSE endpoint URL."}
                control={
                  <Input
                    className="w-full sm:w-64"
                    value={draft.url ?? ""}
                    placeholder="https://…"
                    onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                  />
                }
              />
              {draft.transport === "oauth" ? (
                <SettingsRow
                  title="Authorize URL"
                  description="OAuth authorize endpoint for this server."
                  control={
                    <Input
                      className="w-full sm:w-64"
                      value={draft.authorizeUrl ?? ""}
                      placeholder="https://…/authorize"
                      onChange={(e) => setDraft({ ...draft, authorizeUrl: e.target.value })}
                    />
                  }
                />
              ) : null}
            </>
          )}
          {draftProblems.length > 0 ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
              {draftProblems.map((p) => (
                <div key={p}>{p}</div>
              ))}
            </div>
          ) : null}
          <div className="flex justify-end">
            <Button size="sm" disabled={draftProblems.length > 0} onClick={addServer}>
              Add server
            </Button>
          </div>
        </DisclosureRegion>
      </SettingsSection>

      <SettingsSection title={`Connected servers (${servers.filter((s) => s.enabled).length}/${servers.length})`}>
        {servers.length === 0 ? (
          <SettingsListRow
            title="No MCP servers"
            description="Add one above. The agent finds its tools via search_mcp_tools in normal chat or /mcp commands."
          />
        ) : (
          servers.map((server) => {
            const expanded = expandedId === server.id;
            const problems = validateServer(server, servers);
            return (
              <div key={server.id} className="border-b border-border/50 last:border-b-0">
                <div className="flex items-center gap-2 px-1 py-2">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    aria-expanded={expanded}
                    onClick={() => setExpandedId(expanded ? null : server.id)}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        !server.enabled
                          ? "bg-muted-foreground/40"
                          : problems.length > 0
                            ? "bg-destructive"
                            : "bg-green-500",
                      )}
                    />
                    <span className="truncate text-xs font-medium">{server.name}</span>
                    <span className="shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset ring-border text-muted-foreground">
                      {transportLabel(server.transport)}
                    </span>
                    {problems.length > 0 ? (
                      <span className="shrink-0 text-[10.5px] text-destructive">Needs attention</span>
                    ) : null}
                  </button>
                  <Switch
                    checked={server.enabled}
                    onCheckedChange={(enabled) =>
                      persist(servers.map((s) => (s.id === server.id ? { ...s, enabled } : s)))
                    }
                    aria-label={`Enable ${server.name}`}
                  />
                  <DisclosureChevron open={expanded} className="size-3.5 text-muted-foreground" />
                </div>
                <DisclosureRegion open={expanded} contentClassName="space-y-3 px-1 pb-3">
                  <div className="rounded-lg bg-muted/30 px-3 py-2 font-mono text-[11px] text-muted-foreground">
                    {server.transport === "stdio"
                      ? `${server.command ?? ""} ${(server.args ?? []).join(" ")}`.trim() || "—"
                      : server.url || "—"}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-medium">Default tool consent</div>
                      <div className="text-[11px] text-muted-foreground">
                        ask prompts per call · always runs free · never blocks the tool.
                      </div>
                    </div>
                    <div className="flex gap-1 rounded-lg border border-border/70 p-0.5">
                      {(["ask", "always", "never"] as const).map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() =>
                            persist(servers.map((s) => (s.id === server.id ? { ...s, defaultConsent: c } : s)))
                          }
                          className={cn(
                            "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                            (server.defaultConsent ?? "ask") === c
                              ? "bg-muted text-foreground"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      size="xs"
                      variant="destructive-outline"
                      onClick={() => {
                        persist(servers.filter((s) => s.id !== server.id));
                        toastManager.add({ type: "success", title: `"${server.name}" removed` });
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </DisclosureRegion>
              </div>
            );
          })
        )}
      </SettingsSection>

      <SettingsSection title="Agent consent policy">
        <SettingsRow
          title="Auto-approve safe MCP calls"
          description="Read-only observations, sandbox-confined actions, and reversible in-project writes run without asking (donor classifier policy). Exfiltration, external comms, credentials, and destructive actions always ask."
          control={
            <Switch
              checked={prefs.autoApproveSafe}
              onCheckedChange={(autoApproveSafe) => persistPrefs({ autoApproveSafe })}
            />
          }
        />
        <SettingsRow
          title="Using MCP tools"
          description="In normal chat the agent searches tools itself. With / commands, pick a server explicitly."
          control={
            <span className="font-mono text-[11px] text-muted-foreground">/mcp &lt;server&gt; &lt;tool&gt;</span>
          }
        />
      </SettingsSection>
    </div>
  );
}
