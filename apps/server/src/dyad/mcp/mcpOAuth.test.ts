// FILE: mcpOAuth.test.ts
// Purpose: Phase 5 gate — OAuth discovery, DCR, PKCE, authorize URL,
// code exchange, refresh, and loopback callback against a loopback fake.

import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import {
  buildAuthorizeUrl,
  codeChallengeS256,
  discoverOAuthMetadata,
  exchangeOAuthCode,
  listenOAuthCallback,
  newCodeVerifier,
  newOAuthState,
  refreshOAuthTokens,
  registerOAuthClient,
} from "./mcpOAuth.ts";

function handler(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = new URL(req.url ?? "", "http://x");
  const json = (code: number, body: unknown) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (url.pathname === "/.well-known/oauth-authorization-server" && !url.searchParams.has("x")) {
    return json(200, {
      issuer: "http://x",
      authorization_endpoint: `${base}/authorize`,
      token_endpoint: `${base}/token`,
      registration_endpoint: `${base}/register`,
    });
  }
  if (url.pathname === "/register" && req.method === "POST") {
    return json(201, { client_id: "cid-1" });
  }
  if (url.pathname === "/token" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const params = new URLSearchParams(body);
      if (params.get("grant_type") === "refresh_token") {
        return json(200, { access_token: "at-2", refresh_token: params.get("refresh_token") });
      }
      if (params.get("code") !== "code-1") return json(400, { error: "bad code" });
      return json(200, { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 });
    });
    return;
  }
  return json(404, { error: "nope" });
}

let server: http.Server;
let base = "";
import { afterAll, beforeAll } from "vitest";
beforeAll(async () => {
  server = http.createServer(handler);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
});

describe("mcp oauth flow (phase 5)", () => {
  it("discovers, registers, builds authorize urls, and exchanges codes", async () => {
    const metadata = await discoverOAuthMetadata(`${base}/mcp`);
    expect(metadata.authorization_endpoint).toBe(`${base}/authorize`);
    expect(metadata.registration_endpoint).toBe(`${base}/register`);

    const client = await registerOAuthClient(metadata, ["http://127.0.0.1:9/callback"]);
    expect(client).toEqual({ client_id: "cid-1" });

    const verifier = newCodeVerifier();
    expect(verifier.length).toBeGreaterThan(20);
    const challenge = codeChallengeS256(verifier);
    expect(challenge).not.toContain("=");
    const state = newOAuthState();
    const authorize = buildAuthorizeUrl({
      metadata,
      clientId: client.client_id,
      redirectUri: "http://127.0.0.1:9/callback",
      scope: "tools",
      state,
      codeChallenge: challenge,
    });
    expect(authorize).toContain("response_type=code");
    expect(authorize).toContain("code_challenge_method=S256");
    expect(authorize).toContain(`state=${state}`);

    const tokens = await exchangeOAuthCode({
      metadata,
      client,
      code: "code-1",
      redirectUri: "http://127.0.0.1:9/callback",
      codeVerifier: verifier,
    });
    expect(tokens).toMatchObject({ access_token: "at-1", refresh_token: "rt-1" });
    expect(tokens.expires_at).toBeGreaterThan(Date.now());

    await expect(
      exchangeOAuthCode({ metadata, client, code: "wrong", redirectUri: "http://127.0.0.1:9/callback", codeVerifier: verifier }),
    ).rejects.toThrow(/400/);

    const refreshed = await refreshOAuthTokens({ metadata, client, refreshToken: "rt-1" });
    expect(refreshed).toMatchObject({ access_token: "at-2", refresh_token: "rt-1" });
  });

  it("resolves loopback callbacks with state checking", async () => {
    const { url, wait } = await listenOAuthCallback(0, "s-1", 5000);
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
    const port = Number(new URL(url).port);
    const done = wait;
    await fetch(`http://127.0.0.1:${port}/callback?code=code-9&state=wrong`);
    const good = await fetch(`http://127.0.0.1:${port}/callback?code=code-9&state=s-1`);
    expect(good.status).toBe(200);
    await expect(done).resolves.toEqual({ code: "code-9" });
  });

  it("rejects servers without registration endpoints", async () => {
    await expect(
      registerOAuthClient(
        { issuer: base, authorization_endpoint: `${base}/authorize`, token_endpoint: `${base}/token` },
        ["http://127.0.0.1:9/callback"],
      ),
    ).rejects.toThrow(/dynamic client registration/);
  });
});
