// FILE: mcpOAuth.ts
// Purpose: MCP OAuth 2.1 flow for http-transport servers (Phase 5):
// RFC8414 discovery, dynamic client registration, PKCE, loopback callback,
// code exchange, refresh, and encrypted-at-rest token storage in the
// oauth_state column. Dependency-free (fetch + node:http + node:crypto).

import * as crypto from "node:crypto";
import * as http from "node:http";
import { openDyadDb } from "../db/schema.ts";

export class McpOAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpOAuthError";
  }
}

export interface OAuthServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
}

export interface OAuthClientInfo {
  client_id: string;
  client_secret?: string;
}

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  scope?: string;
}

export interface StoredOAuthState {
  clientInfo?: OAuthClientInfo;
  tokens?: OAuthTokens;
  callbackPort?: number;
}

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 15_000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      throw new McpOAuthError(`OAuth endpoint ${res.status} on ${url.split("?")[0]}`);
    }
    return (await res.json()) as unknown;
  } catch (err) {
    if (err instanceof McpOAuthError) throw err;
    throw new McpOAuthError(
      `OAuth request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

/** RFC8414 discovery: path-inserted first, then root (donor order). */
export async function discoverOAuthMetadata(serverUrl: string): Promise<OAuthServerMetadata> {
  const base = serverUrl.replace(/\/+$/, "");
  const url = new URL(base);
  const errors: string[] = [];
  for (const candidate of [
    `${url.origin}/.well-known/oauth-authorization-server${url.pathname}`,
    `${url.origin}/.well-known/oauth-authorization-server`,
  ]) {
    try {
      const data = (await fetchJson(candidate)) as Record<string, unknown>;
      if (
        typeof data.authorization_endpoint === "string" &&
        typeof data.token_endpoint === "string"
      ) {
        return {
          issuer: typeof data.issuer === "string" ? data.issuer : url.origin,
          authorization_endpoint: data.authorization_endpoint,
          token_endpoint: data.token_endpoint,
          registration_endpoint:
            typeof data.registration_endpoint === "string" ? data.registration_endpoint : undefined,
          scopes_supported: Array.isArray(data.scopes_supported)
            ? (data.scopes_supported as string[])
            : undefined,
        };
      }
      errors.push(`${candidate}: missing endpoints`);
    } catch (err) {
      errors.push(`${candidate}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new McpOAuthError(`OAuth discovery failed: ${errors.join("; ")}`);
}

/** Dynamic client registration (RFC7591). Skipped when clientId is preset. */
export async function registerOAuthClient(
  metadata: OAuthServerMetadata,
  redirectUris: string[],
): Promise<OAuthClientInfo> {
  if (!metadata.registration_endpoint) {
    throw new McpOAuthError(
      "Server does not support dynamic client registration — configure a client id manually.",
    );
  }
  const data = (await fetchJson(metadata.registration_endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      token_endpoint_auth_method: "none",
      client_name: "Caide",
    }),
  })) as { client_id?: string; client_secret?: string };
  if (!data.client_id) throw new McpOAuthError("Registration returned no client_id.");
  return {
    client_id: data.client_id,
    ...(data.client_secret ? { client_secret: data.client_secret } : {}),
  };
}

export function newCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function codeChallengeS256(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function newOAuthState(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function buildAuthorizeUrl(input: {
  metadata: OAuthServerMetadata;
  clientId: string;
  redirectUri: string;
  scope?: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(input.metadata.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", input.state);
  if (input.scope?.trim()) url.searchParams.set("scope", input.scope.trim());
  return url.toString();
}

/** Loopback listener on 127.0.0.1 — resolves the first ?code=&state= hit.
 * Pass port 0 for an ephemeral port; the bound URL is returned. */
export async function listenOAuthCallback(
  port: number,
  expectedState: string,
  timeoutMs = 120_000,
): Promise<{ url: string; wait: Promise<{ code: string }> }> {
  let server: http.Server | null = null;
  let resolveWait!: (value: { code: string }) => void;
  let rejectWait!: (err: Error) => void;
  const wait = new Promise<{ code: string }>((resolve, reject) => {
    resolveWait = resolve;
    rejectWait = reject;
  });
  const timer = setTimeout(() => {
    try {
      server?.close();
    } catch {
      // already closed
    }
    rejectWait(
      new McpOAuthError("OAuth callback timed out — complete the browser step within 2 minutes."),
    );
  }, timeoutMs);
  server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url ?? "", "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("Not found");
        return;
      }
      const code = url.searchParams.get("code") ?? "";
      const state = url.searchParams.get("state") ?? "";
      if (!code || state !== expectedState) {
        res.writeHead(400, { "content-type": "text/plain" });
        res.end("Invalid code or state");
        return;
      }
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html><body><h1>Caide connected — you can close this tab.</h1></body></html>");
      clearTimeout(timer);
      resolveWait({ code });
      setTimeout(() => {
        try {
          server?.close();
        } catch {
          // already closed
        }
      }, 500);
    } catch {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("Bad request");
    }
  });
  await new Promise<void>((resolve, reject) => {
    server!.listen(port, "127.0.0.1", () => resolve());
    server!.once("error", reject);
  });
  const address = server.address();
  const boundPort = typeof address === "object" && address ? address.port : port;
  return { url: `http://127.0.0.1:${boundPort}/callback`, wait };
}

