// FILE: HarnessTranscript.tsx
// Purpose: Rich extras for harness turns — tool cards, checkpoints, and
// errors in arrival order from the store timeline. NOTE: no longer mounted
// in chat (tool calls project inline via the transcript mirror as
// <caide-tool> tags; checkpoints moved to the above-composer strip) — kept
// for the collapseRepetitiveLines/narrationStem unit exports + tests until
// the transcript-tool utilities are re-homed. Do NOT remount above the chat
// header (nothing renders above the header by product rule).

import { useMemo } from "react";
import { CheckpointCard } from "~/components/CheckpointCard";
import { CaideClaudeToolCard, type ToolCardStatus } from "~/components/chat/CaideClaudeToolCard";
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
    out[key] = typeof value === "string" ? value : (JSON.stringify(value) ?? "");
  }
  return out;
}

function stringifyResult(result: unknown): string {
  if (result === undefined || result === null) return "";
  return typeof result === "string" ? result : (JSON.stringify(result, null, 2) ?? "");
}

interface RenderBlock {
  key: string;
  entry: TimelineEntry;
  text?: string;
  /** Repeat count for collapsed duplicate status narration (item 16). */
  collapsedCount?: number;
}

/**
 * Status-stem of an assistant narration line: lowercased, trailing
 * "— detail" clause stripped, capped. Short lines return "" (never collapsed).
 */
export function narrationStem(line: string): string {
  const cleaned = line
    .trim()
    .toLowerCase()
    .replace(/\s+[—–-]\s+.*$/, "")
    .replace(/\s+/g, " ");
  return cleaned.length >= 20 ? cleaned.slice(0, 60) : "";
}

/**
 * Collapse repeated assistant status narration: a sentence whose stem already
 * appeared in `seen` is dropped; surviving first occurrences are added to
 * `seen`. Sentence-split (not line-split) so token chunks glued without
 * separators can't fuse distinct updates into one dropped line. The optional
 * set lets one memo pass share stems across token blocks separated by tool
 * rows (item 16). Pure — unit-tested.
 */
export function collapseRepetitiveLines(
  text: string,
  seen: Set<string> = new Set(),
): { text: string; collapsed: number } {
  // Keep separators so surviving paragraphs retain their formatting.
  const parts = text.split(/((?<=[.!?])\s+)/);
  const kept: string[] = [];
  let collapsed = 0;
  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i] ?? "";
    const sep = parts[i + 1] ?? "";
    const stem = narrationStem(sentence);
    if (stem && seen.has(stem)) {
      collapsed++;
      continue;
    }
    if (stem) seen.add(stem);
    kept.push(sentence + sep);
  }
  return { text: kept.join("").trimEnd(), collapsed };
}

export function HarnessTranscript(props: { sessionId: string; send: SendFn }) {
  const state = useHarnessStore();
  const session = state.sessions[props.sessionId];

  const blocks = useMemo<RenderBlock[]>(() => {
    if (!session) return [];
    // User bubbles + assistant text live in the thread transcript now (the
    // server mirrors harness turns there so chats read normally). This strip
    // keeps only the rich extras with no transcript equivalent: tool cards,
    // checkpoints, and errors. Token/user timeline entries are skipped here
    // to avoid showing every message twice.
    const out: RenderBlock[] = [];
    for (const entry of session.timeline) {
      if (entry.kind === "token" || entry.kind === "user") continue;
      out.push({ key: `${entry.kind}-${entry.seq}`, entry });
    }
    // Cap the rendered tail: long sessions accumulate hundreds of tool rows.
    // Newest-first is wrong here (live activity must sit at the bottom where
    // the eye already is), so keep the LAST N in chronological order.
    const MAX_TAIL_BLOCKS = 24;
    return out.length > MAX_TAIL_BLOCKS ? out.slice(out.length - MAX_TAIL_BLOCKS) : out;
  }, [session]);

  if (!session || blocks.length === 0) return null;

  const usage = session.lastUsage;
  const formatTokens = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);

  return (
    <div className="flex flex-col">
      {usage && (usage.inputTokens > 0 || usage.outputTokens > 0) && (
        <div className="flex justify-end py-1">
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {formatTokens(usage.inputTokens)} in · {formatTokens(usage.outputTokens)} out
          </span>
        </div>
      )}
      {blocks.map((block) => {
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
            block.entry.id && session.checkpoint?.id === block.entry.id
              ? session.checkpoint
              : undefined;
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
