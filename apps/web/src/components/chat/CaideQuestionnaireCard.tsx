import React, { useCallback, useState } from "react";
import { IconHelpCircle, IconCheck } from "@tabler/icons-react";
import { CaideCard, CaideCardHeader, CaideBadge } from "./CaideCardPrimitives";
import { cn, newCommandId } from "~/lib/utils";
import { ensureNativeApi } from "~/nativeApi";
import { useOpenPendingUserInput } from "~/usePendingInteractionHooks";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export interface QuestionnaireQuestion {
  id?: string;
  question: string;
  type?: "radio" | "checkbox" | "text";
  options?: string[];
}

interface CaideQuestionnaireCardProps {
  questions: QuestionnaireQuestion[];
}

export const CaideQuestionnaireCard: React.FC<CaideQuestionnaireCardProps> = (props) => {
  // Transcript truth: render the tag's own questions ALWAYS. The live
  // pending store previously overwrote every history card with the
  // currently-open set (or flipped old cards to Done) — history lied.
  const questions = props.questions;
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [submitted, setSubmitted] = useState(false);
  const pending = useOpenPendingUserInput();
  // Interactive only while an orchestration questionnaire is actually open;
  // history tags render read-only.
  const interactive = pending != null && !submitted;

  const handleSelectOption = (qKey: string, opt: string, isMulti: boolean) => {
    if (submitted) return;
    setAnswers((prev) => {
      if (isMulti) {
        const current = (prev[qKey] as string[]) || [];
        const next = current.includes(opt) ? current.filter((x) => x !== opt) : [...current, opt];
        return { ...prev, [qKey]: next };
      }
      return { ...prev, [qKey]: opt };
    });
  };

  // Gate empty submits (model reads them as dismissal and re-asks).
  const answeredCount = questions.filter((q, idx) => {
    const v = answers[q.id || `q_${idx}`];
    return Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim().length > 0;
  }).length;

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!pending || submitted) return;
      setSubmitted(true);
      const api = ensureNativeApi();
      void api.orchestration
        .dispatchCommand({
          type: "thread.user-input.respond",
          commandId: newCommandId(),
          threadId: pending.threadId as never,
          requestId: pending.requestId as never,
          answers: answers as never,
          ...(pending.lifecycleGeneration
            ? { lifecycleGeneration: pending.lifecycleGeneration as never }
            : {}),
          createdAt: new Date().toISOString(),
        })
        .catch((err: unknown) => {
          setSubmitted(false);
          console.error("questionnaire submit failed", err);
        });
    },
    [pending, submitted, answers],
  );

  if (!interactive) {
    return (
      <CaideCard
        state="complete"
        accent="neutral"
        className="border border-border/40 bg-card/40 my-1"
      >
        <CaideCardHeader
          icon={<IconCheck size={14} className="text-muted-foreground/80" />}
          accent="neutral"
        >
          <div className="flex w-full items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <CaideBadge accent="neutral">Questionnaire</CaideBadge>
              <span className="text-muted-foreground">
                {questions.length > 0
                  ? `${questions.length} question${questions.length === 1 ? "" : "s"}`
                  : "Answers recorded"}
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground/60">Done</span>
          </div>
        </CaideCardHeader>
        {questions.length > 0 ? (
          <div className="px-2.5 pb-2.5 pt-1 space-y-2 text-xs">
            {questions.map((q, idx) => (
              <div key={q.id || `q_${idx}`} className="space-y-1">
                <div className="font-medium text-foreground/80 text-xs leading-snug">
                  {idx + 1}. {q.question}
                </div>
                {q.options && q.options.length > 0 ? (
                  <div className="pl-3 text-[11px] text-muted-foreground">
                    {q.options.join(" · ")}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </CaideCard>
    );
  }

  return (
    <CaideCard state="pending" accent="info" className="border border-border/50 bg-card/60 my-1.5">
      <CaideCardHeader icon={<IconHelpCircle size={15} />} accent="info">
        <div className="flex w-full items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            <CaideBadge accent="info">Questionnaire</CaideBadge>
            <span className="font-medium text-foreground/90">
              {questions.length > 0
                ? `${questions.length} question${questions.length === 1 ? "" : "s"}`
                : "Project questions"}
            </span>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--info)]">
            <span className="size-1.5 rounded-full bg-[var(--info)] animate-pulse" />
            Awaiting input
          </span>
        </div>
      </CaideCardHeader>

      <form onSubmit={handleSubmit} className="px-2.5 pb-2.5 pt-1 space-y-3 text-xs">
        {questions.map((q, idx) => {
          const qKey = q.id || `q_${idx}`;
          const isMulti = q.type === "checkbox";
          const currentVal = answers[qKey];

          return (
            <div key={qKey} className="space-y-1.5">
              <div className="flex items-baseline gap-1.5 font-medium text-foreground text-xs leading-snug">
                <span className="font-mono text-[11px] text-muted-foreground/70">{idx + 1}.</span>
                <span>{q.question}</span>
              </div>
              {q.options && q.options.length > 0 ? (
                <div className="grid gap-1 pl-3">
                  {q.options.map((opt) => {
                    const isSelected = isMulti
                      ? Array.isArray(currentVal) && currentVal.includes(opt)
                      : currentVal === opt;

                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => handleSelectOption(qKey, opt, isMulti)}
                        className={cn(
                          "flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-left text-xs transition-colors cursor-pointer",
                          isSelected
                            ? "border-[color-mix(in_srgb,var(--info)_55%,transparent)] bg-[color-mix(in_srgb,var(--info)_10%,transparent)] text-foreground font-medium shadow-xs"
                            : "border-border/50 hover:border-border/80 hover:bg-muted/30 text-muted-foreground",
                        )}
                      >
                        <span
                          className={cn(
                            "size-3.5 border flex items-center justify-center shrink-0 transition-colors",
                            isMulti ? "rounded-[3px]" : "rounded-full",
                            isSelected
                              ? "border-[var(--info)] bg-[var(--info)] text-white"
                              : "border-muted-foreground/40",
                          )}
                        >
                          {isSelected &&
                            (isMulti ? (
                              <IconCheck size={10} strokeWidth={3} />
                            ) : (
                              <span className="size-1.5 rounded-full bg-white" />
                            ))}
                        </span>
                        <span className="flex-1">{opt}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="pl-3">
                  <Input
                    type="text"
                    value={(currentVal as string) ?? ""}
                    onChange={(e) => handleSelectOption(qKey, e.target.value, false)}
                    placeholder="Your answer..."
                    disabled={submitted}
                    className="h-7 w-full rounded-md border-border/50 bg-muted/20 px-2.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              )}
            </div>
          );
        })}

        <div className="flex items-center justify-between border-t border-border/30 pt-2">
          <span className="text-[11px] text-muted-foreground/80">
            {submitted ? "✓ Answers submitted" : "Select options and submit to guide the agent"}
          </span>
          {!submitted ? (
            <Button
              type="submit"
              size="sm"
              className="h-7 text-xs px-3 rounded-md font-medium"
              disabled={answeredCount === 0}
              title={answeredCount === 0 ? "Answer at least one question first" : undefined}
            >
              Submit answers
            </Button>
          ) : null}
        </div>
      </form>
    </CaideCard>
  );
};
