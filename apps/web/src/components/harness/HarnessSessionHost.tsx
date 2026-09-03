// FILE: HarnessSessionHost.tsx
// Purpose: Per-thread harness wiring: owns the socket, registers the send
// handle, reveals dock panes on ui_reveal, and renders the harness card
// stack (prompts, plan + continue gate, blueprint approval) above the chat.
// v1 placement: cards render in normal flow just above the transcript.

import type { ProjectId, ThreadId } from "@caide/contracts";
import { useHarnessSession } from "~/hooks/useHarnessSession";
import { useStore } from "~/store";
import { HarnessBlueprintCard } from "./HarnessBlueprintCard";
import { HarnessPlanCard } from "./HarnessPlanCard";
import { HarnessPrompts } from "./HarnessPrompts";
import { HarnessReveals } from "./HarnessReveals";
import { HarnessTranscript } from "./HarnessTranscript";

export function HarnessSessionHost(props: { threadId: ThreadId; projectId: ProjectId | null }) {
  const project = useStore((store) =>
    props.projectId ? (store.projects.find((p) => p.id === props.projectId) ?? null) : null,
  );
  const appPath = project?.cwd ?? "";
  const framework = project?.framework;
  const { send } = useHarnessSession(props.threadId, appPath, framework);

  if (!project) return null;

  return (
    <>
      <HarnessReveals threadId={props.threadId} sessionId={props.threadId} />
      <div className="px-3">
        <HarnessTranscript sessionId={props.threadId} send={send} />
        <HarnessPrompts sessionId={props.threadId} send={send} />
        <HarnessPlanCard sessionId={props.threadId} send={send} />
        <HarnessBlueprintCard sessionId={props.threadId} send={send} />
      </div>
    </>
  );
}
