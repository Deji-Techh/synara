/**
 * Live reverse-tunnel relay for worldwide mobile previews.
 *
 * The desktop holds open one authenticated "control" WebSocket per tunnel
 * (`/v1/tunnels/ws?token=<tunnelToken>`). Inbound public HTTP traffic on
 * `/t/<publicToken>/...` is multiplexed over that connection as JSON frames,
 * and public WebSocket upgrades get a dedicated outbound secondary WebSocket
 * (`/v1/tunnels/ws/<tunnelId>/<streamId>`) that the desktop bridges back to
 * the localhost proxy. This is a pass-through relay: the control plane never
 * sees app code, only bytes flowing between the viewer and the developer's
 * machine.
 */
import crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse, Server } from "node:http";
import type { Duplex } from "node:stream";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { Pool } from "pg";
import { WebSocket, WebSocketServer, type RawData } from "ws";

const hash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");
const token = () => crypto.randomBytes(32).toString("base64url");

const TUNNEL_LIFETIME_SECONDS = 2 * 60 * 60;
const HEARTBEAT_MS = 30_000;
const OFFLINE_AFTER_MS = 90_000;
const REQUEST_TIMEOUT_MS = 45_000;
const WS_FRAME_CHUNK_BYTES = 256 * 1024;

type RelayClient = {
  ws: WebSocket;
  lastSeenAt: number;
};

const relays = new Map<string, RelayClient>();

type PendingHttp = {
  res: ServerResponse;
  headSent: boolean;
};
const pendingHttp = new Map<string, PendingHttp>();

type PendingWs = {
  public: WebSocket;
};
const pendingWs = new Map<string, PendingWs>();

/* ------------------------------------------------------------------------ */
/*  Management API (device token auth, mirroring the session endpoints)     */
/* ------------------------------------------------------------------------ */

async function installation(pool: Pool, req: express.Request) {
  const header = req.header("authorization") ?? "";
  const access = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!access) return null;
  const result = await pool.query(
    `SELECT id,plan,max_concurrent_sessions,daily_session_limit
       FROM preview_installations
      WHERE access_token_hash=$1 AND disabled_at IS NULL`,
    [hash(access)],
  );
  if (!result.rows[0]) return null;
  await pool.query(
    `UPDATE preview_installations SET last_seen_at=now() WHERE id=$1`,
    [result.rows[0].id],
  );
  return result.rows[0] as {
    id: string;
    plan: string;
    max_concurrent_sessions: number;
    daily_session_limit: number;
  };
}

function tunnelRow(row: Record<string, unknown>) {
  const stoppedAt = row.stopped_at as string | null;
  return {
    tunnelId: row.id,
    appId: row.app_id,
    status: row.status,
    expiresAt: row.expires_at,
    stoppedAt,
    lastSeenAt: row.last_seen_at,
  };
}

const PREVIEW_COOKIE_NAME = "caide_preview_tunnel";

/**
 * HttpOnly, same-site-pinned cookie persisted across (sub)path navigations so
 * the root-path fallback can route a viewer to their exact tunnel even while
 * another developer's preview is also online.
 */
function makePreviewCookie(tunnelId: string): string {
  return `${PREVIEW_COOKIE_NAME}=${encodeURIComponent(tunnelId)}; Path=/; HttpOnly; SameSite=Lax`;
}

