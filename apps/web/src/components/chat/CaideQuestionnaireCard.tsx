import React, { useCallback, useState } from "react";
import { CaideCard, CaideCardHeader } from "./CaideCardPrimitives";
import { cn } from "~/lib/utils";
import { newCommandId } from "~/lib/utils";
import { ensureNativeApi } from "~/nativeApi";
import { useOpenPendingUserInput } from "~/usePendingInteractionHooks";
import { Button } from "../ui/button";

export interface QuestionnaireQuestion {
  id?: string;
  question: string;
  type?: "radio" | "checkbox" | "text";
  options?: string[];
}

interface CaideQuestionnaireCardProps {
  questions: QuestionnaireQuestion[];
}

export const CaideQuestionnaireCard: React.FC<CaideQuestionnaireCardProps> = () => {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [submitted, setSubmitted] = useState(false);
  const pending = useOpenPendingUserInput();

  const handleSelectOption = (qKey: string, opt: string, isMulti: boolean) => {
    if (submitted) return;
    setAnswers((prev) => {
      if (isMulti) {
        const current = (prev[qKey] as string[]) || [];
        const next = current.includes(opt)
          ? current.filter((x) => x !== opt)
          : [...current, opt];
        return { ...prev, [qKey]: next };
      }
      return { ...prev, [qKey]: opt };
    });
  };

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

  if (!pending) {
    return (
      <CaideCard accentColor="gray" className="border-border/70 bg-card/60">
        <CaideCardHeader
          icon={
            <div className="h-6 w-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
              ✓
            </div>
          }
        >
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Questionnaire
            </div>
            <div className="text-sm font-semibold text-foreground">Answers recorded</div>
          </div>
        </CaideCardHeader>
      </CaideCard>
    );
  }

  const questions = pending.pending.questions as unknown as QuestionnaireQuestion[];

  return (
    <CaideCard accentColor="gray" className="border-border/70 bg-card/60">
      <CaideCardHeader
        icon={
          <div className="h-6 w-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
            ?
          </div>
        }
      >
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Plan Questionnaire
          </div>
          <div className="text-sm font-semibold text-foreground">Project Questions</div>
        </div>
      </CaideCardHeader>
      <form onSubmit={handleSubmit} className="px-3.5 pb-3 space-y-3.5 text-xs">
        {questions.map((q, idx) => {
          const qKey = q.id || `q_${idx}`;
          const isMulti = q.type === "checkbox";
          const currentVal = answers[qKey];

          return (
            <div key={qKey} className="space-y-1.5 pt-1">
              <div className="font-medium text-foreground text-xs leading-snug">
                {idx + 1}. {q.question}
              </div>
              {q.options && q.options.length > 0 ? (
                <div className="grid gap-1.5 pl-1">
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
                          "flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left text-xs transition-colors cursor-pointer",
                          isSelected
                            ? "border-primary bg-primary/10 text-foreground font-medium"
                            : "border-border/60 hover:border-border hover:bg-muted/40 text-muted-foreground",
                        )}
                      >
                        <span
                          className={cn(
                            "h-3.5 w-3.5 border flex items-center justify-center shrink-0",
                            isMulti ? "rounded-md" : "rounded-full",
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/50",
                          )}
                        >
                          {isSelected && <span className="text-[9px] leading-none">✓</span>}
                        </span>
                        <span className="flex-1">{opt}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <input
                  type="text"
                  value={(currentVal as string) ?? ""}
                  onChange={(e) => handleSelectOption(qKey, e.target.value, false)}
                  placeholder="Your answer..."
                  disabled={submitted}
                  className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                />
              )}
            </div>
          );
        })}
        <div className="flex items-center justify-between border-t border-border/40 pt-2.5">
          <span className="text-[11px] text-muted-foreground">
            {submitted ? "✓ Answers submitted" : "Select options and submit to guide the agent"}
          </span>
          {!submitted ? (
            <Button type="submit" size="sm" className="rounded-full px-4">
              Submit answers
            </Button>
          ) : null}
        </div>
      </form>
    </CaideCard>
  );
};