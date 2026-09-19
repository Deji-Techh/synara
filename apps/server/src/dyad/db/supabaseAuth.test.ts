// FILE: supabaseAuth.test.ts
// Purpose: Social-auth patch/status, logs, org endpoints vs loopback fake.

import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildSocialAuthProviderPatch,
  getSupabaseFunctionLogs,
  getSupabaseOrganizationDetails,
  getSupabaseOrganizationMembers,
  listSupabaseSocialAuthProviders,
  SOCIAL_AUTH_PROVIDERS,
  updateSupabaseSocialAuthProvider,
} from "./supabaseAuth.ts";

let patched: unknown[] = [];

function handler(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = new URL(req.url ?? "", "http://x");
  const json = (code: number, body: unknown) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.headers.authorization !== "Bearer good") return json(401, {});
  if (url.pathname === "/v1/projects/ref-1/config/auth" && req.method === "GET") {
    return json(200, { external_github_enabled: true, external_github_client_id: "cid" });
  }
  if (url.pathname === "/v1/projects/ref-1/config/auth" && req.method === "PATCH") {
    let body = "";
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      try {
        patched.push(JSON.parse(body));
      } catch {
        // ignore
      }
      return json(200, {});
    });
    return;
  }
  if (url.pathname === "/v1/projects/ref-1/analytics/endpoints/logs.all") {
    return json(200, {
      result: [{ timestamp: "2026-01-01T00:00:00Z", event_message: "[fn] ok", metadata: {} }],
    });
  }
  if (url.pathname === "/v1/organizations/org-1") {
    return json(200, { id: "org-1", name: "Org", slug: "org-1" });
  }
  if (url.pathname === "/v1/organizations/org-1/members") {
    return json(200, [{ user_id: "u1", email: "a@b.c", role: "Owner" }]);
  }
  return json(404, {});
}

let server: http.Server;
let base = "";

describe("supabase auth management", () => {
  beforeAll(async () => {
    server = http.createServer(handler);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((r) => server.close(r));
  });

  it("covers 8 providers with status", async () => {
    expect(SOCIAL_AUTH_PROVIDERS).toHaveLength(8);
    const statuses = await listSupabaseSocialAuthProviders({
      token: "good",
      projectRef: "ref-1",
      baseUrl: base,
    });
    expect(statuses).toHaveLength(8);
    const github = statuses.find((s) => s.id === "github");
    expect(github).toMatchObject({
      enabled: true,
      configured: true,
      callbackUrl: "https://ref-1.supabase.co/auth/v1/callback",
    });
  });

  it("builds enable/disable patches", () => {
    expect(
      buildSocialAuthProviderPatch({
        provider: "google",
        enabled: true,
        clientId: "c",
        clientSecret: "s",
      }),
    ).toEqual({
      external_google_enabled: true,
      external_google_client_id: "c",
      external_google_secret: "s",
    });
    expect(buildSocialAuthProviderPatch({ provider: "google", enabled: false })).toEqual({
      external_google_enabled: false,
    });
  });

  it("patches then re-reads a provider", async () => {
    patched = [];
    const status = await updateSupabaseSocialAuthProvider({
      token: "good",
      projectRef: "ref-1",
      provider: "github",
      enabled: true,
      baseUrl: base,
    });
    expect(patched).toHaveLength(1);
    expect(status.id).toBe("github");
  });

  it("rejects unknown providers", async () => {
    await expect(
      updateSupabaseSocialAuthProvider({
        token: "good",
        projectRef: "ref-1",
        provider: "unknown" as never,
        enabled: true,
        baseUrl: base,
      }),
    ).rejects.toThrow(/Unsupported/);
  });

  it("reads function logs and org data", async () => {
    const logs = await getSupabaseFunctionLogs({
      token: "good",
      projectRef: "ref-1",
      baseUrl: base,
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.eventMessage).toBe("[fn] ok");
    expect(
      await getSupabaseOrganizationDetails({
        token: "good",
        organizationSlug: "org-1",
        baseUrl: base,
      }),
    ).toMatchObject({
      name: "Org",
    });
    expect(
      await getSupabaseOrganizationMembers({
        token: "good",
        organizationSlug: "org-1",
        baseUrl: base,
      }),
    ).toEqual([{ userId: "u1", email: "a@b.c", role: "Owner", username: undefined }]);
  });
});
