// FILE: ChatHarnessConsentStrip.tsx
// Purpose: Surface parked turn approvals (tool consent, MCP consent,
// questionnaires, env keys, integrations) directly above the desktop
// composer. Without this, a turn waiting on approval shows no card in the
// main transcript and reads as hung until cancel flushes the settle.

import { HarnessPrompts } from "~/components/harness/HarnessPrompts";

type SendFn = (message: Record<string, unknown>) => void;

export function ChatHarnessConsentStrip(props: { threadId: string | null; send: SendFn }) {
  if (!props.threadId) return null;
  // Parked cards stack here (questionnaires, consents, keys). Cap the
  // height so a full stack scrolls in place instead of overlapping the
  // transcript or pushing the composer off-screen.
  return (
    <div className="max-h-80 min-h-0 overflow-y-auto overscroll-contain px-1">
      <HarnessPrompts sessionId={props.threadId} send={props.send} />
    </div>
  );
}
