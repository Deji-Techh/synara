// FILE: harnessWs.ts
// Purpose: Lean browser client for the harness WebSocket endpoint
// (subscribe/ping/heartbeat + prompt/consent answers). Feeds harnessStore.
// Separate from the legacy Effect RPC wsTransport — this speaks only typed
// HarnessEvent envelopes.

import type { HarnessEvent } from "@caide/contracts";
import { getAllHarnessSessions, getHarnessSession } from "./harnessSessionRegistry";
import { harnessStore } from "./harnessStore";
import { applyProjectOverrides } from "./components/settings/mcpProjectOverrides";

export interface HarnessWsOptions {
  url: string;
  sessionId: string;
  onEvent?: (event: HarnessEvent) => void;
  /** Fires on every (re)connect, after subscribe — the only safe moment to send. */
  onOpen?: () => void;
  /** Fires when the socket closes (reconnect will be attempted unless disconnected). */
  onClose?: () => void;
  heartbeatMs?: number;
  maxBackoffMs?: number;
}

function isHarnessEvent(value: unknown): value is HarnessEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

/** Socket URL for the harness endpoint (same origin rules as the RPC socket). */
export function makeHarnessUrl(explicitUrl: string | null): string {
  const bridgeUrl = typeof window !== "undefined" ? window.desktopBridge?.getWsUrl() : undefined;
  const envUrl =
    typeof import.meta !== "undefined"
      ? ((import.meta as unknown as { env?: Record<string, string | undefined> }).env
          ?.VITE_WS_URL as string | undefined)
      : undefined;
  const raw =
    explicitUrl && explicitUrl.length > 0
      ? explicitUrl
      : bridgeUrl && bridgeUrl.length > 0
        ? bridgeUrl
        : envUrl && envUrl.length > 0
          ? envUrl
          : typeof window !== "undefined"
            ? `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:${window.location.port}`
            : "ws://127.0.0.1:0";
  const url = new URL(raw);
  const token = url.searchParams.get("token");
  url.pathname = "/harness";
  url.search = "";
  if (token) url.searchParams.set("token", token);
  return url.toString();
}

/**
 * Decode an inbound socket payload to text. Servers must send text frames,
 * but binary senders exist in the wild (the embedded backend once encoded
 * every harness event as binary, which browsers deliver as Blob and which
 * silently dropped every inbound event). Never throws — returns null when
 * the payload cannot be read as text.
 */
async function decodeSocketText(data: unknown): Promise<string | null> {
  try {
    if (typeof data === "string") return data;
    if (typeof Blob !== "undefined" && data instanceof Blob) return await data.text();
    if (typeof ArrayBuffer !== "undefined" && data instanceof ArrayBuffer) {
      return new TextDecoder().decode(data);
    }
    if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(data)) {
      return new TextDecoder().decode(data as ArrayBufferView);
    }
  } catch {
    return null;
  }
  return null;
}

