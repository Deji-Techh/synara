// FILE: providerApis.test.ts
// Purpose: C8 gate — Neon/Supabase REST clients against loopback fakes,
// migration writer naming + output.

import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listNeonBranches, listNeonProjects } from "./neonApi.ts";
import { listSupabaseOrganizations, listSupabaseProjects } from "./supabaseApi.ts";
import { slugifyMigrationName, writeMigrationFile } from "./migrations.ts";

function handler(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = new URL(req.url ?? "", "http://x");
  const key = req.headers.authorization;
  const json = (code: number, body: unknown) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (key !== "Bearer good") return json(401, { message: "unauthorized" });
  if (url.pathname === "/api/v2/projects") return json(200, { projects: [{ id: "p1", name: "Shop" }] });
  if (url.pathname === "/api/v2/projects/p1/branches") {
    return json(200, { branches: [{ id: "b1", name: "main", primary: true }] });
  }
  if (url.pathname === "/v1/organizations") return json(200, [{ id: "o1", name: "Acme" }]);
  if (url.pathname === "/v1/projects") {
    return json(200, [{ id: "r1", name: "App", organization_id: "o1", region: "eu-west", status: "ACTIVE" }]);
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
