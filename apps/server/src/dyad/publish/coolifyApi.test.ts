// FILE: coolifyApi.test.ts
// Purpose: Phase 4c gate — Coolify REST against a loopback fake: probe,
// discover, project create, deploy trigger, application status.

import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CoolifyApiError,
  createCoolifyProject,
  getCoolifyApplication,
  listCoolifyProjects,
  listCoolifyServers,
  probeCoolifyInstance,
  triggerCoolifyDeploy,
} from "./coolifyApi.ts";
import { coolifyConnectTool, coolifyStatusTool } from "./coolifyTools.ts";

function handler(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = new URL(req.url ?? "", "http://x");
  const key = req.headers.authorization;
  const json = (code: number, body: unknown) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (key !== "Bearer good") return json(401, { message: "Unauthenticated" });
  if (url.pathname === "/api/v1/version") return json(200, { version: "4.0.0" });
  if (url.pathname === "/api/v1/servers") return json(200, [{ uuid: "s1", name: "hetzner", ip: "1.2.3.4" }]);
  if (url.pathname === "/api/v1/projects" && req.method !== "POST") {
    return json(200, [{ uuid: "p1", name: "shop" }]);
  }
  if (url.pathname === "/api/v1/projects" && req.method === "POST") {
    return json(201, { uuid: "p9", name: "newshop" });
  }
  if (url.pathname === "/api/v1/deploy" && req.method === "POST") {
    return json(200, {});
  }
  if (url.pathname === "/api/v1/applications/a1") {
    return json(200, { uuid: "a1", name: "web", status: "running", fqdn: "shop.example.com" });
  }
  return json(404, { message: "nope" });
}

let server: http.Server;
const calls: string[] = [];
let base = "";
beforeAll(async () => {
  const wrapped = http.createServer((req, res) => {
    calls.push(`${req.method} ${new URL(req.url ?? "", "http://x").pathname}`);
    handler(req, res);
  });
  server = wrapped;
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
});

const conn = { instanceUrl: "", token: "good" };
function toolCtx(appPath: string) {
  return { signal: AbortSignal.timeout(5000), appPath, sessionId: "s-cool", toolId: "t-c" };
}

describe("coolify publish (phase 4c)", () => {
  it("probes, discovers, creates, deploys, and reads status", async () => {
    const c = { ...conn, instanceUrl: base };
    expect(await probeCoolifyInstance(c)).toEqual({ version: "4.0.0" });
    expect(await listCoolifyServers(c)).toEqual([{ uuid: "s1", name: "hetzner", ip: "1.2.3.4" }]);
    expect(await listCoolifyProjects(c)).toEqual([{ uuid: "p1", name: "shop" }]);
    expect(await createCoolifyProject({ ...c, name: "newshop" })).toMatchObject({ uuid: "p9" });
    expect(await triggerCoolifyDeploy({ ...c, applicationUuid: "a1" })).toEqual({ queued: true });
    expect(await getCoolifyApplication({ ...c, applicationUuid: "a1" })).toMatchObject({
      status: "running",
      fqdn: "shop.example.com",
    });
    expect(calls).toContain("POST /api/v1/deploy");
    await expect(probeCoolifyInstance({ instanceUrl: base, token: "bad" })).rejects.toThrow(/401/);
    await expect(probeCoolifyInstance({ instanceUrl: "  ", token: "good" })).rejects.toThrow(/URL is required/);
    await expect(triggerCoolifyDeploy({ ...c, applicationUuid: "  " })).rejects.toThrow(/uuid is required/);
  });

  it("connect persists the instance link without the token", async () => {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { readFileSync } = await import("node:fs");
    const dir = mkdtempSync(join(tmpdir(), "caide-cool-"));
    // Tool resolves token via settings/env; stub fetch for the fake host only.
    const realFetch = globalThis.fetch;
    const { vi } = await import("vitest");
    vi.stubGlobal(
      "fetch",
      async (url: unknown, init?: { method?: string }) => {
        const u = String(url);
        if (!u.startsWith(base)) return realFetch(url as string, init as RequestInit);
        const path = u.slice(base.length);
        const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
        if (path === "/api/v1/version") return json({ version: "4.0.0" });
        if (path === "/api/v1/projects" && (init?.method ?? "GET") === "POST") return json({ uuid: "p9", name: "n" });
        throw new Error(`unexpected ${u}`);
      },
    );
    const saved = process.env.COOLIFY_TOKEN;
    process.env.COOLIFY_TOKEN = "good";
    // Point resolution at the loopback fake by passing it as instance URL.
    const { coolifyConnectTool: connect } = await import("./coolifyTools.ts");
    try {
      const out = (await connect.execute({ instanceUrl: base }, toolCtx(dir))) as string;
      expect(out).toContain("Coolify connected");
      const { readPublishLinks } = await import("./publishStore.ts");
      expect(readPublishLinks(dir).coolify?.instanceUrl).toBe(base);
      const disk = readFileSync(join(dir, ".caide", "publish.json"), "utf8");
      expect(disk).not.toContain("good");
      const status = (await coolifyStatusTool.execute({}, toolCtx(dir))) as string;
      expect(status).toContain(base);
    } finally {
      if (saved === undefined) delete process.env.COOLIFY_TOKEN;
      else process.env.COOLIFY_TOKEN = saved;
      vi.unstubAllGlobals();
    }
  });

  it("presents countable calls", () => {
    expect(coolifyConnectTool.presentCall?.({})).toBe("Connect Coolify instance");
    expect(coolifyStatusTool.presentCall?.({})).toBe("Coolify status");
  });
});
