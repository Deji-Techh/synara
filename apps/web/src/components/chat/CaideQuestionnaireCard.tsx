import React, { useState } from "react";
import { CaideCard, CaideCardHeader } from "./CaideCardPrimitives";

export interface QuestionnaireQuestion {
  id?: string;
  question: string;
  type?: "radio" | "checkbox" | "text";
  options?: string[];
}

interface CaideQuestionnaireCardProps {
  questions: QuestionnaireQuestion[];
  onSubmit?: (answers: Record<string, string | string[]>) => void;
}

export const CaideQuestionnaireCard: React.FC<CaideQuestionnaireCardProps> = ({
  questions = [],
  onSubmit,
}) => {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [submitted, setSubmitted] = useState(false);

  const handleSelectOption = (qIdx: number, qKey: string, opt: string, isMulti: boolean) => {
    if (submitted) return;
    setAnswers((prev) => {
      if (isMulti) {
        const current = (prev[qKey] as string[]) || [];
        const next = current.includes(opt)
          ? current.filter((x) => x !== opt)
          : [...current, opt];
        return { ...prev, [qKey]: next };
      } else {
        return { ...prev, [qKey]: opt };
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (onSubmit) {
      onSubmit(answers);
    }
  };

  if (!questions || questions.length === 0) return null;

  return (
    <CaideCard accentColor="amber" className="border-amber-500/30 bg-amber-500/[0.02]">
      <CaideCardHeader
        icon={
          <div className="h-6 w-6 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center font-bold text-xs">
            ?
          </div>
        }
      >
        <div>
          <div className="text-[10px] uppercase font-bold tracking-wider text-amber-500">Plan Questionnaire</div>
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
                        onClick={() => handleSelectOption(idx, qKey, opt, isMulti)}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left text-xs transition-colors cursor-pointer ${
                          isSelected
                            ? "border-amber-500 bg-amber-500/10 text-foreground font-medium"
                            : "border-border/60 hover:border-border hover:bg-muted/40 text-muted-foreground"
                        }`}
                      >
                        <span
                          className={`h-3.5 w-3.5 rounded-${isMulti ? "md" : "full"} border flex items-center justify-center shrink-0 ${
                            isSelected ? "border-amber-500 bg-amber-500 text-white" : "border-muted-foreground/50"
                          }`}
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
                  placeholder="Your answer..."
                  disabled={submitted}
                  value={(currentVal as string) || ""}
                  onChange={(e) => setAnswers((prev) => ({ ...prev, [qKey]: e.target.value }))}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-border/60 bg-background focus:border-amber-500 focus:outline-none"
                />
              )}
            </div>
          );
        })}
        <div className="pt-2 flex items-center justify-between border-t border-border/40">
          <span className="text-[11px] text-muted-foreground">
            {submitted ? "✓ Answers submitted" : "Select options and submit to guide the agent"}
          </span>
          <button
            type="submit"
            disabled={submitted}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-all ${
              submitted
                ? "bg-emerald-500 text-white cursor-default"
                : "bg-amber-600 hover:bg-amber-500 text-white cursor-pointer active:scale-95"
            }`}
          >
            {submitted ? "Submitted ✓" : "Submit Answers"}
          </button>
        </div>
      </form>
    </CaideCard>
  );
};
