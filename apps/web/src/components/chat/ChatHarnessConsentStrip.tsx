// FILE: ChatHarnessConsentStrip.tsx
// Purpose: Surface parked turn approvals (tool consent, MCP consent,
// questionnaires, env keys, integrations) directly above the desktop
// composer. Without this, a turn waiting on approval shows no card in the
// main transcript and reads as hung until cancel flushes the settle.

import { HarnessPrompts } from "~/components/harness/HarnessPrompts";

type SendFn = (message: Record<string, unknown>) => void;

export function ChatHarnessConsentStrip(props: { threadId: string | null; send: SendFn }) {
  if (!props.threadId) return null;
  return <HarnessPrompts sessionId={props.threadId} send={props.send} />;
}