function previewCookieTunnelId(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(
    new RegExp(`(?:^|;)\\s*${PREVIEW_COOKIE_NAME}=([^;]+)`),
  );
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export function installTunnelRoutes(app: Express, pool: Pool): void {
  /* Public ingress must run before the JSON body parser so the request stream
     stays untouched for streaming to the desktop. */
  const ingress = express.Router();
  ingress.all("/:token/*", (req, res) => {
    void handlePublicHttp(pool, req, res);
  });
  ingress.all("/:token", (req, res) => {
    void handlePublicHttp(pool, req, res);
  });
  app.use("/t", ingress);
  const json = express.json({ limit: "1mb" });

  app.post("/v1/tunnels", json, async (req, res) => {
    const user = await installation(pool, req);
    if (!user) {
      res
        .status(401)
        .json({ error: "CAIDE installation authentication required" });
      return;
    }
    const appId = Number(req.body?.appId);
    if (!Number.isInteger(appId) || appId <= 0) {
      res.status(400).json({ error: "appId must be a positive integer" });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const active = await client.query(
        `SELECT count(*)::int AS count FROM preview_tunnels
          WHERE installation_id=$1 AND status='online'`,
        [user.id],
      );
      if (active.rows[0].count >= user.max_concurrent_sessions) {
        await client.query("ROLLBACK");
        res.status(429).json({ error: "Concurrent preview limit reached" });
        return;
      }
      const daily = await client.query(
        `SELECT count(*)::int AS count FROM preview_tunnels
          WHERE installation_id=$1 AND created_at > now() - interval '24 hours'`,
        [user.id],
      );
      if (daily.rows[0].count >= user.daily_session_limit) {
        await client.query("ROLLBACK");
        res.status(429).json({ error: "Daily preview limit reached" });
        return;
      }
      const tunnelToken = token();
      const publicToken = token();
      const result = await client.query(
        `INSERT INTO preview_tunnels(
           id, installation_id, app_id, tunnel_token_hash, public_token_hash,
           status, expires_at
         ) VALUES($1,$2,$3,$4,$5,'offline',now()+($6 || ' seconds')::interval)
         RETURNING id,app_id,status,expires_at,stopped_at,last_seen_at`,
        [
          randomUUID(),
          user.id,
          appId,
          hash(tunnelToken),
          hash(publicToken),
          TUNNEL_LIFETIME_SECONDS,
        ],
      );
      await client.query("COMMIT");
      const row = tunnelRow(result.rows[0]);
      res.status(201).json({ ...row, tunnelToken, publicToken });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });

  app.get("/v1/tunnels/:id", async (req, res) => {
    const user = await installation(pool, req);
    if (!user) {
      res
        .status(401)
        .json({ error: "CAIDE installation authentication required" });
      return;
    }
    const result = await pool.query(
      `SELECT id,app_id,status,expires_at,stopped_at,last_seen_at
         FROM preview_tunnels WHERE id=$1 AND installation_id=$2`,
      [req.params.id, user.id],
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: "Preview tunnel not found" });
      return;
    }
    res.json(tunnelRow(result.rows[0]));
  });

  app.delete("/v1/tunnels/:id", async (req, res) => {
    const user = await installation(pool, req);
    if (!user) {
      res
        .status(401)
        .json({ error: "CAIDE installation authentication required" });
      return;
    }
    const result = await pool.query(
      `UPDATE preview_tunnels
          SET status='offline',stopped_at=now(),updated_at=now()
        WHERE id=$1 AND installation_id=$2
        RETURNING id`,
      [req.params.id, user.id],
    );
    const relay = relays.get(req.params.id);
    if (relay) {
      relay.ws.close(1000, "tunnel stopped");
      relays.delete(req.params.id);
    }
    res.status(result.rows[0] ? 204 : 404).end();
  });
}

/* ------------------------------------------------------------------------ */
/*  Public HTTP ingress                                                      */
/* ------------------------------------------------------------------------ */

async function lookupTunnel(pool: Pool, publicToken: string) {
  const result = await pool.query(
    `SELECT id,app_id,status,expires_at,stopped_at,last_seen_at
       FROM preview_tunnels WHERE public_token_hash=$1`,
    [hash(publicToken)],
  );
  return result.rows[0] ?? null;
}

function tunnelAvailable(row: Record<string, unknown>): boolean {
  return (
    row.status === "online" &&
    new Date(row.expires_at as string).getTime() > Date.now()
  );
}

