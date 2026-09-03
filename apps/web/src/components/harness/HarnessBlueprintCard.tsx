// FILE: HarnessBlueprintCard.tsx
// Purpose: App-blueprint presentation + approval gate for harness sessions.
// Maps the blueprint_update event onto the existing CaideAppBlueprintCard,
// with Approve / Request-changes actions answering blueprint_response.

import { useState } from "react";
import { Button } from "~/components/ui/button";
import { useHarnessStore } from "~/harnessStore";
import { CaideAppBlueprintCard } from "~/components/chat/CaideAppBlueprintCard";

type SendFn = (message: Record<string, unknown>) => void;

export function HarnessBlueprintCard(props: { sessionId: string; send: SendFn }) {
  const state = useHarnessStore();
  const blueprint = state.sessions[props.sessionId]?.blueprint;
  const [changeOpen, setChangeOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [acted, setActed] = useState(false);

  if (!blueprint || acted) return null;

  const approve = () => {
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
    });
    setActed(true);
  };

  const requestChanges = () => {
    props.send({
      type: "blueprint_response",
      sessionId: props.sessionId,
      approved: false,
      feedback,
    });
    setActed(true);
  };

  return (
    <div className="my-2">
      <CaideAppBlueprintCard
        appName={blueprint.appName}
        designDirection={blueprint.designDirection}
        primaryColor={blueprint.primaryColor}
        description={blueprint.userPrompt}
      />
      <div className="mt-2 flex flex-col gap-2">
        <div className="flex justify-end gap-2">
          <Button size="xs" variant="outline" onClick={() => setChangeOpen((v) => !v)}>
            Request changes
          </Button>
          <Button size="xs" onClick={approve}>
            Approve blueprint
          </Button>
        </div>
        {changeOpen ? (
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
        ) : null}
      </div>
    </div>
  );
}
