// FILE: wsRpc.database.test.ts
// Purpose: database.invoke real bridge — list-apps from workspace + db-link,
// Neon/Supabase list/link/create channels, human errors without keys.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeWsDatabaseHandlers } from "./wsRpc.ts";
import { clearAppLinkCache } from "./dyad/db/connections.ts";

function appDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-dbpane-"));
  fs.mkdirSync(path.join(dir, ".caide"), { recursive: true });
  return dir;
}

const handlers = makeWsDatabaseHandlers({}, {}) as Record<
  string,
  (input: unknown) => Effect.Effect<unknown, unknown, never>
>;

async function invoke(threadId: string, channel: string, payload: unknown = {}) {
  const result = (await Effect.runPromise(
    handlers["database.invoke"]({ threadId, channel, payload }) as Effect.Effect<{
      value: unknown;
    }>,
  )) as { value: unknown };
  expect(result).toHaveProperty("value");
  return result.value;
}

async function invokeError(
  threadId: string,
  channel: string,
  payload: unknown = {},
): Promise<string> {
  const exit = await Effect.runPromiseExit(
    handlers["database.invoke"]({ threadId, channel, payload }) as Effect.Effect<unknown>,
  );
  if (exit._tag === "Success") throw new Error(`expected failure, got success`);
  // Cause stringifies with the original error embedded.
  return String((exit as { cause?: unknown }).cause);
}

describe("database.invoke bridge (pane backend)", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    clearAppLinkCache();
    for (const k of ["NEON_API_KEY", "SUPABASE_ACCESS_TOKEN"]) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    vi.unstubAllGlobals();
  });

  it("list-apps resolves the workspace app with link state, empty without workspace", async () => {
    const dir = appDir();
    fs.writeFileSync(
      path.join(dir, ".caide", "db-link.json"),
      JSON.stringify({ provider: "neon", projectId: "p1", branchId: "b1" }),
    );
    const out = (await invoke("s-1", "list-apps", { workspaceRoot: dir })) as {
      apps: Array<{
        name: string;
        neonProjectId: string | null;
        neonActiveBranchId: string | null;
      }>;
    };
    expect(out.apps).toHaveLength(1);
    expect(out.apps[0].neonProjectId).toBe("p1");
    expect(out.apps[0].neonActiveBranchId).toBe("b1");
    expect(out.apps[0].name).toBe(path.basename(dir));

    const empty = (await invoke("s-2", "list-apps", {})) as { apps: unknown[] };
    expect(empty.apps).toEqual([]);
  });

  it("link/unlink/branch channels mutate db-link.json without tokens", async () => {
    const dir = appDir();
    await invoke("s-1", "neon:set-app-project", { workspaceRoot: dir, appId: 1, projectId: "p9" });
    let disk = JSON.parse(fs.readFileSync(path.join(dir, ".caide", "db-link.json"), "utf8"));
    expect(disk).toMatchObject({ provider: "neon", projectId: "p9" });
    expect(JSON.stringify(disk)).not.toContain("managementToken");

    await invoke("s-1", "neon:set-active-branch", { workspaceRoot: dir, appId: 1, branchId: "b9" });
    disk = JSON.parse(fs.readFileSync(path.join(dir, ".caide", "db-link.json"), "utf8"));
    expect(disk.branchId).toBe("b9");

    await invoke("s-1", "neon:unset-app-project", { workspaceRoot: dir, appId: 1 });
    disk = JSON.parse(fs.readFileSync(path.join(dir, ".caide", "db-link.json"), "utf8"));
    expect(disk.projectId).toBeUndefined();
    expect(disk.branchId).toBeUndefined();

    await invoke("s-1", "supabase:set-app-project", {
      workspaceRoot: dir,
      appId: 1,
      projectId: "r1",
      organizationSlug: "o1",
    });
    disk = JSON.parse(fs.readFileSync(path.join(dir, ".caide", "db-link.json"), "utf8"));
    expect(disk).toMatchObject({ provider: "supabase", projectId: "r1", organizationSlug: "o1" });
  });

  it("requires tokens with human errors, rejects unknown channels", async () => {
    expect(await invokeError("s-1", "neon:list-projects", {})).toMatch(/Settings → Database/);
    expect(await invokeError("s-1", "supabase:list-organizations", {})).toMatch(
      /Settings → Database/,
    );
    expect(await invokeError("s-1", "nope:missing", {})).toMatch(/Unknown database channel/);
    expect(await invokeError("s-1", "neon:set-app-project", {})).toMatch(/workspace|projectId/);
  });

  it("lists remote projects and creates with keys", async () => {
    const stub = vi.fn(async (url: unknown, init?: { method?: string }) => {
      const u = String(url);
      const method = init?.method ?? "GET";
      const json = (body: unknown) =>
        ({ ok: true, status: 200, json: async () => body }) as Response;
      if (u.includes("console.neon.tech") && u.endsWith("/projects") && method === "GET") {
        return json({ projects: [{ id: "p1", name: "Shop" }] });
      }
      if (u.includes("/projects/p1/branches") && method === "GET") {
        return json({ branches: [{ id: "b1", name: "main", primary: true }] });
      }
      if (u.includes("console.neon.tech") && u.endsWith("/projects") && method === "POST") {
        return json({ project: { id: "p9", name: "New" } });
      }
      if (u.includes("api.supabase.com/v1/projects") && method === "POST") {
        return json({ id: "r2", name: "NewApp" });
      }
      throw new Error(`unexpected ${method} ${u}`);
    });
    vi.stubGlobal("fetch", stub);
    process.env.NEON_API_KEY = "good";
    process.env.SUPABASE_ACCESS_TOKEN = "good";
    const dir = appDir();
    const listed = (await invoke("s-1", "neon:list-projects", {})) as { projects: unknown[] };
    expect(listed.projects).toHaveLength(1);
    const got = (await invoke("s-1", "neon:get-project", { projectId: "p1" })) as {
      branches: Array<{ id: string }>;
    };
    expect(got.branches[0].id).toBe("b1");
    const created = (await invoke("s-1", "neon:create-project", {
      workspaceRoot: dir,
      name: "New",
    })) as {
      project: { id: string };
    };
    expect(created.project.id).toBe("p9");
    const disk = JSON.parse(fs.readFileSync(path.join(dir, ".caide", "db-link.json"), "utf8"));
    expect(disk.projectId).toBe("p9");
    const sb = (await invoke("s-1", "supabase:create-project", {
      workspaceRoot: dir,
      name: "NewApp",
      organizationId: "o1",
    })) as { project: { id: string } };
    expect(sb.project.id).toBe("r2");
  });
});
