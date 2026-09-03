// FILE: HarnessPlanCard.tsx
// Purpose: Plan presentation + Continue-in-Agent-mode gate for harness
// sessions. plan_update shows the plan with approve/request-change; plan_exit
// shows the accepted state with the Start-building gate. Continue/requests
// travel back as steer messages (the loop treats them as user turns).

import { useState } from "react";
import { Button } from "~/components/ui/button";
import { useHarnessStore } from "~/harnessStore";
import {
  CaideBadge,
  CaideCard,
  CaideCardHeader,
  CaideLazyContent,
} from "~/components/chat/CaideCardPrimitives";
import { DisclosureChevron } from "~/components/ui/DisclosureChevron";

type SendFn = (message: Record<string, unknown>) => void;

export function HarnessPlanCard(props: { sessionId: string; send: SendFn }) {
  const state = useHarnessStore();
  const plan = state.sessions[props.sessionId]?.plan;
  const [open, setOpen] = useState(true);
  const [changeOpen, setChangeOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [acted, setActed] = useState(false);

  if (!plan || acted) return null;

  const steer = (prompt: string) => {
    props.send({ type: "steer", sessionId: props.sessionId, prompt });
    setActed(true);
  };

  return (
    <div className="my-2 select-none">
      <CaideCard accent="info" onClick={() => setOpen((v) => !v)} isExpanded={open}>
        <CaideCardHeader accent="info">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <CaideBadge accent="info">{plan.exited ? "Plan accepted" : "Plan"}</CaideBadge>
            <span className="truncate text-[12px] font-semibold tracking-tight">{plan.title}</span>
          </div>
          <DisclosureChevron open={open} className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
        </CaideCardHeader>
        <CaideLazyContent open={open}>
          <div className="flex flex-col gap-2.5 overflow-hidden rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
            <p className="text-xs text-foreground/90">{plan.summary}</p>
            <pre className="max-h-64 overflow-auto rounded-md bg-muted/40 p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-foreground/85 select-text">
              {plan.plan}
            </pre>
            {plan.exited ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground">
                  Continue in Agent mode to build this plan?
                </span>
                <Button size="xs" onClick={() => steer("Begin implementation of the accepted plan now.")}>
                  Start building
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex justify-end gap-2">
                  <Button size="xs" variant="outline" onClick={() => setChangeOpen((v) => !v)}>
                    Request changes
                  </Button>
                  <Button size="xs" onClick={() => steer("The plan looks good — proceed to implementation.")}>
                    Looks good — continue
                  </Button>
                </div>
                {changeOpen ? (
                  <div className="flex flex-col gap-2">
                    <textarea
                      className="min-h-16 rounded-md border border-border/70 bg-background px-2.5 py-1.5 text-xs"
                      placeholder="What should change in the plan?"
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                    />
                    <div className="flex justify-end">
                      <Button
                        size="xs"
                        disabled={!feedback.trim()}
                        onClick={() => steer(`Plan change request: ${feedback.trim()}`)}
                      >
                        Send change request
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </CaideLazyContent>
      </CaideCard>
    </div>
  );
}
