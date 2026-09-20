// FILE: HarnessPrompts.tsx
// Purpose: Render the harness UI-prompt queue (questionnaire, env vars,
// integration setup, build proposal, tool + MCP consent) from harnessStore
// and answer over the harness socket. Caide settings primitives + themed
// tool-card language.

import type { ThreadId } from "@caide/contracts";
import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Badge } from "~/components/ui/badge";
import { answerConsent, answerUiPrompt } from "~/harnessWs";
import { harnessStore, useHarnessStore, type UiPromptEntry } from "~/harnessStore";
import { useRightDockStore } from "~/rightDockStore";
import { DatabaseIcon } from "~/lib/icons";
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
      {/* Toggle lives on the header ONLY: body clicks (options, inputs,
          buttons) must never collapse the card mid-answer. */}
      <CaideCard accent={props.accent} isExpanded={open}>
        <div onClick={() => setOpen((v) => !v)} className="cursor-pointer">
          <CaideCardHeader accent={props.accent}>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <CaideBadge accent={props.accent}>{props.badge}</CaideBadge>
              <span className="truncate text-[12px] font-semibold tracking-tight">
                {props.title}
              </span>
            </div>
            <DisclosureChevron
              open={open}
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70"
            />
          </CaideCardHeader>
        </div>
        <CaideLazyContent open={open}>
          <div
            className="overflow-hidden rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5"
            onClick={(e) => e.stopPropagation()}
          >
            {props.children}
          </div>
        </CaideLazyContent>
      </CaideCard>
    </div>
  );
}

function QuestionnaireCard(props: { sessionId: string; entry: UiPromptEntry; send: SendFn }) {
  const questions =
    (
      props.entry.payload as {
        questions?: Array<{
          id?: string;
          question: string;
          type: string;
          options?: string[];
          placeholder?: string;
          why?: string;
        }>;
      }
    )?.questions ?? [];
  const [answers, setAnswers] = useState<Record<string, string | string[]>>(() => {
    const drafts =
      harnessStore.getState().sessions[props.sessionId]?.answerDrafts[props.entry.requestId] ?? {};
    const initial: Record<string, string | string[]> = { ...drafts };
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q) continue;
      const id = q.id ?? `q${i}`;
      const firstOption = q.options?.[0];
      if (q.type === "radio" && firstOption !== undefined && initial[id] === undefined) {
        initial[id] = firstOption;
      }
    }
    return initial;
  });
  const [done, setDone] = useState(false);
  // Double-submit guard: rapid clicks must not dispatch duplicate answers.
  const answered = useRef(false);

  // Auto-dismiss after 5 minutes to match backend timeout and prevent hung turns (V1 parity)
  useEffect(() => {
    const timer = setTimeout(
      () => {
        dismiss();
      },
      5 * 60 * 1000,
    );
    return () => clearTimeout(timer);
  }, []);

  if (done) return null;

  const setOne = (id: string, value: string | string[]) =>
    setAnswers((prev) => {
      const next = { ...prev, [id]: value };
      // Persist typed answers so reconnect replay (which remounts the card)
      // never wipes what the user already typed.
      harnessStore.setAnswerDraft(props.sessionId, props.entry.requestId, next);
      return next;
    });

  // Empty submits resolve as "(no answer)" everywhere, which the model reads
  // as a dismissal and then re-asks — the submit→hang→re-ask loop. Require at
  // least one answer; Dismiss stays the explicit skip path.
  const answeredCount = questions.filter((q, i) => {
    const v = answers[q.id ?? `q${i}`];
    return Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim().length > 0;
  }).length;

  const submit = () => {
    if (answered.current) return;
    answered.current = true;
    const flat: Record<string, string> = {};
    for (const [k, v] of Object.entries(answers)) flat[k] = Array.isArray(v) ? v.join(", ") : v;
    answerUiPrompt(props.send, props.entry.requestId, flat);
    harnessStore.resolvePrompt(props.sessionId, props.entry.requestId);
    setDone(true);
  };
  const dismiss = () => {
    if (answered.current) return;
    answered.current = true;
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
              {q.why ? <span className="text-[11px] text-muted-foreground">{q.why}</span> : null}
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
                            setOne(
                              id,
                              list.includes(opt) ? list.filter((x) => x !== opt) : [...list, opt],
                            );
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
          <Button
            size="xs"
            onClick={submit}
            disabled={answeredCount === 0}
            title={
              answeredCount === 0
                ? "Answer at least one question first (or Dismiss to skip)"
                : undefined
            }
          >
            Submit answers
          </Button>
        </div>
      </div>
    </Shell>
  );
}