export function connectHarnessWs(options: HarnessWsOptions): HarnessWsHandle {
  const heartbeatMs = options.heartbeatMs ?? 15_000;
  const maxBackoffMs = options.maxBackoffMs ?? 10_000;
  let ws: WebSocket | null = null;
  let closed = false;
  let backoffMs = 500;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  // Pong deadline: pings without pongs mean a half-open socket (common
  // during long model-silence windows). Without this, prompts written to a
  // dead sender vanish with no onclose to trigger a reconnect — the card
  // then appears only after a manual navigation remount.
  let lastPongAt = 0;
  let pongWatchdog: ReturnType<typeof setInterval> | null = null;
  // Delivery diagnostics: silent send-drops are otherwise invisible.
  let droppedSends = 0;

  const cleanupSocket = () => {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    if (pongWatchdog) {
      clearInterval(pongWatchdog);
      pongWatchdog = null;
    }
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      try {
        ws.close();
      } catch {
        // already closed
      }
      ws = null;
    }
  };

  const scheduleReconnect = () => {
    if (closed) return;
    reconnectTimer = setTimeout(() => {
      backoffMs = Math.min(backoffMs * 2, maxBackoffMs);
      open();
    }, backoffMs);
  };

  const open = () => {
    if (closed) return;
    cleanupSocket();
    const socket = new WebSocket(options.url);
    ws = socket;

    socket.onopen = () => {
      backoffMs = 500;
      // Subscribe send is outside any try upstream: if it throws (race
      // close), close to trigger a backoff reconnect instead of sitting
      // open-but-never-subscribed while live broadcasts drop.
      try {
        socket.send(JSON.stringify({ type: "subscribe", sessionId: options.sessionId }));
      } catch {
        try {
          socket.close();
        } catch {
          // close triggers reconnect
        }
        return;
      }
      lastPongAt = Date.now();
      try {
        options.onOpen?.();
      } catch {
        // subscriber errors must not break the socket
      }
      syncHarnessSettings((message) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
      }, options.sessionId);
      heartbeat = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "ping" }));
        }
      }, heartbeatMs);
      // Half-open watchdog: two missed pong windows closes the socket so
      // backoff reconnect + replay resubscribes instead of hanging silently.
      pongWatchdog = setInterval(() => {
        if (closed || socket.readyState !== WebSocket.OPEN) return;
        if (Date.now() - lastPongAt > heartbeatMs * 2 + 5_000) {
          console.warn(
            `[caide] harness socket ${options.sessionId} missed pongs — reconnecting to recover live delivery`,
          );
          try {
            socket.close();
          } catch {
            // close triggers reconnect
          }
        }
      }, heartbeatMs);
    };

    socket.onmessage = (message) => {
      // Decoupled + async: binary frames (Blob) decode asynchronously, and a
      // slow decode must never block later frames.
      void (async () => {
        try {
          const text = await decodeSocketText(message.data);
          if (text === null) return;
          const event: unknown = JSON.parse(text);
          if (!isHarnessEvent(event)) return;
          if ((event as { type: string }).type === "pong") {
            lastPongAt = Date.now();
            return;
          }
          harnessStore.handleEvent(event);
          try {
            options.onEvent?.(event);
          } catch {
            // subscriber errors must not break the socket
          }
        } catch {
          // ignore malformed server message
        }
      })();
    };

    socket.onclose = () => {
      cleanupSocket();
      try {
        options.onClose?.();
      } catch {
        // subscriber errors must not break reconnect
      }
      scheduleReconnect();
    };
    socket.onerror = () => {
      try {
        socket.close();
      } catch {
        // close triggers reconnect
      }
    };
  };

  open();

  return {
    disconnect: () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      cleanupSocket();
    },
    send: (message: Record<string, unknown>) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      } else {
        // Dropped sends are otherwise invisible (answers vanish, turns hang).
        // Count them; the resubscribe-while-live path in ChatView recovers.
        droppedSends += 1;
        if (droppedSends <= 3 || droppedSends % 10 === 0) {
          console.warn(
            `[caide] harness send dropped (socket not open, session ${options.sessionId}, type ${(message as { type?: unknown }).type}, dropped=${droppedSends})`,
          );
        }
      }
    },
    resubscribe: () => {
      // Re-send subscribe on the live socket: the server replays missed
      // prompts (dedupe by requestId makes this safe). Used while a turn is
      // live but quiet, to self-heal delivery gaps without navigation.
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: "subscribe", sessionId: options.sessionId }));
        } catch {
          // send failure surfaces via close/reconnect
        }
      }
    },
  };
}

export interface HarnessWsHandle {
  disconnect: () => void;
  send: (message: Record<string, unknown>) => void;
  /** Re-send subscribe on the live socket to trigger a replay re-sync. */
  resubscribe: () => void;
}

export function answerUiPrompt(
  send: (message: Record<string, unknown>) => void,
  requestId: string,
  answers: Record<string, string> | null,
): void {
  send({ type: "prompt_answer", requestId, answers });
}

