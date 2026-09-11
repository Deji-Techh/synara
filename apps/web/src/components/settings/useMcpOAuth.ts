// FILE: useMcpOAuth.ts
// Purpose: Settings-side MCP OAuth starter (Phase 5). Opens a settings-scoped
// harness socket, sends mcp_oauth_start, opens the authorize URL externally,
// and resolves when the server reports connected/failed. Tokens never touch
// the client — they persist server-side in oauth_state.

import { useCallback, useRef, useState } from "react";
import type { HarnessEvent } from "@caide/contracts";
import { connectHarnessWs, makeHarnessUrl, type HarnessWsHandle } from "~/harnessWs";

export type McpOAuthStatus =
  | { state: "idle" }
  | { state: "starting" }
  | { state: "authorizing"; authorizeUrl: string }
  | { state: "connected" }
  | { state: "failed"; message: string };

let requestCounter = 0;

function ensureSocket(
  ref: React.MutableRefObject<HarnessWsHandle | null>,
  onEvent: (event: HarnessEvent) => void,
): HarnessWsHandle {
  if (!ref.current) {
    ref.current = connectHarnessWs({ url: makeHarnessUrl(null), sessionId: "settings", onEvent });
  }
  return ref.current;
}

export function useMcpOAuth(): {
  statusByServer: Record<string, McpOAuthStatus>;
  start: (input: { serverId: string; serverUrl: string; clientId?: string; scope?: string }) => void;
  reset: (serverId: string) => void;
} {
  const [statusByServer, setStatusByServer] = useState<Record<string, McpOAuthStatus>>({});
  const handleRef = useRef<HarnessWsHandle | null>(null);
  const pendingRef = useRef(new Map<string, (status: McpOAuthStatus) => void>());

  const setStatus = useCallback((serverId: string, status: McpOAuthStatus) => {
    setStatusByServer((prev) => ({ ...prev, [serverId]: status }));
    pendingRef.current.get(serverId)?.(status);
  }, []);

  const start = useCallback(
    (input: { serverId: string; serverUrl: string; clientId?: string; scope?: string }) => {
      const requestId = `mcp-oauth-${++requestCounter}-${Date.now()}`;
      setStatus(input.serverId, { state: "starting" });
      const handle = ensureSocket(handleRef, (event) => {
        if (event.type !== "mcp_oauth") return;
        const e = event as unknown as {
          requestId?: string;
          serverId: string;
          status: "authorize" | "connected" | "failed";
          authorizeUrl?: string;
          message?: string;
        };
        if (e.requestId !== requestId) return;
        if (e.status === "authorize" && e.authorizeUrl) {
          setStatus(e.serverId, { state: "authorizing", authorizeUrl: e.authorizeUrl });
          window.open(e.authorizeUrl, "_blank", "noopener,noreferrer");
        } else if (e.status === "connected") {
          setStatus(e.serverId, { state: "connected" });
        } else if (e.status === "failed") {
          setStatus(e.serverId, { state: "failed", message: e.message ?? "OAuth flow failed." });
        }
      });
      handle.send({ type: "subscribe", sessionId: "settings" });
      handle.send({
        type: "mcp_oauth_start",
        sessionId: "settings",
        requestId,
        serverId: input.serverId,
        serverUrl: input.serverUrl,
        ...(input.clientId?.trim() ? { clientId: input.clientId.trim() } : {}),
        ...(input.scope?.trim() ? { scope: input.scope.trim() } : {}),
      });
    },
    [setStatus],
  );

  const reset = useCallback((serverId: string) => {
    pendingRef.current.delete(serverId);
    setStatusByServer((prev) => {
      const next = { ...prev };
      delete next[serverId];
      return next;
    });
  }, []);

  return { statusByServer, start, reset };
}
