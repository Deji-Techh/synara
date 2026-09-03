// FILE: HarnessReveals.tsx
// Purpose: Bridge harness ui_reveal events into the right dock: database
// reveals open the singleton database pane; preview reveals open the device
// pane. One-shot per reveal entry (tracked by index ref).

import { useEffect, useRef } from "react";
import type { ThreadId } from "@caide/contracts";
import { useHarnessStore } from "~/harnessStore";
import { useRightDockStore } from "~/rightDockStore";

export function HarnessReveals(props: { threadId: ThreadId; sessionId: string }) {
  const state = useHarnessStore();
  const reveals = state.sessions[props.sessionId]?.reveals ?? [];
  const seen = useRef(0);

  useEffect(() => {
    const store = useRightDockStore.getState();
    while (seen.current < reveals.length) {
      const reveal = reveals[seen.current];
      seen.current += 1;
      if (!reveal) continue;
      // openPane focuses the existing singleton — repeated reveals never toggle shut.
      if (reveal.pane === "database") {
        store.openPane(props.threadId, { kind: "database" });
      } else if (reveal.pane === "preview") {
        store.openPane(props.threadId, { kind: "device" });
      }
    }
  }, [reveals, props.threadId]);

  return null;
}
