// FILE: ChatHarnessCheckpointStrip.tsx
// Purpose: Surface parked turn checkpoints (human-gate approvals with diffs)
// directly above the composer. Without this, a turn waiting on checkpoint
// approval shows no card and reads as hung. Thin wrapper over
// CheckpointCard keyed by the active thread's harness-store checkpoint.

import { useState } from "react";
import { CheckpointCard } from "~/components/CheckpointCard";
import { useHarnessStore } from "~/harnessStore";

type SendFn = (message: Record<string, unknown>) => void;

export function ChatHarnessCheckpointStrip(props: { threadId: string | null; send: SendFn }) {
  const state = useHarnessStore();
  const [actedId, setActedId] = useState<string | null>(null);
  const checkpoint = props.threadId ? state.sessions[props.threadId]?.checkpoint : undefined;

  if (!props.threadId || !checkpoint || actedId === checkpoint.id) return null;

  return (
    <div className="px-1">
      <CheckpointCard
        id={checkpoint.id}
        reason={checkpoint.reason}
        {...(checkpoint.diff ? { diff: checkpoint.diff } : {})}
        onApprove={(id) => {
          props.send({
            type: "checkpoint_response",
            sessionId: props.threadId,
            checkpointId: id,
            approved: true,
          });
          setActedId(id);
        }}
        onRequestChange={(id, feedback) => {
          props.send({
            type: "checkpoint_response",
            sessionId: props.threadId,
            checkpointId: id,
            approved: false,
            feedback,
          });
          setActedId(id);
        }}
      />
    </div>
  );
}
