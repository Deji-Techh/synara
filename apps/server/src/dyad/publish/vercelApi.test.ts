// FILE: vercelApi.test.ts
// Purpose: Phase 4b gate — Vercel PAT REST against a loopback fake: auth,
// projects, deployments, env sync. Values never logged.

import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createVercelProject,
  getVercelAuthUser,
  listVercelDeployments,
  listVercelProjects,
  syncNeonEnvToVercel,
  triggerVercelDeployment,
  VercelApiError,
} from "./vercelApi.ts";
import { vercelConnectTool, vercelDisconnectTool } from "./vercelTools.ts";

function handler(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = new URL(req.url ?? "", "http://x");
  const key = req.headers.authorization;
  const json = (code: number, body: unknown) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (key !== "Bearer good") {
    if (url.pathname === "/v2/user") return json(401, { error: { message: "Invalid token" } });
    return json(401, { error: { message: "Unauthorized" } });
  }
  if (url.pathname === "/v2/user") return json(200, { user: { id: "u1", username: "octo" } });
  if (url.pathname === "/v9/projects" && req.method !== "POST") {
    return json(200, { projects: [{ id: "prj_1", name: "shop", framework: "vite" }] });
  }
  if (url.pathname === "/v10/projects" && req.method === "POST") {
    return json(200, { id: "prj_9", name: "newshop" });
  }
  if (url.pathname === "/v6/deployments") {
    return json(200, { deployments: [{ uid: "dpl_1", url: "shop.vercel.app", state: "READY", target: "production" }] });
  }
  if (url.pathname === "/v13/deployments" && req.method === "POST") {
    return json(200, { uid: "dpl_2", url: "shop-abc.vercel.app", state: "QUEUED" });
  }
  if (url.pathname === "/v10/projects/prj_1/env" && req.method === "POST") {
    return json(200, {});
  }
  if (url.pathname === "/v9/projects/prj_1/env" && req.method !== "POST") {
    return json(200, { envs: [{ id: "env_1", key: "DATABASE_URL" }] });
  }
  if (url.pathname === "/v9/projects/prj_1/env/env_1" && req.method === "DELETE") {
    deleted.push("DATABASE_URL");
    return json(200, {});
  }
  return json(404, { error: { message: "nope" } });
}

let server: http.Server;
let base = "";
const deleted: string[] = [];
beforeAll(async () => {
  server = http.createServer(handler);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
});

function toolCtx(appPath: string) {
  return { signal: AbortSignal.timeout(5000), appPath, sessionId: "s-vercel", toolId: "t-v" };
}

