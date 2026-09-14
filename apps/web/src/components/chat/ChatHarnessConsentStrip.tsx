// FILE: ChatHarnessConsentStrip.tsx
// Purpose: Surface parked turn approvals (tool consent, MCP consent,
// questionnaires, env keys, integrations) directly above the desktop
// composer. Without this, a turn waiting on approval shows no card in the
// main transcript and reads as hung until cancel flushes the settle.

import { HarnessPrompts } from "~/components/harness/HarnessPrompts";
import { useHarnessStore } from "~/harnessStore";

type SendFn = (message: Record<string, unknown>) => void;

export function ChatHarnessConsentStrip(props: { threadId: string | null; send: SendFn }) {
  const state = useHarnessStore();
  const promptCount = props.threadId ? (state.sessions[props.threadId]?.prompts.length ?? 0) : 0;
  // Null (not an empty scroll shell) when there's nothing to show, so the
  // composer seam is untouched.
  if (!props.threadId || promptCount === 0) return null;
  return (
    <div className="max-h-80 min-h-0 overflow-y-auto overscroll-contain px-1">
      <HarnessPrompts sessionId={props.threadId} send={props.send} />
    </div>
  );
}
