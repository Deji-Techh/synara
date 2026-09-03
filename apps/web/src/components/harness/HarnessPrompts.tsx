// FILE: HarnessPrompts.tsx
// Purpose: Render the harness UI-prompt queue (questionnaire, env vars,
// integration setup, tool + MCP consent) from harnessStore and answer over
// the harness socket. Caide settings primitives + themed tool-card language.

import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { answerConsent, answerUiPrompt } from "~/harnessWs";
import { harnessStore, useHarnessStore, type UiPromptEntry } from "~/harnessStore";
import { cn } from "~/lib/utils";
import {
  CaideBadge,
  CaideCard,
  CaideCardHeader,
  CaideLazyContent,
  type CardAccent,
} from "~/components/chat/CaideCardPrimitives";
import { DisclosureChevron } from "~/components/ui/DisclosureChevron";

type SendFn = (message: Record<string, unknown>) => void;

function Shell(props: {
  badge: string;
  accent: CardAccent;
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="my-2 select-none">
      <CaideCard accent={props.accent} onClick={() => setOpen((v) => !v)} isExpanded={open}>
        <CaideCardHeader accent={props.accent}>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <CaideBadge accent={props.accent}>{props.badge}</CaideBadge>
            <span className="truncate text-[12px] font-semibold tracking-tight">{props.title}</span>
          </div>
          <DisclosureChevron open={open} className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
        </CaideCardHeader>
        <CaideLazyContent open={open}>
          <div className="overflow-hidden rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
            {props.children}
          </div>
        </CaideLazyContent>
      </CaideCard>
    </div>
  );
}