describe("vercel publish (phase 4b)", () => {
  it("validates tokens, lists/creates projects and deployments", async () => {
    expect(await getVercelAuthUser({ token: "good", baseUrl: base })).toEqual({ id: "u1", username: "octo", email: undefined });
    await expect(getVercelAuthUser({ token: "bad", baseUrl: base })).rejects.toThrow(/Invalid token/);
    expect(await listVercelProjects({ token: "good", baseUrl: base })).toEqual([
      { id: "prj_1", name: "shop", framework: "vite" },
    ]);
    expect(await createVercelProject({ token: "good", name: "NewShop!", baseUrl: base })).toMatchObject({ id: "prj_9" });
    expect(await listVercelDeployments({ token: "good", projectId: "prj_1", baseUrl: base })).toEqual([
      { id: "dpl_1", url: "shop.vercel.app", state: "READY", target: "production", createdAt: undefined },
    ]);
    const dep = await triggerVercelDeployment({ token: "good", projectId: "prj_1", projectName: "shop", baseUrl: base });
    expect(dep).toMatchObject({ id: "dpl_2", state: "QUEUED" });
    await expect(
      createVercelProject({ token: "  ", name: "x", baseUrl: base }),
    ).rejects.toBeInstanceOf(VercelApiError);
  });

  it("syncs only Neon-owned env keys, never POSTGRES_URL", async () => {
    deleted.length = 0;
    const synced = await syncNeonEnvToVercel({
      token: "good",
      projectId: "prj_1",
      vars: { DATABASE_URL: "postgres://x", NEON_AUTH_BASE_URL: "https://ep.auth", IGNORABLE: "y" } as Record<string, string>,
      baseUrl: base,
    });
    expect(synced).toEqual(["DATABASE_URL", "NEON_AUTH_BASE_URL"]);
    // Existing DATABASE_URL was replaced in place (no duplicate-key 409).
    expect(deleted).toEqual(["DATABASE_URL"]);
  });

  it("connect/disconnect round-trips publish.json without secrets", async () => {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "caide-vercel-"));
    // Tool resolves PAT via settings/env; stub fetch for api.vercel.com only.
    const realFetch = globalThis.fetch;
    const stub = async (url: unknown, init?: { method?: string; body?: string }) => {
      const u = String(url);
      if (!u.startsWith("https://api.vercel.com/")) return realFetch(url as string, init as RequestInit);
      const path = u.slice("https://api.vercel.com".length);
      if (path === "/v2/user") return { ok: true, json: async () => ({ user: { id: "u1" } }) } as Response;
      if (path === "/v10/projects" && (init?.method ?? "GET") === "POST") {
        return { ok: true, json: async () => ({ id: "prj_9", name: "newshop" }) } as Response;
      }
      throw new Error(`unexpected ${u}`);
    };
    const { vi } = await import("vitest");
    vi.stubGlobal("fetch", stub);
    const saved = process.env.VERCEL_TOKEN;
    process.env.VERCEL_TOKEN = "good";
    try {
      const out = (await vercelConnectTool.execute({ name: "newshop" }, toolCtx(dir))) as string;
      expect(out).toContain("prj_9");
      const { readPublishLinks } = await import("./publishStore.ts");
      expect(readPublishLinks(dir).vercel).toMatchObject({ projectId: "prj_9" });
      expect(await vercelDisconnectTool.execute({}, toolCtx(dir))).toContain("unlinked");
      expect(readPublishLinks(dir).vercel).toBeUndefined();
    } finally {
      if (saved === undefined) delete process.env.VERCEL_TOKEN;
      else process.env.VERCEL_TOKEN = saved;
      vi.unstubAllGlobals();
    }
  });

  it("presents countable calls", () => {
    expect(vercelConnectTool.presentCall?.({})).toBe("Connect Vercel project");
    expect(vercelDisconnectTool.presentCall?.({})).toBe("Disconnect Vercel project");
  });

  it("refuses non-website frameworks with alternatives (F0)", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { vercelConnectTool: connect, vercelDeployTool: deploy } = await import("./vercelTools.ts");
    const fixture = (framework: string) => {
      const dir = mkdtempSync(join(tmpdir(), "caide-fwgate-"));
      mkdirSync(join(dir, ".caide"), { recursive: true });
      writeFileSync(join(dir, ".caide", "framework.json"), JSON.stringify({ framework }));
      return dir;
    };
    const ctxFor = (appPath: string) => ({
      signal: AbortSignal.timeout(5000),
      appPath,
      sessionId: "s-fw",
      toolId: "t-fw",
    });
    for (const [framework, hint] of [
      ["react-native", "Coolify"],
      ["flutter", "Coolify"],
      ["blank", "Blank project"],
    ] as const) {
      const dir = fixture(framework);
      await expect(connect.execute({ name: "x" }, ctxFor(dir))).rejects.toThrow(hint);
      await expect(deploy.execute({}, ctxFor(dir))).rejects.toThrow(hint);
    }
    // Website passes the gate (then fails on the missing token — no network).
    const web = fixture("website");
    await expect(connect.execute({ name: "x" }, ctxFor(web))).rejects.toThrow(/Vercel token missing/);
    // Unknown framework is not blocked (detection is best-effort).
    const unknown = mkdtempSync(join(tmpdir(), "caide-fwgate-"));
    await expect(connect.execute({ name: "x" }, ctxFor(unknown))).rejects.toThrow(/Vercel token missing/);
  });
});
