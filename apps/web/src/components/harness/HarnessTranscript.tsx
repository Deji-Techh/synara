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
    const out: RenderBlock[] = [];
    const seenStems = new Set<string>();
    // Carry-over sentence parsing: token chunks glue without separators, so
    // evaluate complete sentences incrementally and carry the trailing
    // fragment. Streaming continuations rejoin correctly; separate steps
    // never fuse into one dropped line.
    let carry = "";
    let keptParts: string[] = [];
    let collapsed = 0;
    const feedChunk = (chunk: string) => {
      // A chunk boundary is a message/step boundary in the common case
      // (streaming continuations rejoin losslessly below): evaluate the
      // carried fragment first so separate steps never fuse into one line.
      if (carry) {
        const stem = narrationStem(carry);
        if (stem && seenStems.has(stem)) collapsed++;
        else {
          if (stem) seenStems.add(stem);
          keptParts.push(carry);
        }
        carry = "";
      }
      const parts = chunk.split(/((?<=[.!?])\s+)/);
      for (let i = 0; i < parts.length; i += 2) {
        const sentence = parts[i] ?? "";
        const sep = parts[i + 1];
        if (sep === undefined) {
          carry = sentence;
          break;
        }
        const stem = narrationStem(sentence);
        if (stem && seenStems.has(stem)) {
          collapsed++;
          continue;
        }
        if (stem) seenStems.add(stem);
        keptParts.push(sentence + sep);
      }
    };
    let carriedRepeats = 0;
    const flushText = (seq: number) => {
      if (carry) {
        const stem = narrationStem(carry);
        if (stem && seenStems.has(stem)) collapsed++;
        else {
          if (stem) seenStems.add(stem);
          keptParts.push(carry);
        }
        carry = "";
      }
      const text = keptParts.join("").trimEnd();
      keptParts = [];
      if (text) {
        const totalRepeats = collapsed + carriedRepeats;
        carriedRepeats = 0;
        collapsed = 0;
        out.push({
          key: `text-${seq}`,
          entry: { seq, kind: "token" },
          text,
          ...(totalRepeats > 0 ? { collapsedCount: totalRepeats } : {}),
        });
      } else if (collapsed + carriedRepeats > 0) {
        // Whole run was repeats of earlier narration — fold the count into
        // the next surviving block instead of rendering an empty bubble.
        carriedRepeats += collapsed + 1;
        collapsed = 0;
      }
    };
    for (const entry of session.timeline) {
      if (entry.kind === "token") {
        feedChunk(entry.content ?? "");
      } else {
        flushText(entry.seq);
        out.push({ key: `${entry.kind}-${entry.seq}`, entry });
      }
    }
    flushText(Number.MAX_SAFE_INTEGER);
    return out;
  }, [session]);

  if (!session || blocks.length === 0) return null;

  const usage = session.lastUsage;
  const formatTokens = (n: number): string =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;

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
        if (block.entry.kind === "user") {
          const text =
            (block.entry.id && session.userMessages[block.entry.id]) ??
            block.entry.content ??
            "";
          if (!text) return null;
          return (
            <div key={block.key} className="flex justify-end py-1">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-muted px-3 py-2 text-sm">
                <ChatMarkdown text={text} cwd={undefined} />
              </div>
            </div>
          );
        }
        if (block.entry.kind === "token") {
          return (
            <div key={block.key} className="py-1 text-sm">
              <ChatMarkdown text={block.text ?? ""} cwd={undefined} />
              {block.collapsedCount ? (
                <div className="pt-0.5 text-[11px] text-muted-foreground/70">
                  +{block.collapsedCount} similar {block.collapsedCount === 1 ? "update" : "updates"} hidden
                </div>
              ) : null}
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
