// FILE: providerApis.test.ts
// Purpose: C8 gate — Neon/Supabase REST clients against loopback fakes,
// migration writer naming + output.

import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi, afterEach } from "vitest";
import { listNeonBranches, listNeonProjects, createNeonBranch, createNeonProject, deleteNeonBranch, deleteNeonProject } from "./neonApi.ts";
import {
  createSupabaseProject,
  createSupabaseTestUser,
  deleteSupabaseTestUser,
  deploySupabaseFunction,
  getSupabaseProjectApiKeys,
  listSupabaseOrganizations,
  listSupabaseProjects,
} from "./supabaseApi.ts";
import { slugifyMigrationName, writeMigrationFile } from "./migrations.ts";

function handler(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = new URL(req.url ?? "", "http://x");
  const key = req.headers.authorization;
  const json = (code: number, body: unknown) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (key !== "Bearer good") return json(401, { message: "unauthorized" });
  if (url.pathname === "/api/v2/projects") {
    if (req.method === "POST") return json(201, { project: { id: "p9", name: "NewProj" } });
    return json(200, { projects: [{ id: "p1", name: "Shop" }] });
  }
  if (url.pathname === "/api/v2/projects/p1/branches") {
    if (req.method === "POST") {
      return json(200, {
        branch: { id: "b2", name: "caide-dev" },
        connection_uris: [{ connection_uri: "postgresql://u:p@host/db" }],
      });
    }
    return json(200, { branches: [{ id: "b1", name: "main", primary: true }] });
  }
  if (req.method === "DELETE" && url.pathname === "/api/v2/projects/p1/branches/b2") {
    return json(200, {});
  }
  if (req.method === "DELETE" && url.pathname === "/api/v2/projects/p9") {
    return json(200, {});
  }
  if (url.pathname === "/v1/organizations") return json(200, [{ id: "o1", name: "Acme" }]);
  if (url.pathname === "/v1/projects") {
    if (req.method === "POST") return json(201, { id: "r2", name: "NewApp" });
    return json(200, [{ id: "r1", name: "App", organization_id: "o1", region: "eu-west", status: "ACTIVE" }]);
  }
  if (url.pathname === "/v1/projects/r1/api-keys") {
    return json(200, [
      { name: "anon", api_key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anon" },
      { name: "service_role", api_key: "sk-secret-value" },
    ]);
  }
  if (url.pathname === "/v1/projects/r1/functions/deploy" && req.method === "POST") {
    return json(200, {});
  }
  return json(404, { message: "nope" });
}

let server: http.Server;
let neonBase = "";
let supabaseBase = "";
beforeAll(async () => {
  server = http.createServer(handler);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  neonBase = `http://127.0.0.1:${port}/api/v2`;
  supabaseBase = `http://127.0.0.1:${port}`;
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
});

describe("dyad provider management apis (c8)", () => {
  it("lists neon projects and branches", async () => {
    const projects = await listNeonProjects({ apiKey: "good", baseUrl: neonBase });
    expect(projects).toEqual([{ id: "p1", name: "Shop", createdAt: undefined }]);
    const branches = await listNeonBranches({ apiKey: "good", projectId: "p1", baseUrl: neonBase });
    expect(branches).toEqual([{ id: "b1", name: "main", primary: true }]);
    await expect(listNeonProjects({ apiKey: "bad", baseUrl: neonBase })).rejects.toThrow(/401/);
    await expect(listNeonProjects({ apiKey: "  " })).rejects.toThrow(/required/);
  });

  it("creates neon branches with connection uris", async () => {
    const created = await createNeonBranch({
      apiKey: "good",
      projectId: "p1",
      branchName: "caide-dev",
      baseUrl: neonBase,
    });
    expect(created).toMatchObject({ id: "b2", name: "caide-dev" });
    expect(created.connectionUri).toContain("postgresql://");
    await expect(
      createNeonBranch({ apiKey: "good", projectId: "p1", branchName: "  ", baseUrl: neonBase }),
    ).rejects.toThrow(/required/);
  });

  it("creates supabase projects, reveals keys, and deploys functions", async () => {
    const created = await createSupabaseProject({
      token: "good",
      name: "NewApp",
      organizationId: "o1",
      baseUrl: supabaseBase,
    });
    expect(created).toEqual({ id: "r2", name: "NewApp" });
    await expect(
      createSupabaseProject({ token: "good", name: "  ", organizationId: "o1", baseUrl: supabaseBase }),
    ).rejects.toThrow(/required/);

    const keys = await getSupabaseProjectApiKeys({ token: "good", projectId: "r1", reveal: true, baseUrl: supabaseBase });
    expect(keys).toHaveLength(2);
    expect(keys.find((k) => k.name === "service_role")?.apiKey).toBe("sk-secret-value");

    await expect(
      deploySupabaseFunction({ token: "good", projectId: "r1", slug: "hello", bundleB64: "e30=", baseUrl: supabaseBase }),
    ).resolves.toBeUndefined();
    await expect(
      deploySupabaseFunction({ token: "bad", projectId: "r1", slug: "hello", bundleB64: "e30=", baseUrl: supabaseBase }),
    ).rejects.toThrow(/401/);
  });

  it("creates and deletes supabase test users without leaking the secret", async () => {
    const seen: string[] = [];
    const stub = vi.fn(async (url: unknown, init?: { method?: string; body?: string }) => {
      const u = String(url);
      if (!u.includes("/auth/v1/admin/users")) throw new Error(`unexpected ${u}`);
      if ((init?.method ?? "GET") === "POST") {
        const body = JSON.parse(init?.body ?? "{}");
        expect(body.email).toMatch(/dyad-test-.*@dyad.test/);
        expect(body.email_confirm).toBe(true);
        return { ok: true, json: async () => ({ id: "u-1", email: body.email }) } as Response;
      }
      seen.push(u);
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
    vi.stubGlobal("fetch", stub);
    try {
      const user = await createSupabaseTestUser({ projectRef: "r1", secretKey: "sk-secret-value" });
      expect(user).toMatchObject({ id: "u-1" });
      expect(user.email).toMatch(/@dyad.test$/);
      await expect(
        deleteSupabaseTestUser({ projectRef: "r1", secretKey: "sk-secret-value", userId: "u-1" }),
      ).resolves.toBeUndefined();
      expect(seen[0]).toContain("/auth/v1/admin/users/u-1");
      // Secret travels in headers only — never in URLs or results.
      for (const call of stub.mock.calls) {
        expect(String(call[0])).not.toContain("sk-secret-value");
      }
      expect(JSON.stringify(user)).not.toContain("sk-secret-value");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("creates and deletes neon projects and branches", async () => {
    const project = await createNeonProject({ apiKey: "good", name: "NewProj", baseUrl: neonBase });
    expect(project).toEqual({ id: "p9", name: "NewProj" });
    await expect(
      createNeonProject({ apiKey: "good", name: "  ", baseUrl: neonBase }),
    ).rejects.toThrow(/required/);
    await expect(
      deleteNeonBranch({ apiKey: "good", projectId: "p1", branchId: "b2", baseUrl: neonBase }),
    ).resolves.toBeUndefined();
    await expect(
      deleteNeonProject({ apiKey: "good", projectId: "p9", baseUrl: neonBase }),
    ).resolves.toBeUndefined();
    await expect(
      deleteNeonBranch({ apiKey: "bad", projectId: "p1", branchId: "b2", baseUrl: neonBase }),
    ).rejects.toThrow(/401/);
  });

  it("lists supabase orgs and projects", async () => {
    expect(await listSupabaseOrganizations({ token: "good", baseUrl: supabaseBase })).toEqual([
      { id: "o1", name: "Acme" },
    ]);
    const projects = await listSupabaseProjects({ token: "good", baseUrl: supabaseBase });
    expect(projects[0]).toMatchObject({ id: "r1", name: "App", region: "eu-west" });
    await expect(listSupabaseProjects({ token: "bad", baseUrl: supabaseBase })).rejects.toThrow(/401/);
  });

  it("writes migration files with timestamped slugs", async () => {
    expect(slugifyMigrationName("Add Todos!")).toMatch(/^\d{14}_add_todos\.sql$/);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-mig-"));
    const rel = await writeMigrationFile(dir, "create todos", "create table todos (id int);");
    expect(rel).toMatch(/^supabase\/migrations\/\d{14}_create_todos\.sql$/);
    expect(fs.readFileSync(path.join(dir, rel!), "utf8")).toBe("create table todos (id int);\n");
  });
});
