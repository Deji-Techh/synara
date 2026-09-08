// FILE: useChatHarnessSocket.ts
// Purpose: Lightweight harness-socket subscription for the main desktop chat.
// Session id equals the server thread id (the same key the turn loop and
// consent waiter use), so tool/MCP consent ui_prompts land in the shared
// harnessStore and can be answered from the transcript view — previously
// they were only visible in the separate harness panel, which parked turns
// with no visible approval card. Deliberately NOT useHarnessSession: that
// hook registers send-path diversion, which would reroute composer sends.

import { useEffect, useMemo, useState } from "react";
import { connectHarnessWs, makeHarnessUrl, type HarnessWsHandle } from "~/harnessWs";

export function useChatHarnessSocket(threadId: string | null): {
  connected: boolean;
  send: HarnessWsHandle["send"];
} {
  const [handle, setHandle] = useState<HarnessWsHandle | null>(null);

  useEffect(() => {
    if (!threadId) {
      setHandle(null);
      return;
    }
    let live = true;
    let handleRef: HarnessWsHandle | null = null;
    try {
      handleRef = connectHarnessWs({ url: makeHarnessUrl(null), sessionId: threadId });
    } catch {
      handleRef = null;
    }
    if (live) setHandle(handleRef);
    return () => {
      live = false;
      try {
        handleRef?.disconnect();
      } catch {
        // already closed
      }
      setHandle(null);
    };
  }, [threadId]);

  return useMemo(
    () => ({
      connected: handle !== null,
      send: (message: Record<string, unknown>) => {
        handle?.send(message);
      },
    }),
    [handle],
  );
}
