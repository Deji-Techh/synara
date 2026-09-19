// FILE: tunnelProtocol.ts
// Purpose: Pure helpers for the reverse-tunnel wire protocol (tunnel client
// in harness/preview/tunnel.ts vs services/preview-control-plane relay).
// Donor-verbatim: dyad x caide src/ipc/utils/tunnel_protocol.ts (kept
// dependency-free so it unit-tests without a relay).

export const WS_FRAME_CHUNK_BYTES = 256 * 1024;

/** Hop-by-hop headers that must never be forwarded across the tunnel. */
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-connection",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export function wsControlUrl(apiUrl: string, token: string): string {
  return `${apiUrl.replace(/^http/, "ws")}/v1/tunnels/ws?token=${encodeURIComponent(token)}`;
}

export function wsSecondaryUrl(
  apiUrl: string,
  tunnelId: string,
  tunnelToken: string,
  streamId: string,
): string {
  return `${apiUrl.replace(/^http/, "ws")}/v1/tunnels/ws/${encodeURIComponent(tunnelId)}?token=${encodeURIComponent(tunnelToken)}&stream=${encodeURIComponent(streamId)}`;
}

type HeaderValue = string | string[];

/**
 * Filters server-provided (desktop -> relay) response headers. Drops
 * hop-by-hop headers, the host, and content-length (the relay computes its own
 * framing), keeping values that are plain strings or string arrays.
 */
export function sanitizeOriginHeaders(
  headers: Record<string, unknown>,
): Record<string, HeaderValue> {
  const clean: Record<string, HeaderValue> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower)) continue;
    if (lower === "host" || lower === "content-length") continue;
    if (typeof value === "string") {
      clean[key] = value;
    } else if (Array.isArray(value)) {
      clean[key] = value as unknown as string[];
    } else if (typeof value === "number") {
      clean[key] = String(value);
    }
  }
  return clean;
}

/**
 * Filters relay-provided (relay -> desktop) request headers before forwarding
 * to the local app. Accepts unknown value shapes (dropping anything that is not
 * a string/string array) so malformed upstream headers cannot crash a request.
 */
export function sanitizeServerHeaders(
  headers: Record<string, unknown>,
): Record<string, HeaderValue> {
  const clean: Record<string, HeaderValue> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower)) continue;
    if (lower === "host" || lower === "content-length") continue;
    if (typeof value === "string") {
      clean[key] = value;
    } else if (Array.isArray(value)) {
      clean[key] = value as unknown as string[];
    }
  }
  return clean;
}

/** Subprotocols requested by the viewer's WebSocket upgrade, if any. */
export function extractSubprotocols(headers: Record<string, unknown> | undefined): string[] {
  const raw = headers?.["sec-websocket-protocol"];
  if (typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((protocol) => protocol.trim())
    .filter(Boolean);
}

/** Splits a binary buffer into base64 frames bounded by WS_FRAME_CHUNK_BYTES. */
export function toBase64Chunks(buffer: Buffer): string[] {
  const chunks: string[] = [];
  for (let offset = 0; offset < buffer.length; offset += WS_FRAME_CHUNK_BYTES) {
    chunks.push(buffer.subarray(offset, offset + WS_FRAME_CHUNK_BYTES).toString("base64"));
  }
  return chunks;
}

export function frame(data: object): string {
  return JSON.stringify(data);
}