function sendFrame(ws: WebSocket, obj: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function chunkify(
  ws: WebSocket,
  type: string,
  id: string,
  buffer: Buffer,
): void {
  for (let offset = 0; offset < buffer.length; offset += WS_FRAME_CHUNK_BYTES) {
    const part = buffer.subarray(offset, offset + WS_FRAME_CHUNK_BYTES);
    sendFrame(ws, { type, id, data: part.toString("base64") });
  }
}

async function handlePublicHttp(
  pool: Pool,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const tokenMatch = req.url?.match(/^\/([^/?]+)/);
  const publicToken = tokenMatch?.[1] ?? "";
  const row = await lookupTunnel(pool, publicToken);
  if (!row || !tunnelAvailable(row)) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Preview unavailable");
    return;
  }
  const tunnelId = row.id as string;
  const relay = relays.get(tunnelId);
  if (!relay || relay.ws.readyState !== WebSocket.OPEN) {
    res.writeHead(502, { "content-type": "text/plain" });
    res.end("Preview is starting. Try again in a moment.");
    return;
  }

  // The public token URL (`/t/<token>`) must not be the URL we hand the app,
  // nor stay in the browser: it would make SPA routers see `/t/<token>` as a
  // route they don't know (404 page) and would break root-absolute assets.
  // Instead: pin this tunnel in an HttpOnly cookie, then redirect to the same
  // path below `/t/<token>` (default `/`). Subsequent asset/router requests
  // carry the cookie and the root fallback routes them to this exact tunnel,
  // even when multiple developers preview simultaneously.
  const path = (req.url ?? "/").replace(/^\/[^/?]+/, "");
  const pathWithQuery = path || "/";
  res.setHeader("Set-Cookie", makePreviewCookie(tunnelId));
  res.writeHead(302, { location: pathWithQuery });
  res.end();
}

/**
 * Root-path fallback: forwards any public HTTP request to the tunnel pinned by
 * the `caide_preview_tunnel` cookie (set when a `/t/<token>` URL was visited),
 * or — failing that — to the currently online tunnel. This is what makes a dev
 * server served at the origin root (Vite's root-absolute `/@vite/client`,
 * `/src/main.tsx`, `/favicon.ico`, runtime fetches) actually load through the
 * relay, since those paths never carry the `/t/<token>/` prefix.
 */
function forwardToActiveTunnel(
  pool: Pool,
  req: IncomingMessage,
  res: ServerResponse,
): void {
  const pathname = (req.url ?? "/").split("?")[0];
  // Never swallow control-plane routes.
  if (
    pathname === "/health" ||
    pathname.startsWith("/v1/") ||
    pathname.startsWith("/t/")
  ) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Preview unavailable");
    return;
  }
  const pinned = previewCookieTunnelId(req.headers.cookie);
  if (pinned) {
    const relay = relays.get(pinned);
    if (relay && relay.ws.readyState === WebSocket.OPEN) {
      proxyForward(relay.ws, req.url ?? "/", req, res);
      return;
    }
  }
  for (const relay of relays.values()) {
    if (relay.ws.readyState === WebSocket.OPEN) {
      proxyForward(relay.ws, req.url ?? "/", req, res);
      return;
    }
  }
  res.writeHead(502, { "content-type": "text/plain" });
  res.end("Preview is starting. Try again in a moment.");
}

/**
 * Express middleware that forwards non-management paths to the active tunnel.
 * Register it AFTER the `/t` ingress and management API routes. Management
 * paths (`/health`, `/v1/*`) are passed to the next handler unchanged.
 */
export function tunnelFallbackMiddleware(
  pool: Pool,
): express.RequestHandler {
  return (req, res, next) => handleTunnelFallback(pool, req, res, next);
}

function handleTunnelFallback(
  pool: Pool,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const pathname = (req.url ?? "/").split("?")[0];
  if (pathname === "/health" || pathname.startsWith("/v1/")) {
    next();
    return;
  }
  forwardToActiveTunnel(pool, req, res);
}

