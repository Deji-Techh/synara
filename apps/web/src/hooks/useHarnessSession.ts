// FILE: useHarnessSession.ts
// Purpose: Own the harness socket for one thread (sessionId = threadId):
// connect on mount, set the active harness session, register the handle for
// send-path diversion, disconnect + unregister on unmount.

import { useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
    harnessStore.setActiveSession(threadId);
    let handleRef: HarnessWsHandle | null = null;
    try {
      handleRef = connectHarnessWs({ url: makeHarnessUrl(null), sessionId: threadId });
    } catch {
      handleRef = null;
    }
    setHandle(handleRef);
    if (handleRef) {
      const entry = {
        send: handleRef.send,
        disconnect: handleRef.disconnect,
        connected: () => true,
        appPath,
        framework,
      };
      registerHarnessSession(threadId, entry);
    }
    return () => {
      unregisterHarnessSession(threadId);
      try {
        handleRef?.disconnect();
      } catch {
        // already closed
      }
      setHandle(null);
    };
  }, [threadId, appPath, framework]);

  return useMemo(
    () => ({
      connected: handle !== null && getHarnessSession(threadId) !== undefined,
      send: (message: Record<string, unknown>) => {
        const live = getHarnessSession(threadId);
        if (live) live.send(message);
        else handle?.send(message);
      },
    }),
    [handle, threadId],
  );
}
