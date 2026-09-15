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
  sendCancel: (sessionId: string) => Promise<boolean>;
  resubscribe: HarnessWsHandle["resubscribe"];
} {
  const [handle, setHandle] = useState<HarnessWsHandle | null>(null);
  // Real socket state — NOT handle existence. A handle exists while the
  // socket is still connecting or reconnecting; sends during that window
  // are silently dropped, so the send path must only divert when open.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!threadId) {
      setHandle(null);
      return;
    }
    let live = true;
    let handleRef: HarnessWsHandle | null = null;
    setOpen(false);
    try {
      handleRef = connectHarnessWs({
        url: makeHarnessUrl(null),
        sessionId: threadId,
        onOpen: () => {
          if (live) setOpen(true);
        },
        onClose: () => {
          if (live) setOpen(false);
        },
      });
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
      setOpen(false);
    };
  }, [threadId]);

  return useMemo(
    () => ({
      connected: handle !== null && open,
      send: (message: Record<string, unknown>) => {
        handle?.send(message);
      },
      // Cancel delivery is retried across the reconnect window; resolves
      // false when undeliverable so the caller can report instead of
      // silently leaving the turn running.
      sendCancel: (sessionId: string) => {
        if (!handle) return Promise.resolve(false);
        return handle.sendWithRetry({ type: "cancel", sessionId });
      },
      resubscribe: () => {
        handle?.resubscribe();
      },
    }),
    [handle, open],
  );
}
