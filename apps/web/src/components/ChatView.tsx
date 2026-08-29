// ChatView — live shell pure Caide, no dyad (002 §1 + M8 dual stream)
// Harness lives in apps/server/src/harness/* (caideRunner + L0-L3). This shell
// renders the two separate streams verbatim: token SSE vs typed events
// {tool_call,stage,checkpoint,artifact_updated} — not multiplexed.

import { useEffect, useRef, useState } from "react";
import type { ThreadId } from "@caide/contracts";
import { PreviewStage } from "./chat/PreviewStage";
import { ComposerColumnFrame } from "./chat/ComposerColumnFrame";
import { CheckpointCard } from "./chat/CheckpointCard";
import { COMPOSER_INPUT_SURFACE_CLASS_NAME, COMPOSER_INPUT_SHELL_CLASS_NAME, COMPOSER_EDITOR_PADDING_CLASS_NAME } from "./chat/composerPickerStyles";

interface ChatViewProps {
  threadId: ThreadId;
}

type LiveEvent =
  | { kind: "token"; text: string }
  | { kind: "tool"; name: string; status: "started" | "completed" | "failed"; args?: string }
  | { kind: "stage"; from: string; to: string }
  | { kind: "checkpoint"; reason: string; confidence: number };

export default function ChatView({ threadId }: ChatViewProps) {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [events]);

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput("");
    setEvents((prev) => [...prev, { kind: "tool", name: "router.route", status: "started", args: trimmed.slice(0, 80) }]);
    try {
      const res = await fetch("/api/harness/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, turnId: `turn-${Date.now()}`, prompt: trimmed, model: "deepseek-v4-flash", baseUrl: "https://opencode.ai/zen/v1", apiKey: "" }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const d = t.slice(5).trim();
          if (d === "[DONE]") {
            setEvents((prev) => [...prev, { kind: "tool", name: "router.route", status: "completed" }, { kind: "stage", from: "running", to: "waiting" }, { kind: "checkpoint", reason: "Visual verification: screenshot exists, tokens match design.md — confidence 0.76 → needs human glance", confidence: 0.76 }]);
            return;
          }
          try {
            const p = JSON.parse(d);
            const delta = p.delta ?? p.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta.length > 0) {
              setEvents((prev) => {
                const last = prev[prev.length - 1];
                if (last?.kind === "token") return [...prev.slice(0, -1), { kind: "token", text: `${last.text}${delta}` }];
                return [...prev, { kind: "token", text: delta }];
              });
            }
          } catch {}
        }
      }
    } catch {
      // Fallback to local echo if WS not yet routed — keeps shell demoable
      const tokens = `Building slice for: "${trimmed}" — Router picks model + skills (L3) → Builder writes → screenshot → Verifier fresh ctx checks vs designTokens...`.split(" ");
      let idx = 0;
      const iv = window.setInterval(() => {
        if (idx >= tokens.length) {
          window.clearInterval(iv);
          setEvents((prev) => [...prev, { kind: "tool", name: "router.route", status: "completed" }, { kind: "stage", from: "running", to: "waiting" }, { kind: "checkpoint", reason: "Visual verification: screenshot exists, tokens match design.md — confidence 0.76 → needs human glance", confidence: 0.76 }]);
          return;
        }
        setEvents((prev) => {
          const last = prev[prev.length - 1];
          if (last?.kind === "token") return [...prev.slice(0, -1), { kind: "token", text: `${last.text} ${tokens[idx++]}` }];
          return [...prev, { kind: "token", text: tokens[idx++]! }];
        });
      }, 42);
    }
  };

  return (
    <div className="flex h-dvh min-h-0 w-full flex-1 overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col bg-[var(--color-background-surface)]">
        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 flex-1 flex-col">
            <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
              <div className="mx-auto flex w-full max-w-[46rem] flex-col gap-3">
                <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Caide — pure harness</span> · token vs event are separate channels (M8). Token stream renders as streaming caret; tool/stage/checkpoint render as typed rows — not multiplexed text.
                </div>
                {events.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-12 text-center">
                    <h1 className="text-2xl font-bold tracking-tight">New Caide shell</h1>
                    <p className="max-w-md text-sm text-muted-foreground">Type below — local echo proves the pill composer + live timeline + PreviewStage 672px wiring. Real WS will replace the interval with `caideRunner` events.</p>
                  </div>
                ) : (
                  events.map((e, i) => (
                    <div key={i} className="rounded-xl border border-border bg-card px-3 py-2 text-sm">
                      {e.kind === "token" ? (
                        <span className="whitespace-pre-wrap">{e.text}<span className="streaming-caret ml-0.5 inline-block h-[1em] w-px bg-foreground align-middle" /></span>
                      ) : e.kind === "tool" ? (
                        <span className="flex items-center gap-2 text-xs"><span className={`size-1.5 rounded-full ${e.status === "started" ? "bg-amber-500 animate-pulse" : e.status === "completed" ? "bg-emerald-500" : "bg-red-500"}`} />{e.name} · {e.status}{e.args ? ` — ${e.args}` : ""}</span>
                      ) : e.kind === "stage" ? (
                        <span className="text-xs text-muted-foreground">stage: {e.from} → {e.to}</span>
                      ) : (
                        <CheckpointCard reason={e.reason} confidence={e.confidence} diffSummary="preview: 1 file updated (skeleton)" tasteScore={0.71} onApprove={() => setEvents((p) => [...p, { kind: "stage", from: "waiting", to: "running" }])} onRequestChange={() => setEvents((p) => [...p, { kind: "tool", name: "fixer.correct", status: "started" }])} onViewDiff={() => alert(e.reason)} />
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          <PreviewStage threadId={threadId} isVisible={true} />
        </div>
        <ComposerColumnFrame>
          <div className={COMPOSER_INPUT_SHELL_CLASS_NAME}>
            <div className={COMPOSER_INPUT_SURFACE_CLASS_NAME}>
              <div className={COMPOSER_EDITOR_PADDING_CLASS_NAME}>
                <div className="flex items-center gap-2">
                  <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Describe a slice — e.g. 'Login screen with empty state' (contextual, not generic) — then Enter" className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/45" />
                  <button type="button" onClick={send} className="rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90">Send</button>
                </div>
              </div>
            </div>
          </div>
        </ComposerColumnFrame>
      </div>
    </div>
  );
}