export function answerConsent(
  send: (message: Record<string, unknown>) => void,
  requestId: string,
  decision: "accept-once" | "accept-always" | "decline",
): void {
  send({ type: "consent_answer", requestId, decision });
}

export interface HarnessTurnStart {
  appPath: string;
  prompt: string;
  mode?: "build" | "ask" | "agent" | "plan";
  framework?: "blank" | "react-native" | "flutter" | "website";
  providerId?: string;
  modelId?: string;
  maxSteps?: number;
  /** Composer access mode (e.g. "full-access") — drives consent bypass. */
  runtimeMode?: string;
  providerSettings?: Record<
    string,
    {
      apiKey?: { value?: string | null } | string | null;
      apiBaseUrl?: string | null;
      baseUrl?: string | null;
      resourceName?: string | null;
    }
  >;
}

/** Ask the server gateway to start a harness turn on this session. */
export function startHarnessTurn(
  send: (message: Record<string, unknown>) => void,
  sessionId: string,
  turn: HarnessTurnStart,
): void {
  send({ type: "turn_start", sessionId, turn });
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Push client settings to the server session stores (M3g). Reads the same
 * localStorage keys the settings panels write: tool approvals, safe-SQL,
 * MCP prefs/servers, DB connections. Call on socket open and whenever the
 * user saves settings.
 */
export function syncHarnessSettings(
  send: (message: Record<string, unknown>) => void,
  sessionId: string,
): void {
  const toolConsents = readJson<Record<string, string>>("caide.tool-approvals.v1", {});
  const safeSql = (() => {
    try {
      return localStorage.getItem("caide.tool-approvals.safe-sql.v1") !== "false";
    } catch {
      return true;
    }
  })();
  const mcpPrefs = readJson<{ autoApproveSafe?: boolean }>("caide.mcp-prefs.v1", {});
  const connections = readJson<
    Array<{
      provider: string;
      databaseUrl: string;
      projectId?: string;
      enabled: boolean;
      scope?: { type: string; workspaceRoot?: string };
    }>
  >("caide.db-connections.v1", []);
  const mcpServers = readJson<
    Array<{
      id: string;
      name: string;
      transport: string;
      enabled: boolean;
      command?: string;
      args?: string[];
      env?: Record<string, string>;
      url?: string;
      headers?: Record<string, string>;
      defaultConsent?: "ask" | "always" | "never";
    }>
  >("caide.mcp-servers.v1", []);
  // Per-project MCP enable overlay: the thread's workspace decides which
  // servers are live for that session; global registry untouched.
  const sessionAppPath = getHarnessSession(sessionId)?.appPath ?? null;
  const syncedMcpServers = applyProjectOverrides(mcpServers, sessionAppPath);
  const blockchainNetworks = readJson<
    Array<{
      id: string;
      chainKind: string;
      chainId: string;
      name: string;
      rpcUrl: string;
      explorerUrl?: string;
      isActive: boolean;
    }>
  >("caide.blockchain-networks.v1", []);
  const dbLinks = connections
    .filter((c) => c.enabled && typeof c.databaseUrl === "string" && c.databaseUrl.length > 0)
    .map((c) => ({
      provider: c.provider === "neon" ? "neon" : "supabase",
      databaseUrl: c.databaseUrl,
      projectId: c.projectId,
      scope: c.scope,
    }));
  send({
    type: "settings_sync",
    sessionId,
    settings: {
      toolConsents,
      safeSql,
      mcpAutoApproveSafe: mcpPrefs.autoApproveSafe !== false,
      dbLinks,
      mcpServers: syncedMcpServers,
      blockchainNetworks,
      agentRouting: readJson("caide:agent-routing.v1", null),
    },
  });
}

/**
 * Broadcast current client settings to all active harness WebSocket sessions.
 * Safe to call whenever settings change anywhere in the UI.
 */
export function syncAllActiveHarnessSettings(): void {
  for (const { threadId, handle } of getAllHarnessSessions()) {
    syncHarnessSettings(handle.send, threadId);
  }
}
