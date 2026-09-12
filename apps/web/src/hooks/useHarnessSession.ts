// FILE: useHarnessSession.ts
// Purpose: Own the harness socket for one thread (sessionId = threadId):
// connect on mount, set the active harness session, register the handle for
// send-path diversion, disconnect + unregister on unmount.

import { useEffect, useMemo, useRef, useState } from "react";
import { connectHarnessWs, makeHarnessUrl, type HarnessWsHandle } from "~/harnessWs";
import { harnessStore } from "~/harnessStore";
import {
  getHarnessSession,
  registerHarnessSession,
  unregisterHarnessSession,
} from "~/harnessSessionRegistry";

export function useHarnessSession(
  threadId: string,
  appPath: string,
  framework?: "blank" | "react-native" | "flutter" | "website",
): { connected: boolean; send: HarnessWsHandle["send"] } {
  const [handle, setHandle] = useState<HarnessWsHandle | null>(null);
  // Real socket state (see useChatHarnessSocket): the send path must only
  // divert while the socket is actually open, otherwise turn_start is
  // silently dropped and the user stares at their own echo with no reply.
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);

  useEffect(() => {
    harnessStore.setActiveSession(threadId);
    let live = true;
    let handleRef: HarnessWsHandle | null = null;
    openRef.current = false;
    setOpen(false);
    try {
      handleRef = connectHarnessWs({
        url: makeHarnessUrl(null),
        sessionId: threadId,
        onOpen: () => {
          openRef.current = true;
          if (live) setOpen(true);
        },
        onClose: () => {
          openRef.current = false;
          if (live) setOpen(false);
        },
      });
    } catch {
      handleRef = null;
    }
    setHandle(handleRef);
    if (handleRef) {
      const entry = {
        send: handleRef.send,
        disconnect: handleRef.disconnect,
        connected: () => openRef.current,
        appPath,
        framework,
      };
      registerHarnessSession(threadId, entry);
    }
    return () => {
      live = false;
      unregisterHarnessSession(threadId);
      try {
        handleRef?.disconnect();
      } catch {
        // already closed
      }
      setHandle(null);
      openRef.current = false;
      setOpen(false);
    };
  }, [threadId, appPath, framework]);

  return useMemo(
    () => ({
      connected: open && handle !== null && getHarnessSession(threadId) !== undefined,
      send: (message: Record<string, unknown>) => {
        const live = getHarnessSession(threadId);
        if (live) live.send(message);
        else handle?.send(message);
      },
    }),
    [handle, open, threadId],
  );
}
