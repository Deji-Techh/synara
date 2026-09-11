// FILE: PublishPanel.tsx
// Purpose: Right-dock Publish pane (Phase 4d). Reads the app's publish links
// from .caide/publish.json and shows GitHub / Vercel / Coolify state with
// runbooks. Mutations stay agent-driven (tools + consent); the pane links
// state and tells the user exactly what to ask for.

import { useQuery } from "@tanstack/react-query";
import type { ThreadId } from "@caide/contracts";
import { projectReadFileQueryOptions } from "~/lib/projectReactQuery";
import { DockPaneHeader } from "./DockPaneHeader";
import { PanelStateMessage } from "./PanelStateMessage";

interface PublishLinks {
  github?: { org?: string; repo: string; branch?: string };
  vercel?: { projectId: string; projectName?: string; deploymentUrl?: string; teamId?: string };
  coolify?: { instanceUrl?: string; projectUuid?: string; domain?: string; applicationUuid?: string };
}

function parseLinks(raw: string | null | undefined): PublishLinks | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PublishLinks;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.github && !parsed.vercel && !parsed.coolify) return null;
    return parsed;
  } catch {
    return null;
  }
}

function Row(props: { title: string; lines: string[]; hint: string }) {
  return (
    <div className="rounded-lg border border-border/60 px-3 py-2.5">
      <div className="text-[12px] font-semibold">{props.title}</div>
      <div className="mt-1 space-y-0.5">
        {props.lines.map((line) => (
          <div key={line} className="truncate font-mono text-[11px] text-muted-foreground" title={line}>
            {line}
          </div>
        ))}
      </div>
      <div className="mt-1.5 text-[11px] text-muted-foreground/80">{props.hint}</div>
    </div>
  );
}

export function PublishPanel(props: { threadId: ThreadId; workspaceRoot?: string | null; onClose: () => void }) {
  const query = useQuery({
    ...projectReadFileQueryOptions({ cwd: props.workspaceRoot ?? null, relativePath: ".caide/publish.json" }),
  });
  const data = query.data as { contents?: unknown } | undefined;
  const links = parseLinks(typeof data?.contents === "string" ? data.contents : null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DockPaneHeader title="Publish" onClose={props.onClose} closeLabel="Close publish pane" />
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2">
        {!props.workspaceRoot ? (
          <PanelStateMessage>This chat has no project workspace.</PanelStateMessage>
        ) : query.isPending ? (
          <PanelStateMessage>Loading publish links…</PanelStateMessage>
        ) : !links ? (
          <div className="space-y-2">
            <PanelStateMessage>Nothing linked yet.</PanelStateMessage>
            <div className="rounded-lg border border-border/60 px-3 py-2.5 text-[11px] text-muted-foreground">
              Ask the agent: “create a GitHub repo”, “connect Vercel”, or “connect my Coolify instance”. Links
              persist here across chats.
            </div>
          </div>
        ) : (
          <>
            {links.github ? (
              <Row
                title="GitHub"
                lines={[
                  `${links.github.org ? `${links.github.org}/` : ""}${links.github.repo}`,
                  ...(links.github.branch ? [`branch ${links.github.branch}`] : []),
                ]}
                hint="Ask the agent to push, check status, or invite a collaborator."
              />
            ) : null}
            {links.vercel ? (
              <Row
                title="Vercel"
                lines={[
                  links.vercel.projectName ?? links.vercel.projectId,
                  ...(links.vercel.deploymentUrl ? [links.vercel.deploymentUrl] : []),
                ]}
                hint="Ask the agent to deploy, list deployments, or sync Neon env vars."
              />
            ) : null}
            {links.coolify ? (
              <Row
                title="Coolify"
                lines={[
                  ...(links.coolify.instanceUrl ? [links.coolify.instanceUrl] : []),
                  ...(links.coolify.domain ? [links.coolify.domain] : []),
                ]}
                hint="Ask the agent to discover servers, deploy, or check status."
              />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
