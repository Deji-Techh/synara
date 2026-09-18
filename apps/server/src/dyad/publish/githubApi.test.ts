// FILE: githubApi.test.ts
// Purpose: Phase 4a gate — GitHub PAT REST against a loopback fake,
// publish-link persistence, tool wiring with stubbed fetch.

import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  addGithubCollaborator,
  createGithubRepo,
  GithubApiError,
  listGithubBranches,
  listGithubRepos,
} from "./githubApi.ts";
import { clearPublishCache, readPublishLinks } from "./publishStore.ts";
import { createGithubRepoTool, githubStatusTool } from "./githubTools.ts";

function handler(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = new URL(req.url ?? "", "http://x");
  const key = req.headers.authorization;
  const json = (code: number, body: unknown) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (key !== "Bearer good") return json(401, { message: "Bad credentials" });
  if (req.method === "POST" && url.pathname === "/user/repos") {
    return json(201, {
      owner: { login: "octo" },
      name: "my-app",
      full_name: "octo/my-app",
      private: true,
      default_branch: "main",
    });
  }
  if (url.pathname === "/user/repos") {
    return json(200, [
      { owner: { login: "octo" }, name: "my-app", full_name: "octo/my-app", private: true },
    ]);
  }
  if (url.pathname === "/repos/octo/my-app/branches") {
    return json(200, [{ name: "main" }, { name: "dev" }]);
  }
  if (req.method === "PUT" && url.pathname === "/repos/octo/my-app/collaborators/mona") {
    return json(204, {});
  }
  return json(404, { message: "nope" });
}

let server: http.Server;
let base = "";
beforeAll(async () => {
  server = http.createServer(handler);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
});

function toolCtx(appPath: string) {
  return { signal: AbortSignal.timeout(5000), appPath, sessionId: "s-gh", toolId: "t-gh" };
}

describe("github publish (phase 4a)", () => {
  it("lists repos, creates private repos, manages branches and collaborators", async () => {
    const repos = await listGithubRepos({ token: "good", baseUrl: base });
    expect(repos).toEqual([
      {
        owner: "octo",
        name: "my-app",
        fullName: "octo/my-app",
        private: true,
        defaultBranch: undefined,
      },
    ]);
    const created = await createGithubRepo({ token: "good", repo: "my-app", baseUrl: base });
    expect(created).toMatchObject({ owner: "octo", name: "my-app", private: true });
    expect(
      await listGithubBranches({ token: "good", owner: "octo", repo: "my-app", baseUrl: base }),
    ).toEqual(["main", "dev"]);
    await expect(
      addGithubCollaborator({
        token: "good",
        owner: "octo",
        repo: "my-app",
        username: "mona",
        baseUrl: base,
      }),
    ).resolves.toBeUndefined();
    await expect(listGithubRepos({ token: "bad", baseUrl: base })).rejects.toThrow(/401/);
    await expect(listGithubRepos({ token: "  ", baseUrl: base })).rejects.toBeInstanceOf(
      GithubApiError,
    );
  });

  it("create tool links the repo to publish.json without storing secrets", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-gh-"));
    clearPublishCache();
    // Tool resolves the PAT via settings/env; point env at the fake via baseUrl override is
    // unavailable on the tool, so stub fetch for the api.github.com host instead.
    const realFetch = globalThis.fetch;
    const stub = vi.fn(async (url: unknown, init?: { method?: string; body?: string }) => {
      const u = String(url);
      if (!u.startsWith("https://api.github.com/"))
        return realFetch(url as string, init as RequestInit);
      if (u.endsWith("/user/repos") && (init?.method ?? "GET") === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            owner: { login: "octo" },
            name: "shop",
            full_name: "octo/shop",
            private: true,
            default_branch: "main",
          }),
        } as Response;
      }
      throw new Error(`unexpected ${u}`);
    });
    vi.stubGlobal("fetch", stub);
    const savedGhToken = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = "good";
    try {
      const out = (await createGithubRepoTool.execute({ repo: "shop" }, toolCtx(dir))) as string;
      expect(out).toContain("octo/shop");
      const link = readPublishLinks(dir).github;
      expect(link).toMatchObject({ org: "octo", repo: "shop" });
      const disk = JSON.parse(fs.readFileSync(path.join(dir, ".caide", "publish.json"), "utf8"));
      expect(JSON.stringify(disk)).not.toContain("good");
      const status = (await githubStatusTool.execute({}, toolCtx(dir))) as string;
      expect(status).toContain("octo/shop");
    } finally {
      if (savedGhToken === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = savedGhToken;
      vi.unstubAllGlobals();
    }
  });

  it("presents countable calls", () => {
    expect(createGithubRepoTool.presentCall?.({ repo: "x" })).toBe("Create GitHub repo: x");
    expect(githubStatusTool.presentCall?.({})).toBe("GitHub status");
  });

  it("push pre-checks fail with remediation instead of cryptic git errors", async () => {
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { pushWithGhCli } = await import("./githubApi.ts");
    const dir = mkdtempSync(join(tmpdir(), "caide-ghpush-"));
    const result = await pushWithGhCli({ appPath: dir, owner: "octo", repo: "shop" });
    expect(result.pushed).toBe(false);
    // Either gh is missing or the dir is not a repo — both are actionable.
    expect(result.reason).toMatch(/gh CLI|not a git repository/i);
    expect(result.remote).toBe("https://github.com/octo/shop.git");
  });
});
