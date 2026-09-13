// FILE: HarnessSessionHost.tsx
// Purpose: Per-thread harness wiring: owns the socket, registers the send
// handle, reveals dock panes on ui_reveal, and renders the harness card
// stack (prompts, plan + continue gate, blueprint approval) above the chat.
// v1 placement: cards render in normal flow just above the transcript. The
// todos strip lives docked above the composer (ChatHarnessTodosStrip, P1) —
// single instance, never duplicated here.

import type { ProjectId, ThreadId } from "@caide/contracts";
import { useHarnessSession } from "~/hooks/useHarnessSession";
import { useStore } from "~/store";
import { HarnessBlueprintCard } from "./HarnessBlueprintCard";
import { HarnessPlanCard } from "./HarnessPlanCard";
import { HarnessReveals } from "./HarnessReveals";
import { HarnessVerifierCard } from "./HarnessVerifierCard";
import { HarnessVersionsCard } from "./HarnessVersionsCard";
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
    // shrink-0: this stack sits above the transcript in the inset flex
    // column — it must never shrink the transcript out of its box when cards
    // mount, nor grow past its cap (long stacks scroll in place).
    <div className="shrink-0">
      <HarnessReveals threadId={props.threadId} sessionId={props.threadId} />
      <div className="max-h-[38dvh] overflow-y-auto overscroll-contain px-3">
        <HarnessVerifierCard sessionId={props.threadId} />
        <HarnessVersionsCard sessionId={props.threadId} send={send} />
        <HarnessTranscript sessionId={props.threadId} send={send} />
        {/* Prompts (questionnaires, consents) render ONLY in the above-composer
            strip (ChatHarnessConsentStrip) — mounting them here too showed every
            card twice. */}
        <HarnessPlanCard sessionId={props.threadId} send={send} />
        <HarnessBlueprintCard sessionId={props.threadId} send={send} />
      </div>
    </div>
  );
}