export async function exchangeOAuthCode(input: {
  metadata: OAuthServerMetadata;
  client: OAuthClientInfo;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: input.client.client_id,
    code_verifier: input.codeVerifier,
  });
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (input.client.client_secret) {
    headers.authorization = `Basic ${Buffer.from(`${input.client.client_id}:${input.client.client_secret}`).toString("base64")}`;
  }
  const data = (await fetchJson(input.metadata.token_endpoint, {
    method: "POST",
    headers,
    body: body.toString(),
  })) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!data.access_token) throw new McpOAuthError("Token exchange returned no access_token.");
  return {
    access_token: data.access_token,
    ...(data.refresh_token ? { refresh_token: data.refresh_token } : {}),
    ...(typeof data.expires_in === "number"
      ? { expires_at: Date.now() + data.expires_in * 1000 }
      : {}),
    ...(data.scope ? { scope: data.scope } : {}),
  };
}

export async function refreshOAuthTokens(input: {
  metadata: OAuthServerMetadata;
  client: OAuthClientInfo;
  refreshToken: string;
}): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
    client_id: input.client.client_id,
  });
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (input.client.client_secret) {
    headers.authorization = `Basic ${Buffer.from(`${input.client.client_id}:${input.client.client_secret}`).toString("base64")}`;
  }
  const data = (await fetchJson(input.metadata.token_endpoint, {
    method: "POST",
    headers,
    body: body.toString(),
  })) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!data.access_token) throw new McpOAuthError("Token refresh returned no access_token.");
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? input.refreshToken,
    ...(typeof data.expires_in === "number"
      ? { expires_at: Date.now() + data.expires_in * 1000 }
      : {}),
    ...(data.scope ? { scope: data.scope } : {}),
  };
}

// --- oauth_state persistence (dyad.db mcp_servers.oauth_state) ---

function readOAuthStateRow(serverId: string): StoredOAuthState | null {
  const db = openDyadDb();
  try {
    const row = db.prepare("SELECT oauth_state FROM mcp_servers WHERE id = ?").get(serverId) as {
      oauth_state?: string | null;
    } | null;
    if (!row?.oauth_state) return null;
    try {
      return JSON.parse(row.oauth_state) as StoredOAuthState;
    } catch {
      return null;
    }
  } finally {
    db.close();
  }
}

export function loadMcpOAuthState(serverId: string): StoredOAuthState | null {
  try {
    return readOAuthStateRow(serverId);
  } catch {
    return null;
  }
}

export function saveMcpOAuthState(serverId: string, state: StoredOAuthState): void {
  const db = openDyadDb();
  try {
    db.prepare("UPDATE mcp_servers SET oauth_state = ? WHERE id = ?").run(
      JSON.stringify(state),
      serverId,
    );
  } finally {
    db.close();
  }
}

export function clearMcpOAuthState(serverId: string): void {
  const db = openDyadDb();
  try {
    db.prepare("UPDATE mcp_servers SET oauth_state = NULL WHERE id = ?").run(serverId);
  } finally {
    db.close();
  }
}

/** Stored access token if present and unexpired (60s skew). */
export function getStoredOAuthAccessToken(serverId: string, nowMs = Date.now()): string | null {
  const state = loadMcpOAuthState(serverId);
  const access = state?.tokens?.access_token;
  if (!access) return null;
  const expires = state?.tokens?.expires_at;
  if (typeof expires === "number" && expires <= nowMs + 60_000) return null;
  return access;
}

export interface BegunOAuthFlow {
  authorizeUrl: string;
  redirectUri: string;
  metadata: OAuthServerMetadata;
  client: OAuthClientInfo;
  verifier: string;
  waitForCallback: Promise<{ code: string }>;
}

/**
 * Begin an OAuth flow: discover metadata, bind the loopback listener (so
 * ephemeral ports resolve first), register the client against the real
 * redirect (or use the preset id), persist client state, and build the
 * authorize URL. The caller delivers authorizeUrl to the browser, awaits
 * waitForCallback, then calls completeMcpOAuthFlow.
 */
export async function beginMcpOAuthFlow(input: {
  serverId: string;
  serverUrl: string;
  clientId?: string;
  clientSecret?: string;
  scope?: string;
  callbackPort?: number;
  authorizeUrlOverride?: string;
}): Promise<BegunOAuthFlow> {
  const metadata = await discoverOAuthMetadata(input.serverUrl);
  if (input.authorizeUrlOverride?.trim()) {
    metadata.authorization_endpoint = input.authorizeUrlOverride.trim();
  }
  const verifier = newCodeVerifier();
  const state = newOAuthState();
  const listener = await listenOAuthCallback(input.callbackPort ?? 0, state);
  let client: OAuthClientInfo;
  if (input.clientId?.trim()) {
    client = {
      client_id: input.clientId.trim(),
      ...(input.clientSecret?.trim() ? { client_secret: input.clientSecret.trim() } : {}),
    };
  } else {
    client = await registerOAuthClient(metadata, [listener.url]);
  }
  const previous = loadMcpOAuthState(input.serverId) ?? {};
  saveMcpOAuthState(input.serverId, { ...previous, clientInfo: client });
  return {
    authorizeUrl: buildAuthorizeUrl({
      metadata,
      clientId: client.client_id,
      redirectUri: listener.url,
      scope: input.scope,
      state,
      codeChallenge: codeChallengeS256(verifier),
    }),
    redirectUri: listener.url,
    metadata,
    client,
    verifier,
    waitForCallback: listener.wait,
  };
}

/** Exchange the callback code and persist tokens. */
export async function completeMcpOAuthFlow(input: {
  serverId: string;
  metadata: OAuthServerMetadata;
  client: OAuthClientInfo;
  code: string;
  redirectUri: string;
  verifier: string;
}): Promise<OAuthTokens> {
  const tokens = await exchangeOAuthCode({
    metadata: input.metadata,
    client: input.client,
    code: input.code,
    redirectUri: input.redirectUri,
    codeVerifier: input.verifier,
  });
  saveMcpOAuthState(input.serverId, { clientInfo: input.client, tokens });
  return tokens;
}