function proxyForward(
  relayWs: WebSocket,
  pathWithQuery: string,
  req: IncomingMessage,
  res: ServerResponse,
): void {
  const requestId = randomUUID();
  sendFrame(relayWs, {
    type: "request",
    id: requestId,
    method: req.method ?? "GET",
    path: pathWithQuery,
    headers: req.headers,
  });

  const timeout = setTimeout(() => {
    const pending = pendingHttp.get(requestId);
    if (pending && !pending.res.writableEnded) {
      pending.res.writeHead(504, { "content-type": "text/plain" });
      pending.res.end("Preview timed out");
    }
    pendingHttp.delete(requestId);
  }, REQUEST_TIMEOUT_MS);

  pendingHttp.set(requestId, { res, headSent: false });

  req.on("data", (chunk: Buffer) => {
    const pending = pendingHttp.get(requestId);
    if (!pending || pending.res.writableEnded) return;
    chunkify(relayWs, "request-body", requestId, chunk);
  });
  req.on("end", () => {
    const pending = pendingHttp.get(requestId);
    if (!pending) return;
    clearTimeout(timeout);
    sendFrame(relayWs, { type: "request-end", id: requestId });
  });
  req.on("error", () => {
    clearTimeout(timeout);
    pendingHttp.delete(requestId);
    if (!res.writableEnded) {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end("Preview request failed");
    }
  });
  res.on("close", () => {
    clearTimeout(timeout);
    pendingHttp.delete(requestId);
  });
}

/* ------------------------------------------------------------------------ */
/*  Relay: control WS (desktop), secondary WS (desktop), public WS          */
/* ------------------------------------------------------------------------ */

function frameToBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (Array.isArray(data)) return Buffer.concat(data.map((p) => Buffer.from(p)));
  return Buffer.from(data);
}

function bridge(publicWs: WebSocket, desktopWs: WebSocket): void {
  publicWs.on("message", (data, isBinary) => {
    if (desktopWs.readyState === WebSocket.OPEN) {
      desktopWs.send(isBinary ? frameToBuffer(data) : data.toString());
    }
  });
  desktopWs.on("message", (data, isBinary) => {
    if (publicWs.readyState === WebSocket.OPEN) {
      publicWs.send(isBinary ? frameToBuffer(data) : data.toString());
    }
  });
  const closeBoth = () => {
    if (publicWs.readyState !== WebSocket.CLOSED) publicWs.close();
    if (desktopWs.readyState !== WebSocket.CLOSED) desktopWs.close();
  };
  publicWs.on("close", closeBoth);
  publicWs.on("error", closeBoth);
  desktopWs.on("close", closeBoth);
  desktopWs.on("error", closeBoth);
}

