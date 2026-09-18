// FILE: tunnel.ts
// Purpose: Live reverse-tunnel preview client: exposes the thread's running
// localhost preview to the internet through the preview-control-plane relay
// (control WS + REST + secondary WS).
// Donor: dyad x caide src/ipc/services/preview_tunnel_service.ts — protocol
// handling verbatim; adaptations: keyed by threadId (V1 keyed numeric
// appIds; the relay still requires a positive-int appId, so a stable hash
// of the threadId is sent), local port read from the live preview session
// (V1 used a fixed per-app port), `ws` package transport (capture.ts
// precedent), plain Errors (no Electron/DyadError).

import http from "node:http";
import { WebSocket } from "ws";

import { getPreviewState } from "./manager.ts";
import { previewApiRequest, previewApiUrl } from "./previewIdentity.ts";
import {
  extractSubprotocols,
  frame,
  sanitizeOriginHeaders,
  sanitizeServerHeaders,
  toBase64Chunks,
  wsControlUrl,
  wsSecondaryUrl,
} from "../../dyad/preview/tunnelProtocol.ts";

export type TunnelPreviewState = "connecting" | "live" | "stopped" | "expired";

export interface TunnelPreviewStatus {
  threadId: string;
  tunnelId: string;
  url: string;
  expiresAt: string;
  state: TunnelPreviewState;
  errorMessage: string | null;
}

export class TunnelPreviewError extends Error {
  readonly code: "rate-limited" | "external";
  constructor(message: string, code: "rate-limited" | "external" = "external") {
    super(message);
    this.name = "TunnelPreviewError";
    this.code = code;
  }
}

const HEARTBEAT_MS = 30_000;
const CONNECT_TIMEOUT_MS = 15_000;

interface CreatedTunnel {
  tunnelId: string;
  appId: number;
  status: string;
  expiresAt: string;
  stoppedAt: string | null;
  lastSeenAt: string | null;
  tunnelToken: string;
  publicToken: string;
}

interface ActiveTunnel {
  threadId: string;
  tunnelId: string;
  tunnelToken: string;
  publicToken: string;
  expiresAt: string;
  ws: WebSocket | null;
  localPort: number;
  pendingHttp: Map<string, http.ClientRequest>;
  heartbeat: ReturnType<typeof setInterval> | null;
  state: TunnelPreviewState;
  errorMessage: string | null;
}

const tunnels = new Map<string, ActiveTunnel>();

/**
 * Relay-side numeric app id. The relay requires a positive integer; V2 has
 * no numeric app ids, so a stable FNV-1a hash of the threadId is sent
 * (scoped per installation, collisions only alias accounting rows).
 */
export function relayAppIdForThread(threadId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < threadId.length; i++) {
    hash ^= threadId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 2_147_483_647 + 1;
}

function localPortForPreview(threadId: string): number {
  const state = getPreviewState(threadId);
  // The tunnel reverse-proxies the DEV server, never the injection proxy
  // (the proxy binds its own port in front of it).
  const direct = state.directUrl || state.url;
  if (!state.running || !direct) {
    throw new TunnelPreviewError(
      "No active preview — call open_preview first, then share it through the tunnel.",
    );
  }
  try {
    const port = new URL(direct).port;
    const parsed = Number(port);
    if (!Number.isInteger(parsed) || parsed <= 0) throw new Error("no port");
    return parsed;
  } catch {
    throw new TunnelPreviewError(`Preview URL has no local port: ${direct}`);
  }
}

function tunnelStatus(tunnel: ActiveTunnel): TunnelPreviewStatus {
  return {
    threadId: tunnel.threadId,
    tunnelId: tunnel.tunnelId,
    url: `${previewApiUrl()}/t/${tunnel.publicToken}`,
    expiresAt: tunnel.expiresAt,
    state: tunnel.state,
    errorMessage: tunnel.errorMessage,
  };
}

