// FILE: githubApi.ts
// Purpose: GitHub REST via personal access token (PAT-first, Phase 4a) +
// gh-CLI detection for credential-free push/sync. No hosted OAuth broker:
// device flow with Caide's own app id follows later; PAT covers everything.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const GITHUB_API_BASE_URL = "https://api.github.com";

export class GithubApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "GithubApiError";
  }
}

export interface GithubRepo {
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch?: string;
}

async function githubFetch(
  baseUrl: string,
  token: string,
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, {
      method: options.method ?? "GET",
      signal: controller.signal,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2022-11-28",
        ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
    if (res.status === 204) return {};
    if (!res.ok) {
      // Surface the API's message (scope/SSO/permission hints) — bare
      // statuses are opaque and unactionable.
      let detail = "";
      try {
        const errBody = (await res.json()) as {
          message?: string;
          errors?: Array<{ message?: string }>;
        };
        const msg =
          errBody.message ??
          errBody.errors
            ?.map((e) => e.message)
            .filter(Boolean)
            .join("; ");
        if (msg) detail = `: ${msg}`;
      } catch {
        // ignore body parse
      }
      throw new GithubApiError(`GitHub API ${res.status} on ${path}${detail}`, res.status);
    }
    return (await res.json()) as unknown;
  } catch (err) {
    if (err instanceof GithubApiError) throw err;
    throw new GithubApiError(
      `GitHub API request failed (${path}): ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

function requireToken(token: string): void {
  if (!token.trim()) throw new GithubApiError("GitHub token is required.");
}

/** True when the gh CLI is installed AND authenticated (credential-free path). */
export async function isGhCliAuthenticated(cwd?: string): Promise<boolean> {
  try {
    await execFileAsync("gh", ["auth", "status"], { cwd, timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

export async function listGithubRepos(input: {
  token: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<GithubRepo[]> {
  requireToken(input.token);
  const data = (await githubFetch(
    input.baseUrl ?? GITHUB_API_BASE_URL,
    input.token,
    "/user/repos?per_page=100&sort=updated",
    {
      signal: input.signal,
    },
  )) as Array<{
    owner?: { login?: string };
    name?: string;
    full_name?: string;
    private?: boolean;
    default_branch?: string;
  }>;
  return (Array.isArray(data) ? data : []).map((r) => ({
    owner: r.owner?.login ?? "",
    name: r.name ?? "",
    fullName: r.full_name ?? "",
    private: r.private ?? true,
    defaultBranch: r.default_branch,
  }));
}

/** Create a PRIVATE repo under the user (or org when org is set). */
export async function createGithubRepo(input: {
  token: string;
  repo: string;
  org?: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<GithubRepo> {
  requireToken(input.token);
  const repo = input.repo.trim();
  if (!repo) throw new GithubApiError("Repo name is required.");
  const org = input.org?.trim();
  const path = org ? `/orgs/${encodeURIComponent(org)}/repos` : "/user/repos";
  const data = (await githubFetch(input.baseUrl ?? GITHUB_API_BASE_URL, input.token, path, {
    method: "POST",
    body: { name: repo, private: true, auto_init: false },
    signal: input.signal,
  })) as {
    owner?: { login?: string };
    name?: string;
    full_name?: string;
    private?: boolean;
    default_branch?: string;
  };
  return {
    owner: data.owner?.login ?? org ?? "",
    name: data.name ?? repo,
    fullName: data.full_name ?? `${org ?? ""}/${repo}`,
    private: data.private ?? true,
    defaultBranch: data.default_branch,
  };
}

export async function listGithubBranches(input: {
  token: string;
  owner: string;
  repo: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<string[]> {
  requireToken(input.token);
  const data = (await githubFetch(
    input.baseUrl ?? GITHUB_API_BASE_URL,
    input.token,
    `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/branches?per_page=100`,
    { signal: input.signal },
  )) as Array<{ name?: string }>;
  return (Array.isArray(data) ? data : []).map((b) => b.name ?? "").filter(Boolean);
}

export async function addGithubCollaborator(input: {
  token: string;
  owner: string;
  repo: string;
  username: string;
  permission?: "pull" | "triage" | "push" | "maintain" | "admin";
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<void> {
  requireToken(input.token);
  const username = input.username.trim();
  if (!username) throw new GithubApiError("Username is required.");
  await githubFetch(
    input.baseUrl ?? GITHUB_API_BASE_URL,
    input.token,
    `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/collaborators/${encodeURIComponent(username)}`,
    { method: "PUT", body: { permission: input.permission ?? "push" }, signal: input.signal },
  );
}

/**
 * Push the workspace to GitHub. Prefers the gh CLI (uses the user's existing
 * `gh auth`, zero new secrets): sets a credential-free remote and pushes the
 * current branch upstream. Falls back to an explicit error when gh is absent
 * or unauthenticated — the agent then configures a PAT remote instead.
 */
export async function pushWithGhCli(input: {
  appPath: string;
  owner: string;
  repo: string;
  branch?: string;
}): Promise<{ pushed: boolean; remote: string; reason?: string }> {
  const remote = `https://github.com/${input.owner}/${input.repo}.git`;
  if (!(await isGhCliAuthenticated(input.appPath))) {
    return { pushed: false, remote, reason: "gh CLI not installed or not authenticated" };
  }
  const run = async (args: string[]) =>
    execFileAsync("git", args, { cwd: input.appPath, timeout: 30_000 });
  try {
    // Pre-checks with exact remediation (no cryptic push failures).
    await run(["rev-parse", "--is-inside-work-tree"]).catch(() => {
      throw new Error("not a git repository — run git init, add, and commit first");
    });
    try {
      await run(["rev-parse", "--verify", "HEAD"]);
    } catch {
      throw new Error("no commits yet — stage and commit files first (git add -A && git commit)");
    }
    try {
      await run(["config", "user.email"]);
    } catch {
      throw new Error("git identity missing — set user.name and user.email first");
    }
    await run(["remote", "remove", "origin"]).catch(() => {});
    await run(["remote", "add", "origin", remote]);
    const branch = input.branch?.trim();
    const pushArgs = branch ? ["push", "-u", "origin", branch] : ["push", "-u", "origin", "HEAD"];
    await execFileAsync("git", pushArgs, { cwd: input.appPath, timeout: 120_000 });
    return { pushed: true, remote };
  } catch (err) {
    return {
      pushed: false,
      remote,
      reason: err instanceof Error ? err.message.split("\n")[0] : String(err),
    };
  }
}
