// FILE: HarnessSessionHost.tsx
// Purpose: Per-thread harness wiring: owns the socket, registers the send
// handle, reveals dock panes on ui_reveal. Renders NO visual cards: nothing
// may sit above the chat header. History (tool calls, verifier, versions)
// renders in the transcript tail inside ChatView; approvals (prompts, plan,
// blueprint) render in the above-composer strip.

import type { ProjectId, ThreadId } from "@caide/contracts";
import { useHarnessSession } from "~/hooks/useHarnessSession";
import { useStore } from "~/store";
import { HarnessReveals } from "./HarnessReveals";

export function HarnessSessionHost(props: { threadId: ThreadId; projectId: ProjectId | null }) {
  const project = useStore((store) =>
    props.projectId ? (store.projects.find((p) => p.id === props.projectId) ?? null) : null,
  );
  const appPath = project?.cwd ?? "";
  const framework = project?.framework;
  useHarnessSession(props.threadId, appPath, framework);

  if (!project) return null;

  return <HarnessReveals threadId={props.threadId} sessionId={props.threadId} />;
}