function sendControl(tunnel: ActiveTunnel, message: Record<string, unknown>): void {
  if (tunnel.ws && tunnel.ws.readyState === WebSocket.OPEN) {
    tunnel.ws.send(frame(message));
  }
}

function closeStream(ws: WebSocket | null): void {
  try {
    if (ws && ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
      ws.close();
    }
  } catch {
    // ignore close errors on already-torn-down sockets
  }
}

function bridge(first: WebSocket, second: WebSocket): void {
  first.on("message", (data) => {
    if (second.readyState === WebSocket.OPEN) second.send(data as Buffer);
  });
  second.on("message", (data) => {
    if (first.readyState === WebSocket.OPEN) first.send(data as Buffer);
  });
  const closeBoth = () => {
    closeStream(first);
    closeStream(second);
  };
  first.on("close", closeBoth);
  first.on("error", closeBoth);
  second.on("close", closeBoth);
  second.on("error", closeBoth);
}

function handleWsUpgrade(tunnel: ActiveTunnel, message: Record<string, unknown>): void {
  const stream = String(message.stream ?? "");
  const requestPath = String(message.path ?? "/");
  if (!stream) return;
  const protocols = extractSubprotocols(message.headers as Record<string, unknown> | undefined);
  const secondary = new WebSocket(
    wsSecondaryUrl(previewApiUrl(), tunnel.tunnelId, tunnel.tunnelToken, stream),
    protocols.length > 0 ? protocols : undefined,
  );
  const local = new WebSocket(
    `ws://localhost:${tunnel.localPort}${requestPath}`,
    protocols.length > 0 ? protocols : undefined,
  );
  bridge(secondary, local);
}

function handleRequest(tunnel: ActiveTunnel, message: Record<string, unknown>): void {
  const id = String(message.id ?? "");
  const method = String(message.method ?? "GET");
  const requestPath = String(message.path ?? "/");
  const headers = sanitizeServerHeaders(
    (message.headers as Record<string, unknown> | undefined) ?? {},
  );

  const request = http.request({
    hostname: "localhost",
    port: tunnel.localPort,
    method,
    path: requestPath,
    headers,
  });
  tunnel.pendingHttp.set(id, request);
  request.on("response", (response) => {
    sendControl(tunnel, {
      type: "response-head",
      id,
      status: response.statusCode ?? 502,
      headers: sanitizeOriginHeaders(response.headers as unknown as Record<string, unknown>),
    });
    response.on("data", (chunk: Buffer) => {
      for (const data of toBase64Chunks(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))) {
        sendControl(tunnel, { type: "response-body", id, data });
      }
    });
    response.on("end", () => {
      tunnel.pendingHttp.delete(id);
      sendControl(tunnel, { type: "response-end", id });
    });
    response.on("error", (error) => {
      tunnel.pendingHttp.delete(id);
      sendControl(tunnel, { type: "error", id, message: error.message });
    });
  });
  request.on("error", (error) => {
    tunnel.pendingHttp.delete(id);
    sendControl(tunnel, { type: "error", id, message: error.message });
  });
}

function openControlWebSocket(tunnel: ActiveTunnel): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsControlUrl(previewApiUrl(), tunnel.tunnelToken));
    const timeout = setTimeout(
      () => reject(new TunnelPreviewError("Tunnel control connection timed out")),
      CONNECT_TIMEOUT_MS,
    );
    ws.on("open", () => {
      clearTimeout(timeout);
      resolve(ws);
    });
    ws.on("error", () => {
      clearTimeout(timeout);
      reject(new TunnelPreviewError("Tunnel control connection failed"));
    });
  });
}

