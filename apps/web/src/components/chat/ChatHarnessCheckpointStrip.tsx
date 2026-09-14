// FILE: ChatHarnessCheckpointStrip.tsx
// Purpose: Surface parked turn checkpoints (human-gate approvals with diffs)
// directly above the composer. Without this, a turn waiting on checkpoint
// approval shows no card and reads as hung. Thin wrapper over
// CheckpointCard keyed by the active thread's harness-store checkpoint.

import { useRef, useState } from "react";
import { CheckpointCard } from "~/components/CheckpointCard";
import { harnessStore, useHarnessStore } from "~/harnessStore";

type SendFn = (message: Record<string, unknown>) => void;

export function ChatHarnessCheckpointStrip(props: { threadId: string | null; send: SendFn }) {
  const state = useHarnessStore();
  const [actedId, setActedId] = useState<string | null>(null);
  const responseSent = useRef(false);
  const checkpoint = props.threadId ? state.sessions[props.threadId]?.checkpoint : undefined;

  if (!props.threadId || !checkpoint || actedId === checkpoint.id) return null;

  // Double-submit guard + optimistic store clear (remount resurrection).
  const respond = (fn: () => void, id: string) => {
    if (responseSent.current) return;
    responseSent.current = true;
    fn();
    if (props.threadId) harnessStore.resolveCheckpoint(props.threadId);
    setActedId(id);
  };

  return (
    <div className="max-h-56 overflow-y-auto overscroll-contain px-1">
      <CheckpointCard
        id={checkpoint.id}
        reason={checkpoint.reason}
        {...(checkpoint.diff ? { diff: checkpoint.diff } : {})}
        onApprove={(id) => {
          respond(
            () =>
              props.send({
                type: "checkpoint_response",
                sessionId: props.threadId,
                checkpointId: id,
                approved: true,
              }),
            id,
          );
        }}
        onRequestChange={(id, feedback) => {
          respond(
            () =>
              props.send({
                type: "checkpoint_response",
                sessionId: props.threadId,
                checkpointId: id,
                approved: false,
                feedback,
              }),
            id,
          );
        }}
      />
    </div>
  );
}
