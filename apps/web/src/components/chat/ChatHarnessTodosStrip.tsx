// FILE: ChatHarnessTodosStrip.tsx
// Purpose: Dock the live harness to-do list directly above the desktop
// composer (P1). Thin wrapper over HarnessTodosCard keyed by the active
// server thread; renders nothing without a thread or with an empty list.

import { HarnessTodosCard } from "~/components/harness/HarnessTodosCard";

export function ChatHarnessTodosStrip(props: { threadId: string | null }) {
  if (!props.threadId) return null;
  return <HarnessTodosCard sessionId={props.threadId} />;
}