async function attachControlMessages(tunnel: ActiveTunnel): Promise<void> {
  const ws = await openControlWebSocket(tunnel);
  tunnel.ws = ws;
  // The control WS is open: the relay has marked the tunnel online and will
  // forward requests to us. Reflect that in the visible state immediately.
  tunnel.state = "live";
  tunnel.errorMessage = null;

  ws.on("message", (data) => {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(String(data)) as Record<string, unknown>;
    } catch {
      return;
    }
    switch (message.type) {
      case "ping":
        sendControl(tunnel, { type: "pong" });
        break;
      case "request":
        handleRequest(tunnel, message);
        break;
      case "request-body": {
        const request = tunnel.pendingHttp.get(String(message.id ?? ""));
        if (!request) break;
        if (typeof message.data === "string") {
          request.write(Buffer.from(message.data, "base64"));
        }
        break;
      }
      case "request-end": {
        const key = String(message.id ?? "");
        const request = tunnel.pendingHttp.get(key);
        if (!request) break;
        tunnel.pendingHttp.delete(key);
        request.end();
        break;
      }
      case "ws-upgrade":
        handleWsUpgrade(tunnel, message);
        break;
    }
  });

  const teardown = () => {
    if (tunnel.heartbeat) clearInterval(tunnel.heartbeat);
    tunnel.heartbeat = null;
    tunnel.state = "stopped";
    tunnels.delete(tunnel.threadId);
  };
  ws.on("close", teardown);
  ws.on("error", teardown);

  tunnel.heartbeat = setInterval(() => {
    sendControl(tunnel, { type: "pong" });
  }, HEARTBEAT_MS);
  tunnel.heartbeat.unref?.();
}

function classifyTunnelError(error: unknown): TunnelPreviewError {
  if (error instanceof TunnelPreviewError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (/limit reached/i.test(message)) {
    return new TunnelPreviewError(message, "rate-limited");
  }
  return new TunnelPreviewError(message, "external");
}

export async function startTunnelPreview(threadId: string): Promise<TunnelPreviewStatus> {
  const existing = tunnels.get(threadId);
  if (existing) return tunnelStatus(existing);
  const localPort = localPortForPreview(threadId);

  let created: CreatedTunnel | null = null;
  try {
    created = await previewApiRequest<CreatedTunnel>("/v1/tunnels", {
      method: "POST",
      body: JSON.stringify({ appId: relayAppIdForThread(threadId) }),
    });

    const tunnel: ActiveTunnel = {
      threadId,
      tunnelId: created.tunnelId,
      tunnelToken: created.tunnelToken,
      publicToken: created.publicToken,
      expiresAt: created.expiresAt,
      ws: null,
      localPort,
      pendingHttp: new Map(),
      heartbeat: null,
      state: "connecting",
      errorMessage: null,
    };
    tunnels.set(threadId, tunnel);

    await attachControlMessages(tunnel);
    return tunnelStatus(tunnel);
  } catch (error) {
    if (created?.tunnelId) {
      tunnels.delete(threadId);
      void previewApiRequest(`/v1/tunnels/${encodeURIComponent(created.tunnelId)}`, {
        method: "DELETE",
      }).catch(() => undefined);
    }
    throw classifyTunnelError(error);
  }
}

export function getTunnelPreviewStatus(threadId: string): TunnelPreviewStatus | null {
  const tunnel = tunnels.get(threadId);
  return tunnel ? tunnelStatus(tunnel) : null;
}

export async function stopTunnelPreview(threadId: string): Promise<void> {
  const tunnel = tunnels.get(threadId);
  if (!tunnel) return;
  tunnels.delete(threadId);
  if (tunnel.heartbeat) clearInterval(tunnel.heartbeat);
  closeStream(tunnel.ws);
  for (const request of tunnel.pendingHttp.values()) {
    request.destroy();
  }
  tunnel.pendingHttp.clear();
  await previewApiRequest(`/v1/tunnels/${encodeURIComponent(tunnel.tunnelId)}`, {
    method: "DELETE",
  }).catch(() => undefined);
}

/** Teardown used on server shutdown (mirrors donor stopAllTunnelPreviews). */
export function stopAllTunnelPreviews(): void {
  for (const threadId of [...tunnels.keys()]) {
    void stopTunnelPreview(threadId).catch(() => undefined);
  }
}