function QuestionnaireCard(props: { sessionId: string; entry: UiPromptEntry; send: SendFn }) {
  const questions = (props.entry.payload as { questions?: Array<{ id?: string; question: string; type: string; options?: string[]; placeholder?: string }> })?.questions ?? [];
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [done, setDone] = useState(false);
  if (done) return null;

  const setOne = (id: string, value: string | string[]) =>
    setAnswers((prev) => ({ ...prev, [id]: value }));

  const submit = () => {
    const flat: Record<string, string> = {};
    for (const [k, v] of Object.entries(answers)) flat[k] = Array.isArray(v) ? v.join(", ") : v;
    answerUiPrompt(props.send, props.entry.requestId, flat);
    harnessStore.resolvePrompt(props.sessionId, props.entry.requestId);
    setDone(true);
  };
  const dismiss = () => {
    answerUiPrompt(props.send, props.entry.requestId, null);
    harnessStore.resolvePrompt(props.sessionId, props.entry.requestId);
    setDone(true);
  };

  return (
    <Shell badge="Questions" accent="info" title={`${questions.length} question(s) from the agent`}>
      <div className="flex flex-col gap-3">
        {questions.map((q, i) => {
          const id = q.id ?? `q${i}`;
          return (
            <div key={id} className="flex flex-col gap-1.5">
              <span className="text-xs font-medium">{q.question}</span>
              {q.type === "text" ? (
                <Input
                  placeholder={q.placeholder ?? "Type your answer…"}
                  value={(answers[id] as string) ?? ""}
                  onChange={(e) => setOne(id, e.target.value)}
                />
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {q.options?.map((opt) => {
                    const current = answers[id];
                    const active = Array.isArray(current) ? current.includes(opt) : current === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          if (q.type === "checkbox") {
                            const list = Array.isArray(current) ? current : [];
                            setOne(id, list.includes(opt) ? list.filter((x) => x !== opt) : [...list, opt]);
                          } else {
                            setOne(id, opt);
                          }
                        }}
                        className={cn(
                          "rounded-lg border px-2.5 py-1 text-xs transition-colors",
                          active
                            ? "border-foreground/40 bg-muted font-medium"
                            : "border-border/70 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        <div className="flex justify-end gap-2">
          <Button size="xs" variant="ghost" onClick={dismiss}>
            Dismiss
          </Button>
          <Button size="xs" onClick={submit}>
            Submit answers
          </Button>
        </div>
      </div>
    </Shell>
  );
}

function EnvVarsCard(props: { sessionId: string; entry: UiPromptEntry; send: SendFn }) {
  const vars = (props.entry.payload as { vars?: Array<{ key: string; description?: string; instructionsUrl?: string }> })?.vars ?? [];
  const [values, setValues] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  if (done) return null;

  const submit = () => {
    answerUiPrompt(props.send, props.entry.requestId, values);
    harnessStore.resolvePrompt(props.sessionId, props.entry.requestId);
    setDone(true);
  };
  const dismiss = () => {
    answerUiPrompt(props.send, props.entry.requestId, null);
    harnessStore.resolvePrompt(props.sessionId, props.entry.requestId);
    setDone(true);
  };

  return (
    <Shell badge="Keys" accent="warning" title="The agent needs API keys">
      <div className="flex flex-col gap-2.5">
        {vars.map((v) => (
          <div key={v.key} className="flex flex-col gap-1">
            <span className="font-mono text-[11px] font-medium">{v.key}</span>
            {v.description ? <span className="text-[11px] text-muted-foreground">{v.description}</span> : null}
            <Input
              type="password"
              placeholder={v.key}
              value={values[v.key] ?? ""}
              onChange={(e) => setValues((prev) => ({ ...prev, [v.key]: e.target.value }))}
            />
          </div>
        ))}
        <div className="flex justify-end gap-2">
          <Button size="xs" variant="ghost" onClick={dismiss}>
            Skip
          </Button>
          <Button size="xs" onClick={submit}>
            Provide keys
          </Button>
        </div>
      </div>
    </Shell>
  );
}

function IntegrationCard(props: { sessionId: string; entry: UiPromptEntry; send: SendFn }) {
  const suggested = (props.entry.payload as { provider?: string | null })?.provider ?? null;
  const [provider, setProvider] = useState<"supabase" | "neon">(
    suggested === "neon" ? "neon" : "supabase",
  );
  const [databaseUrl, setDatabaseUrl] = useState("");
  const [projectId, setProjectId] = useState("");
  const [done, setDone] = useState(false);
  if (done) return null;

  const submit = () => {
    answerUiPrompt(props.send, props.entry.requestId, { provider, databaseUrl, projectId });
    harnessStore.resolvePrompt(props.sessionId, props.entry.requestId);
    setDone(true);
  };
  const dismiss = () => {
    answerUiPrompt(props.send, props.entry.requestId, null);
    harnessStore.resolvePrompt(props.sessionId, props.entry.requestId);
    setDone(true);
  };

  return (
    <Shell badge="Database" accent="info" title="Connect a database provider">
      <div className="flex flex-col gap-2.5">
        <div className="flex gap-1.5">
          {(["supabase", "neon"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setProvider(p)}
              className={cn(
                "flex-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium capitalize transition-colors",
                provider === p
                  ? "border-foreground/40 bg-muted"
                  : "border-border/70 text-muted-foreground hover:text-foreground",
              )}
            >
              {p}
            </button>
          ))}
        </div>
        <Input
          placeholder="DATABASE_URL (postgres://…)"
          value={databaseUrl}
          onChange={(e) => setDatabaseUrl(e.target.value)}
        />
        <Input
          placeholder="Project ID (optional)"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button size="xs" variant="ghost" onClick={dismiss}>
            Not now
          </Button>
          <Button size="xs" onClick={submit}>
            Connect
          </Button>
        </div>
      </div>
    </Shell>
  );
}

function ConsentCard(props: {
  sessionId: string;
  entry: UiPromptEntry;
  send: SendFn;
  mcp: boolean;
}) {
  const payload = props.entry.payload as {
    toolName?: string;
    serverName?: string;
    toolDescription?: string | null;
    inputPreview?: string | null;
    autoApproveReason?: string | null;
  };
  const [done, setDone] = useState(false);
  if (done) return null;

  const decide = (decision: "accept-once" | "accept-always" | "decline") => {
    answerConsent(props.send, props.entry.requestId, decision);
    harnessStore.resolvePrompt(props.sessionId, props.entry.requestId);
    setDone(true);
  };

  return (
    <Shell
      badge={props.mcp ? "MCP" : "Approval"}
      accent="warning"
      title={props.mcp ? `${payload.serverName} → ${payload.toolName}` : `Allow ${payload.toolName}?`}
    >
      <div className="flex flex-col gap-2">
        {payload.autoApproveReason ? (
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400">{payload.autoApproveReason}</span>
        ) : null}
        {payload.toolDescription ? (
          <span className="text-[11px] text-muted-foreground">{payload.toolDescription}</span>
        ) : null}
        {payload.inputPreview ? (
          <pre className="max-h-32 overflow-auto rounded-md bg-muted/40 p-2 font-mono text-[10.5px] whitespace-pre-wrap">
            {payload.inputPreview}
          </pre>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          <Button size="xs" variant="ghost" onClick={() => decide("decline")}>
            Decline
          </Button>
          <Button size="xs" variant="outline" onClick={() => decide("accept-once")}>
            Accept once
          </Button>
          <Button size="xs" onClick={() => decide("accept-always")}>
            Always allow
          </Button>
        </div>
      </div>
    </Shell>
  );
}

export function HarnessPrompts(props: { sessionId: string; send: SendFn }) {
  const state = useHarnessStore();
  const prompts = state.sessions[props.sessionId]?.prompts ?? [];

  return (
    <div aria-live="polite">
      {prompts.map((entry) => {
        switch (entry.kind) {
          case "questionnaire":
            return <QuestionnaireCard key={entry.requestId} sessionId={props.sessionId} entry={entry} send={props.send} />;
          case "env-vars":
            return <EnvVarsCard key={entry.requestId} sessionId={props.sessionId} entry={entry} send={props.send} />;
          case "integration":
            return <IntegrationCard key={entry.requestId} sessionId={props.sessionId} entry={entry} send={props.send} />;
          case "mcp-consent":
            return (
              <ConsentCard key={entry.requestId} sessionId={props.sessionId} entry={entry} send={props.send} mcp />
            );
          case "tool-consent":
            return (
              <ConsentCard key={entry.requestId} sessionId={props.sessionId} entry={entry} send={props.send} mcp={false} />
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
