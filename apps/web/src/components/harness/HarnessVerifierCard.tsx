// FILE: HarnessVerifierCard.tsx
// Purpose: Post-turn review verdict card (verifier_result event). Collapsed
// shows pass/fail + confidence; expanded lists the issues. Caide card
// primitives + Tabler icons, theme tokens only.

import { useState } from "react";
import { IconCheck, IconX } from "@tabler/icons-react";
import { useHarnessStore } from "~/harnessStore";
import {
  CaideBadge,
  CaideCard,
  CaideCardHeader,
  CaideLazyContent,
} from "~/components/chat/CaideCardPrimitives";
import { DisclosureChevron } from "~/components/ui/DisclosureChevron";

export function HarnessVerifierCard(props: { sessionId: string }) {
  const state = useHarnessStore();
  const verdict = state.sessions[props.sessionId]?.verifier;
  const [open, setOpen] = useState(false);

  if (!verdict) return null;

  const accent = verdict.passed ? "success" : "warning";

  return (
    <div className="my-2 select-none">
      <CaideCard accent={accent} onClick={() => setOpen((v) => !v)} isExpanded={open}>
        <CaideCardHeader accent={accent}>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {verdict.passed ? (
              <IconCheck size={14} className="shrink-0 text-green-500" />
            ) : (
              <IconX size={14} className="shrink-0 text-amber-500" />
            )}
            <span className="truncate text-[12px] font-semibold tracking-tight">
              {verdict.passed ? "Review passed" : `Review found ${verdict.issues.length} issue${verdict.issues.length === 1 ? "" : "s"}`}
            </span>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {verdict.confidence}% · taste {verdict.tasteScore}
            </span>
          </div>
          <CaideBadge accent={accent}>Review</CaideBadge>
          <DisclosureChevron open={open} className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
        </CaideCardHeader>
        <CaideLazyContent open={open}>
          {verdict.issues.length > 0 ? (
            <ul className="flex flex-col gap-1.5 overflow-hidden rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
              {verdict.issues.map((issue, i) => (
                <li key={i} className="text-[12px] text-foreground/90">
                  {issue}
                </li>
              ))}
            </ul>
          ) : (
            <p className="overflow-hidden rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5 text-[12px] text-muted-foreground">
              No issues — the diff matches the task.
            </p>
          )}
        </CaideLazyContent>
      </CaideCard>
    </div>
  );
}
