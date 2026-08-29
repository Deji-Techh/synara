// apps/web/src/components/ChatView.tsx — Pure Caide live shell
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckpointCard } from "./chat/CheckpointCard";

type LiveEvent =
  | { kind: "token"; text: string }
  | { kind: "tool"; name: string; status: "started" | "completed" | "failed"; args?: string }
  | { kind: "stage"; from: string; to: string }
  | { kind: "checkpoint"; reason: string; confidence: number; tasteScore?: number; diffSummary?: string }
  | { kind: "error"; message: string };

interface ChatViewProps {
  threadId?: string;
  onOpenSettings?: () => void;
  onOpenCreateProject?: () => void;
}

export default function ChatView({ threadId: threadIdProp, onOpenSettings, onOpenCreateProject }: ChatViewProps) {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const threadId = threadIdProp ?? `thread-${Date.now()}`;

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [events]);

  const send = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    setInput("");
    setSending(true);
    setEvents((prev) => [...prev, { kind: "tool", name: "router.route", status: "started", args: trimmed.slice(0, 80) }]);

    let apiKey = "";
    let model = "deepseek-v4-flash";
    let baseUrl = "https://opencode.ai/zen/v1";
    try {
      const saved = JSON.parse(localStorage.getItem("caide:settings") ?? "{}");
      if (saved.apiKey) apiKey = saved.apiKey;
      if (saved.model) model = saved.model;
      if (saved.baseUrl) baseUrl = saved.baseUrl;
    } catch {}

    try {
      const res = await fetch("/api/harness/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, turnId: `turn-${Date.now()}`, prompt: trimmed, model, baseUrl, apiKey }),
      });
      if (!res.ok || !res.body) {
        const errBody = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 200)}`);
      }
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
            setEvents((prev) => [...prev, { kind: "tool", name: "router.route", status: "completed" }]);
            break;
          }
          try {
            const p = JSON.parse(d);
            if (p.error) {
              setEvents((prev) => [...prev, { kind: "error", message: p.error }]);
              break;
            }
            // M8: typed event payloads from harness — {event: {type, ...}}
            if (p.event) {
              const ev = p.event;
              if (ev.type === "stage") {
                setEvents((prev) => [...prev, { kind: "stage", from: ev.from ?? "unknown", to: ev.to ?? "unknown" }]);
              } else if (ev.type === "tool_call") {
                setEvents((prev) => [...prev, { kind: "tool", name: ev.name ?? "unknown", status: ev.status ?? "started", args: ev.args ? JSON.stringify(ev.args).slice(0, 120) : undefined }]);
              } else if (ev.type === "checkpoint") {
                setEvents((prev) => [...prev, { kind: "checkpoint", reason: ev.reason ?? "Checkpoint", confidence: ev.confidence ?? 0.85, requiresResponse: ev.requiresResponse }]);
              } else if (ev.type === "error") {
                setEvents((prev) => [...prev, { kind: "error", message: ev.message ?? "Unknown error" }]);
              }
              continue;
            }
            // M8: token delta from provider streaming
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isNetwork = msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("ECONNREFUSED");
      setEvents((prev) => [...prev, { kind: "error", message: isNetwork ? "Network error — check connection and try again" : msg.slice(0, 120) }]);
    } finally { setSending(false); }
  }, [input, sending, threadId]);

  return (
    <div className="flex h-dvh min-h-0 w-full flex-1 overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col bg-[var(--color-background-surface)]">
        {/* Header */}
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-card px-3" role="banner">
          <span className="text-xs font-semibold">Caide</span>
          <span className="size-1.5 rounded-full bg-emerald-500" aria-label="Connected" />
          <span className="text-[10px] text-muted-foreground">Pure Caide harness</span>
          <span className="flex-1" />
          <button type="button" onClick={onOpenCreateProject} aria-label="Create new project" className="rounded-full bg-foreground px-2 py-1 text-[10px] font-medium text-background hover:opacity-90">+ Project</button>
          <button type="button" onClick={onOpenSettings} aria-label="Open settings" className="rounded-full border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground">Settings</button>
        </div>
        {/* Main content */}
        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 flex-1 flex-col">
            <div ref={listRef} role="log" aria-live="polite" aria-label="Chat messages" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
              <div className="mx-auto flex w-full max-w-[46rem] flex-col gap-3">
                {events.length === 0 && (
                  <div className="flex flex-col items-center gap-3 py-12 text-center">
                    <h1 className="text-2xl font-bold tracking-tight">New Caide shell</h1>
                    <p className="max-w-md text-sm text-muted-foreground">Type below to describe what you want to build.</p>
                    <p className="max-w-md text-xs text-muted-foreground">Create a project first (+ Project) or type directly below.</p>
                    <div className="w-full max-w-md rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-left">
                      <p className="text-xs font-medium text-amber-700 dark:text-amber-300">Provider setup</p>
                      <p className="text-[10px] text-amber-700/70 dark:text-amber-300/70 mt-1">Enter your OpenCode API key in Settings to enable real provider streaming.</p>
                    </div>
                  </div>
                )}
                {events.map((e, i) => (
                  <div key={i} className="rounded-xl border border-border bg-card px-3 py-2 text-sm">
                    {e.kind === "token" ? (
                      <span className="whitespace-pre-wrap">{e.text}<span className="streaming-caret ml-0.5 inline-block h-[1em] w-px bg-foreground align-middle" /></span>
                    ) : e.kind === "tool" ? (
                      <span className="flex items-center gap-2 text-xs">
                        <span className={`size-1.5 rounded-full ${e.status === "started" ? "bg-amber-500 animate-pulse" : e.status === "completed" ? "bg-emerald-500" : "bg-red-500"}`} />
                        {e.name} · {e.status}{e.args ? ` — ${e.args}` : ""}
                      </span>
                    ) : e.kind === "stage" ? (
                      <span className="text-xs text-muted-foreground">stage: {e.from} → {e.to}</span>
                    ) : e.kind === "error" ? (
                      <span className="flex items-center gap-2 text-xs text-red-500">
                        <span className="size-1.5 rounded-full bg-red-500" />
                        {e.message}
                      </span>
                    ) : (
                      <CheckpointCard reason={e.reason} confidence={e.confidence} tasteScore={e.tasteScore} diffSummary={e.diffSummary} onApprove={() => setEvents((p) => [...p, { kind: "stage", from: "waiting", to: "running" }])} onRequestChange={(note: string) => setEvents((p) => [...p, { kind: "tool", name: "fixer.correct", status: "started", args: note }])} onViewDiff={() => alert(e.reason)} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        {/* Composer pill */}
        <div className="relative z-[1] mx-1 sm:mx-0 pb-2">
          <div className="rounded-[1.35rem] border border-[color:color-mix(in_srgb,var(--color-border-heavy)_95%,var(--foreground)_5%)] bg-[var(--composer-surface)] backdrop-blur-xl backdrop-saturate-150 transition-all duration-200">
            <div className="relative pl-3 pr-3 pt-3 pb-2">
              <div className="flex items-center gap-2">
                <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} disabled={sending} aria-label="Describe what you want to build" placeholder="Describe what you want to build — e.g. 'Login screen with empty state'" className="flex-1 bg-transparent text-[13px] tracking-[-0.01em] leading-[1.65] font-sans outline-none placeholder:text-muted-foreground/45 disabled:opacity-50" />
                <button type="button" onClick={send} disabled={sending} aria-label="Send message" className="rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50">{sending ? "Building..." : "Send"}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
