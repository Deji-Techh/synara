// FILE: HarnessTranscript.tsx
// Purpose: Ordered harness-turn transcript: assistant text (grouped token
// runs through markdown), tool cards, checkpoints, and errors — in arrival
// order from the store timeline. The E16a transcript feed; the legacy
// orchestration timeline stays untouched.

import { useMemo } from "react";
import ChatMarkdown from "~/components/ChatMarkdown";
import { CheckpointCard } from "~/components/CheckpointCard";
import {
  CaideClaudeToolCard,
  type ToolCardStatus,
} from "~/components/chat/CaideClaudeToolCard";
import { useHarnessStore, type TimelineEntry } from "~/harnessStore";

type SendFn = (message: Record<string, unknown>) => void;

function toolState(status: string): ToolCardStatus {
  if (status === "started") return "running";
  if (status === "failed") return "error";
  return "complete";
}

function stringifyAttributes(args: unknown): Record<string, string> {
  if (!args || typeof args !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    out[key] = typeof value === "string" ? value : JSON.stringify(value) ?? "";
  }
  return out;
}

function stringifyResult(result: unknown): string {
  if (result === undefined || result === null) return "";
  return typeof result === "string" ? result : JSON.stringify(result, null, 2) ?? "";
}

interface RenderBlock {
  key: string;
  entry: TimelineEntry;
  text?: string;
}

export function HarnessTranscript(props: { sessionId: string; send: SendFn }) {
  const state = useHarnessStore();
  const session = state.sessions[props.sessionId];

  const blocks = useMemo<RenderBlock[]>(() => {
    if (!session) return [];
    const out: RenderBlock[] = [];
    let pendingText = "";
    const flushText = (seq: number) => {
      if (pendingText) {
        out.push({ key: `text-${seq}`, entry: { seq, kind: "token" }, text: pendingText });
        pendingText = "";
      }
    };
    for (const entry of session.timeline) {
      if (entry.kind === "token") {
        pendingText += entry.content ?? "";
      } else {
        flushText(entry.seq);
        out.push({ key: `${entry.kind}-${entry.seq}`, entry });
      }
    }
    flushText(Number.MAX_SAFE_INTEGER);
    return out;
  }, [session]);

  if (!session || blocks.length === 0) return null;

  return (
    <div className="flex flex-col">
      {blocks.map((block) => {
        if (block.entry.kind === "token") {
          return (
            <div key={block.key} className="py-1 text-sm">
              <ChatMarkdown text={block.text ?? ""} />
            </div>
          );
        }
        if (block.entry.kind === "tool") {
          const call = block.entry.id ? session.toolCalls[block.entry.id] : undefined;
          if (!call) return null;
          return (
            <CaideClaudeToolCard
              key={block.key}
              toolName={call.name}
              attributes={stringifyAttributes(call.args)}
              content={stringifyResult(call.result)}
              state={toolState(call.status)}
            />
          );
        }
        if (block.entry.kind === "checkpoint") {
          const checkpoint =
            block.entry.id && session.checkpoint?.id === block.entry.id ? session.checkpoint : undefined;
          if (!checkpoint) return null;
          return (
            <CheckpointCard
              key={block.key}
              id={checkpoint.id}
              reason={checkpoint.reason}
              diff={checkpoint.diff}
              onApprove={(id) => {
                props.send({
                  type: "checkpoint_response",
                  sessionId: props.sessionId,
                  checkpointId: id,
                  approved: true,
                });
              }}
              onRequestChange={(id, feedback) => {
                props.send({
                  type: "checkpoint_response",
                  sessionId: props.sessionId,
                  checkpointId: id,
                  approved: false,
                  feedback,
                });
              }}
            />
          );
        }
        if (block.entry.kind === "error") {
          return (
            <div
              key={block.key}
              className="my-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
            >
              {block.entry.content}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
