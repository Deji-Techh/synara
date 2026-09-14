// FILE: HarnessBlueprintCard.tsx
// Purpose: App-blueprint presentation + approval gate for harness sessions.
// Maps the blueprint_update event onto the existing CaideAppBlueprintCard,
// with Approve / Request-changes actions answering blueprint_response.
// Collapsible CaideCard shell (shared disclosure motion) like the other
// harness cards.

import { useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { harnessStore, useHarnessStore } from "~/harnessStore";
import { CaideAppBlueprintCard } from "~/components/chat/CaideAppBlueprintCard";
import {
  CaideBadge,
  CaideCard,
  CaideCardHeader,
  CaideLazyContent,
} from "~/components/chat/CaideCardPrimitives";
import { DisclosureChevron } from "~/components/ui/DisclosureChevron";
import { DisclosureRegion } from "~/components/ui/DisclosureRegion";

type SendFn = (message: Record<string, unknown>) => void;

export function HarnessBlueprintCard(props: { sessionId: string; send: SendFn }) {
  const state = useHarnessStore();
  const blueprint = state.sessions[props.sessionId]?.blueprint;
  const [open, setOpen] = useState(true);
  const [changeOpen, setChangeOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [acted, setActed] = useState(false);
  const responseSent = useRef(false);

  if (!blueprint || acted) return null;

  // Double-submit guard + optimistic store clear (remount resurrection).
  const respond = (fn: () => void) => {
    if (responseSent.current) return;
    responseSent.current = true;
    fn();
    harnessStore.resolveBlueprint(props.sessionId);
    setActed(true);
  };

  const approve = () => {
    respond(() =>
      props.send({
        type: "blueprint_response",
        sessionId: props.sessionId,
        approved: true,
        blueprint: {
          appName: blueprint.appName,
          userPrompt: blueprint.userPrompt,
          framework: blueprint.framework,
          designDirection: blueprint.designDirection,
          primaryColor: blueprint.primaryColor,
          visuals: blueprint.visuals,
        },
      }),
    );
  };

  const requestChanges = () => {
    respond(() =>
      props.send({
        type: "blueprint_response",
        sessionId: props.sessionId,
        approved: false,
        feedback,
      }),
    );
  };

  return (
    <div className="my-2 select-none">
      {/* Toggle lives on the header ONLY: body clicks (buttons, textarea)
          must never collapse the card mid-interaction. */}
      <CaideCard accent="info" isExpanded={open}>
        <div onClick={() => setOpen((v) => !v)} className="cursor-pointer">
          <CaideCardHeader accent="info">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <CaideBadge accent="info">Blueprint</CaideBadge>
              <span className="truncate text-[12px] font-semibold tracking-tight">
                {blueprint.appName}
              </span>
            </div>
            <DisclosureChevron
              open={open}
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70"
            />
          </CaideCardHeader>
        </div>
        <CaideLazyContent open={open}>
          <div className="flex flex-col gap-2 overflow-hidden rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
            <CaideAppBlueprintCard
              appName={blueprint.appName}
              designDirection={blueprint.designDirection}
              primaryColor={blueprint.primaryColor}
              description={blueprint.userPrompt}
            />
            <div className="flex flex-col gap-2">
              <div className="flex justify-end gap-2">
                <Button size="xs" variant="outline" onClick={() => setChangeOpen((v) => !v)}>
                  Request changes
                </Button>
                <Button size="xs" onClick={approve}>
                  Approve blueprint
                </Button>
              </div>
              <DisclosureRegion open={changeOpen}>
                <div className="flex flex-col gap-2">
                  <textarea
                    className="min-h-16 rounded-md border border-border/70 bg-background px-2.5 py-1.5 text-xs"
                    placeholder="What should change in the blueprint?"
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                  />
                  <div className="flex justify-end">
                    <Button size="xs" disabled={!feedback.trim()} onClick={requestChanges}>
                      Send change request
                    </Button>
                  </div>
                </div>
              </DisclosureRegion>
            </div>
          </div>
        </CaideLazyContent>
      </CaideCard>
    </div>
  );
}