export function installTunnelRelay(
  server: Server,
  pool: Pool,
  getPublicBaseUrl: () => string,
): void {
  const publicWss = new WebSocketServer({ noServer: true });
  const controlWss = new WebSocketServer({ noServer: true });
  const dataWss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", getPublicBaseUrl());
    const pathname = url.pathname;

    if (pathname.startsWith("/t/")) {
      void handlePublicUpgrade(pool, req, socket, head, publicWss);
      return;
    }
    if (pathname === "/v1/tunnels/ws") {
      void handleControlUpgrade(pool, req, socket, head, controlWss);
      return;
    }
    const secondary = pathname.match(/^\/v1\/tunnels\/ws\/([^/]+)/);
    if (secondary) {
      void handleDataUpgrade(pool, req, socket, head, dataWss, secondary[1]);
      return;
    }
    // Any other upgrade (the SPA served at the origin root, e.g. Vite HMR)
    // is routed to the cookie-pinned tunnel like the HTTP fallback.
    void handleRootUpgrade(req, socket, head, publicWss);
  });

  /* ---- Control WS: desktop holds open a long-lived connection ---- */
  controlWss.on("connection", (ws, req) => {
    const url = new URL(req.url ?? "/", getPublicBaseUrl());
    const tunnelToken = url.searchParams.get("token") ?? "";
    void pool
      .query(
        `SELECT id,status,expires_at FROM preview_tunnels
          WHERE tunnel_token_hash=$1`,
        [hash(tunnelToken)],
      )
      .then(async (result) => {
        const row = result.rows[0];
        if (
          !row ||
          row.status === "expired" ||
          new Date(row.expires_at as string).getTime() <= Date.now()
        ) {
          ws.close(1008, "invalid or expired tunnel token");
          return;
        }
        const tunnelId = row.id as string;
        await pool.query(
          `UPDATE preview_tunnels
              SET status='online',last_seen_at=now(),updated_at=now()
            WHERE id=$1`,
          [tunnelId],
        );
        const client: RelayClient = { ws, lastSeenAt: Date.now() };
        relays.set(tunnelId, client);

        ws.on("message", (data) => {
          client.lastSeenAt = Date.now();
          void pool.query(
            `UPDATE preview_tunnels SET last_seen_at=now() WHERE id=$1`,
            [tunnelId],
          );
          let message: Record<string, unknown>;
          try {
            message = JSON.parse(data.toString()) as Record<string, unknown>;
          } catch {
            return;
          }
          switch (message.type) {
            case "pong":
              break;
            case "response-head": {
              const pending = pendingHttp.get(String(message.id));
              if (!pending) break;
              pending.res.writeHead(
                Number(message.status ?? 502),
                (message.headers ?? {}) as OutgoingHttpHeaders,
              );
              pending.headSent = true;
              break;
            }
            case "response-body": {
              const pending = pendingHttp.get(String(message.id));
              if (!pending) break;
              pending.res.write(
                Buffer.from(String(message.data ?? ""), "base64"),
              );
              break;
            }
            case "response-end": {
              const pending = pendingHttp.get(String(message.id));
              pendingHttp.delete(String(message.id));
              if (!pending) break;
              if (!pending.headSent) pending.res.writeHead(502);
              pending.res.end();
              break;
            }
            case "error": {
              const pending = pendingHttp.get(String(message.id));
              pendingHttp.delete(String(message.id));
              if (!pending) break;
              if (!pending.headSent) {
                pending.res.writeHead(502, {
                  "content-type": "text/plain",
                });
              }
              pending.res.end(String(message.message ?? "Preview error"));
              break;
            }
          }
        });

        ws.on("close", () => {
          relays.delete(tunnelId);
          void pool
            .query(
              `UPDATE preview_tunnels
                  SET status='offline',updated_at=now()
                WHERE id=$1 AND status='online'`,
              [tunnelId],
            )
            .catch(() => undefined);
        });
        ws.on("error", () => {
          relays.delete(tunnelId);
        });

        const heartbeat = setInterval(() => {
          if (Date.now() - client.lastSeenAt > OFFLINE_AFTER_MS) {
            ws.close(1001, "heartbeat timeout");
            clearInterval(heartbeat);
            return;
          }
          if (ws.readyState === WebSocket.OPEN) {
            sendFrame(ws, { type: "ping" });
          }
        }, HEARTBEAT_MS);
        ws.on("close", () => clearInterval(heartbeat));
      });
  });

  /* ---- Secondary WS: desktop dials back to bridge a public WS ---- */
  dataWss.on("connection", (ws, req) => {
    const url = new URL(req.url ?? "/", getPublicBaseUrl());
    const streamId = url.searchParams.get("stream") ?? "";
    const tunnelToken = url.searchParams.get("token") ?? "";
    const tunnelId = url.pathname.split("/")[4];
    void pool
      .query(
        `SELECT id FROM preview_tunnels
          WHERE id=$1 AND tunnel_token_hash=$2`,
        [tunnelId, hash(tunnelToken)],
      )
      .then((result) => {
        if (!result.rows[0]) {
          ws.close(1008, "invalid tunnel token");
          return;
        }
        const pending = pendingWs.get(streamId);
        if (!pending) {
          ws.close(1008, "unknown stream");
          return;
        }
        pendingWs.delete(streamId);
        bridge(pending.public, ws);
      })
      .catch(() => ws.close(1008, "invalid tunnel token"));
  });
}