function EnvVarsCard(props: { sessionId: string; entry: UiPromptEntry; send: SendFn }) {
  const vars =
    (
      props.entry.payload as {
        vars?: Array<{ key: string; description?: string; instructionsUrl?: string }>;
      }
    )?.vars ?? [];
  const [values, setValues] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const answered = useRef(false);
  if (done) return null;

  // Gate empty submits (model reads them as dismissal and re-asks).
  const filledCount = Object.values(values).filter((v) => v.trim().length > 0).length;

  const submit = () => {
    if (answered.current || filledCount === 0) return;
    answered.current = true;
    answerUiPrompt(props.send, props.entry.requestId, values);
    harnessStore.resolvePrompt(props.sessionId, props.entry.requestId);
    setDone(true);
  };
  const dismiss = () => {
    if (answered.current) return;
    answered.current = true;
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
            {v.description ? (
              <span className="text-[11px] text-muted-foreground">{v.description}</span>
            ) : null}
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
          <Button
            size="xs"
            onClick={submit}
            disabled={filledCount === 0}
            title={filledCount === 0 ? "Fill at least one key first (or Skip)" : undefined}
          >
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
  const [inPanelMode, setInPanelMode] = useState(false);
  const [done, setDone] = useState(false);
  const answered = useRef(false);
  if (done) return null;

  const submit = (chosenProvider?: "supabase" | "neon") => {
    if (answered.current) return;
    answered.current = true;
    const p = chosenProvider || provider;
    answerUiPrompt(props.send, props.entry.requestId, {
      provider: p,
    });
    harnessStore.resolvePrompt(props.sessionId, props.entry.requestId);
    setDone(true);
  };

  const dismiss = () => {
    if (answered.current) return;
    answered.current = true;
    answerUiPrompt(props.send, props.entry.requestId, null);
    harnessStore.resolvePrompt(props.sessionId, props.entry.requestId);
    setDone(true);
  };

  const openDatabasePanel = () => {
    useRightDockStore.getState().openPane(props.sessionId as ThreadId, { kind: "database" });
    setInPanelMode(true);
  };

  return (
    <Shell badge="Database" accent="info" title="Choose a database provider">
      <div className="flex flex-col gap-3">
        {inPanelMode ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <DatabaseIcon className="size-4 text-primary" />
                <span>Configure in Database Panel</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">
                Connect your {provider === "supabase" ? "Supabase" : "Neon"} account and link a project in the Database panel on the right. Once connected, the agent will continue automatically.
              </p>
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <Button size="xs" variant="ghost" onClick={() => setInPanelMode(false)}>
                ← Back to providers
              </Button>
              <div className="flex gap-2">
                <Button size="xs" variant="ghost" onClick={dismiss}>
                  Skip for now
                </Button>
                <Button size="xs" onClick={() => submit()}>
                  Continue with {provider === "supabase" ? "Supabase" : "Neon"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              The agent needs a database provider for this application. Choose one to configure:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setProvider("supabase")}
                className={cn(
                  "flex flex-col items-start gap-1.5 rounded-lg border-2 p-3 text-left transition-all",
                  provider === "supabase"
                    ? "border-primary bg-primary/5 shadow-xs"
                    : "border-border hover:border-border/80 hover:bg-muted/40",
                )}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-semibold text-foreground">Supabase</span>
                  <Badge variant="outline" className="text-[10px] py-0">Recommended</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Managed Postgres with built-in Auth, Storage, Edge Functions, and Row Level Security.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setProvider("neon")}
                className={cn(
                  "flex flex-col items-start gap-1.5 rounded-lg border-2 p-3 text-left transition-all",
                  provider === "neon"
                    ? "border-primary bg-primary/5 shadow-xs"
                    : "border-border hover:border-border/80 hover:bg-muted/40",
                )}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-semibold text-foreground">Neon</span>
                  <Badge variant="secondary" className="text-[10px] py-0 text-amber-600 dark:text-amber-400">Experimental</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Serverless Postgres with instant database branching, autoscaling, and point-in-time recovery.
                </p>
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <Button size="xs" variant="ghost" onClick={dismiss}>
                Skip for now
              </Button>
              <Button size="xs" onClick={openDatabasePanel} className="gap-1.5">
                Configure in Database Panel →
              </Button>
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}

function ProposalCard(props: { sessionId: string; entry: UiPromptEntry; send: SendFn }) {
  const proposal = (props.entry.payload ?? {}) as {
    title?: string;
    filesChanged?: Array<{
      name?: string;
      path?: string;
      summary?: string;
      type?: string;
    }>;
  };
  const files = Array.isArray(proposal.filesChanged) ? proposal.filesChanged : [];
  const [done, setDone] = useState(false);
  const decided = useRef(false);
  if (done) return null;

  // Answers ride prompt_answer ({approved}, checkpoint precedent); the
  // server withdraws the card on every settlement path.
  const decide = (approved: boolean) => {
    if (decided.current) return;
    decided.current = true;
    answerUiPrompt(props.send, props.entry.requestId, { approved: approved ? "true" : "false" });
    harnessStore.resolvePrompt(props.sessionId, props.entry.requestId);
    setDone(true);
  };
  const dismiss = () => {
    if (decided.current) return;
    decided.current = true;
    answerUiPrompt(props.send, props.entry.requestId, null);
    harnessStore.resolvePrompt(props.sessionId, props.entry.requestId);
    setDone(true);
  };

  return (
    <Shell badge="Proposal" accent="info" title={proposal.title || "Proposed File Changes"}>
      <div className="flex flex-col gap-2">
        <span className="text-[11px] text-muted-foreground">
          {`${files.length} file${files.length === 1 ? "" : "s"} — review, then approve to apply.`}
        </span>
        <ul className="flex max-h-48 flex-col gap-1 overflow-auto">
          {files.map((f, i) => (
            <li
              key={`${f.path ?? i}`}
              className="flex items-baseline gap-2 rounded-md bg-muted/40 px-2 py-1"
            >
              <CaideBadge accent="info">{f.type ?? "write"}</CaideBadge>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                {f.path ?? f.name ?? `file ${i + 1}`}
              </span>
              {f.summary ? (
                <span className="max-w-[55%] truncate text-[10.5px] text-muted-foreground">
                  {f.summary}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-end gap-2">
          <Button size="xs" variant="ghost" onClick={dismiss}>
            Dismiss
          </Button>
          <Button size="xs" variant="outline" onClick={() => decide(false)}>
            Reject
          </Button>
          <Button size="xs" onClick={() => decide(true)}>
            Approve &amp; apply
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
    danger?: { level?: string; category?: string; message?: string } | null;
  };
  const [done, setDone] = useState(false);
  const decided = useRef(false);
  if (done) return null;

  const decide = (decision: "accept-once" | "accept-always" | "decline") => {
    if (decided.current) return;
    decided.current = true;
    answerConsent(props.send, props.entry.requestId, decision);
    harnessStore.resolvePrompt(props.sessionId, props.entry.requestId);
    setDone(true);
  };

  return (
    <Shell
      badge={props.mcp ? "MCP" : "Approval"}
      accent="warning"
      title={
        props.mcp ? `${payload.serverName} → ${payload.toolName}` : `Allow ${payload.toolName}?`
      }
    >
      <div className="flex flex-col gap-2">
        {payload.danger?.message ? (
          <span
            role="alert"
            className={
              payload.danger.level === "danger"
                ? "rounded-md border border-destructive/50 bg-destructive/10 px-2 py-1.5 text-[11px] font-medium text-destructive"
                : "rounded-md border border-warning/50 bg-warning/10 px-2 py-1.5 text-[11px] font-medium text-warning"
            }
          >
            {payload.danger.level === "danger" ? "Blocked as unsafe: " : "Please review: "}
            {payload.danger.message}
          </span>
        ) : null}
        {payload.autoApproveReason ? (
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
            {payload.autoApproveReason}
          </span>
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
          {/* No accept-always on danger findings (donor contract). */}
          {!payload.danger ? (
            <Button size="xs" onClick={() => decide("accept-always")}>
              Always allow
            </Button>
          ) : null}
        </div>
      </div>
    </Shell>
  );
}

export function HarnessPrompts(props: { sessionId: string; send: SendFn }) {
  const state = useHarnessStore();
  const prompts = state.sessions[props.sessionId]?.prompts ?? [];

  if (prompts.length === 0) return null;

  return (
    <div>
      {/* Screen-reader status lives apart from the interactive forms: an
          aria-live wrapper around inputs announces token churn and typing. */}
      <span className="sr-only" role="status">
        {`${prompts.length} request${prompts.length === 1 ? "" : "s"} need${prompts.length === 1 ? "s" : ""} your answer`}
      </span>
      {prompts.map((entry) => {
        switch (entry.kind) {
          case "questionnaire":
            return (
              <QuestionnaireCard
                key={entry.requestId}
                sessionId={props.sessionId}
                entry={entry}
                send={props.send}
              />
            );
          case "env-vars":
            return (
              <EnvVarsCard
                key={entry.requestId}
                sessionId={props.sessionId}
                entry={entry}
                send={props.send}
              />
            );
          case "integration":
            return (
              <IntegrationCard
                key={entry.requestId}
                sessionId={props.sessionId}
                entry={entry}
                send={props.send}
              />
            );
          case "mcp-consent":
            return (
              <ConsentCard
                key={entry.requestId}
                sessionId={props.sessionId}
                entry={entry}
                send={props.send}
                mcp
              />
            );
          case "tool-consent":
            return (
              <ConsentCard
                key={entry.requestId}
                sessionId={props.sessionId}
                entry={entry}
                send={props.send}
                mcp={false}
              />
            );
          case "proposal":
            return (
              <ProposalCard
                key={entry.requestId}
                sessionId={props.sessionId}
                entry={entry}
                send={props.send}
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