async function handlePublicUpgrade(
  pool: Pool,
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  wss: WebSocketServer,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const tokenMatch = url.pathname.match(/^\/t\/([^/?]+)/);
  const publicToken = tokenMatch?.[1] ?? "";
  const row = await lookupTunnel(pool, publicToken);
  if (!row || !tunnelAvailable(row)) {
    socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
    socket.destroy();
    return;
  }
  await handlePublicUpgradeForTunnel(req, socket, head, wss, row.id as string);
}

/**
 * Completes a public WebSocket upgrade for a tunnel that is already resolved
 * (by public token, or by the preview cookie for root-path upgrades such as
 * Vite HMR). The path handed to the desktop excludes the `/t/<token>` prefix.
 */
async function handlePublicUpgradeForTunnel(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  wss: WebSocketServer,
  tunnelId: string,
): Promise<void> {
  const relay = relays.get(tunnelId);
  if (!relay || relay.ws.readyState !== WebSocket.OPEN) {
    socket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    socket.destroy();
    return;
  }
  const url = new URL(req.url ?? "/", "http://localhost");
  const streamId = randomUUID();
  wss.handleUpgrade(req, socket, head, (ws) => {
    pendingWs.set(streamId, { public: ws });
    ws.on("close", () => {
      pendingWs.delete(streamId);
    });
  });
  const path = (url.pathname + url.search).replace(/^\/t\/[^/]+/, "");
  sendFrame(relay.ws, {
    type: "ws-upgrade",
    stream: streamId,
    path: path || "/",
    headers: req.headers,
  });
}

/**
 * Root-path WebSocket upgrade (e.g. Vite HMR connects to the page origin at
 * `ws://host/`). Routes to the tunnel pinned by the preview cookie, mirroring
 * the HTTP root fallback, so SPA websockets work after the `/t/<token>`
 * redirect handed control to the origin root.
 */
async function handleRootUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  wss: WebSocketServer,
): Promise<void> {
  const pinned = previewCookieTunnelId(req.headers.cookie);
  if (pinned && relays.get(pinned)?.ws.readyState === WebSocket.OPEN) {
    await handlePublicUpgradeForTunnel(req, socket, head, wss, pinned);
    return;
  }
  for (const [id, relay] of relays.entries()) {
    if (relay.ws.readyState === WebSocket.OPEN) {
      await handlePublicUpgradeForTunnel(req, socket, head, wss, id);
      return;
    }
  }
  socket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
  socket.destroy();
}

async function handleControlUpgrade(
  pool: Pool,
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  wss: WebSocketServer,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const tunnelToken = url.searchParams.get("token") ?? "";
  const result = await pool.query(
    `SELECT id FROM preview_tunnels WHERE tunnel_token_hash=$1`,
    [hash(tunnelToken)],
  );
  if (!result.rows[0]) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
}

async function handleDataUpgrade(
  pool: Pool,
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  wss: WebSocketServer,
  tunnelId: string,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const tunnelToken = url.searchParams.get("token") ?? "";
  const result = await pool.query(
    `SELECT id FROM preview_tunnels WHERE id=$1 AND tunnel_token_hash=$2`,
    [tunnelId, hash(tunnelToken)],
  );
  if (!result.rows[0]) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
}

/* Periodic expiry / offline sweep. Mirrors the session sweep interval. */
export function startTunnelSweep(pool: Pool): void {
  setInterval(() => {
    void pool.query(
      `UPDATE preview_tunnels SET status='expired',updated_at=now()
        WHERE status='online' AND expires_at<=now()`,
    );
    void pool.query(
      `UPDATE preview_tunnels SET status='offline',updated_at=now()
        WHERE status='online' AND last_seen_at < now() - interval '90 seconds'`,
    );
  }, 30_000).unref();
}
