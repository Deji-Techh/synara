// FILE: vercelApi.ts
// Purpose: Vercel REST via personal access token (PAT-first, Phase 4b):
// validate, projects (list/create/connect), deployments (list/trigger),
// env sync for the Neon-owned keys. No hosted OAuth broker.

export const VERCEL_API_BASE_URL = "https://api.vercel.com";

export class VercelApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "VercelApiError";
  }
}

export interface VercelProject {
  id: string;
  name: string;
  framework?: string;
}

export interface VercelDeployment {
  id: string;
  url?: string;
  state?: string;
  target?: string;
  createdAt?: number;
}

async function vercelFetch(
  baseUrl: string,
  token: string,
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal; teamId?: string } = {},
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const suffix = options.teamId ? `${path.includes("?") ? "&" : "?"}teamId=${encodeURIComponent(options.teamId)}` : "";
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}${suffix}`, {
      method: options.method ?? "GET",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
    if (res.status === 204) return {};
    if (!res.ok) {
      let detail = "";
      try {
        const errBody = (await res.json()) as { error?: { message?: string } };
        detail = errBody.error?.message ? `: ${errBody.error.message}` : "";
      } catch {
        // ignore body parse
      }
      throw new VercelApiError(`Vercel API ${res.status} on ${path}${detail}`, res.status);
    }
    return (await res.json()) as unknown;
  } catch (err) {
    if (err instanceof VercelApiError) throw err;
    throw new VercelApiError(
      `Vercel API request failed (${path}): ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

function requireToken(token: string): void {
  if (!token.trim()) throw new VercelApiError("Vercel token is required.");
}

/** Validate a token by reading the auth user. */
export async function getVercelAuthUser(input: {
  token: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<{ id: string; username?: string; email?: string }> {
  requireToken(input.token);
  const data = (await vercelFetch(input.baseUrl ?? VERCEL_API_BASE_URL, input.token, "/v2/user", {
    signal: input.signal,
  })) as { user?: { id?: string; username?: string; email?: string } };
  const user = data.user ?? {};
  if (!user.id) throw new VercelApiError("Vercel API returned no user.");
  return { id: user.id, username: user.username, email: user.email };
}

export async function listVercelProjects(input: {
  token: string;
  teamId?: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<VercelProject[]> {
  requireToken(input.token);
  const data = (await vercelFetch(input.baseUrl ?? VERCEL_API_BASE_URL, input.token, "/v9/projects?limit=100", {
    teamId: input.teamId,
    signal: input.signal,
  })) as { projects?: Array<{ id?: string; name?: string; framework?: string }> };
  return (data.projects ?? []).map((p) => ({ id: p.id ?? "", name: p.name ?? "", framework: p.framework }));
}

export async function createVercelProject(input: {
  token: string;
  name: string;
  teamId?: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<VercelProject> {
  requireToken(input.token);
  const name = input.name.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  if (!name) throw new VercelApiError("Project name is required.");
  const data = (await vercelFetch(input.baseUrl ?? VERCEL_API_BASE_URL, input.token, "/v10/projects", {
    method: "POST",
    body: { name },
    teamId: input.teamId,
    signal: input.signal,
  })) as { id?: string; name?: string; framework?: string };
  if (!data.id) throw new VercelApiError("Vercel API returned no project id.");
  return { id: data.id, name: data.name ?? name, framework: data.framework };
}

export async function listVercelDeployments(input: {
  token: string;
  projectId: string;
  teamId?: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<VercelDeployment[]> {
  requireToken(input.token);
  const data = (await vercelFetch(
    input.baseUrl ?? VERCEL_API_BASE_URL,
    input.token,
    `/v6/deployments?projectId=${encodeURIComponent(input.projectId)}&limit=5`,
    { teamId: input.teamId, signal: input.signal },
  )) as { deployments?: Array<{ uid?: string; url?: string; state?: string; target?: string; createdAt?: number }> };
  return (data.deployments ?? []).map((d) => ({
    id: d.uid ?? "",
    url: d.url,
    state: d.state,
    target: d.target,
    createdAt: d.createdAt,
  }));
}

/**
 * Trigger a production deployment on a git-connected project. File-upload
 * deploys are out of scope — the project must be connected to a git repo
 * (dashboard or our GitHub flow); otherwise Vercel's error is surfaced.
 */
export async function triggerVercelDeployment(input: {
  token: string;
  projectId: string;
  projectName: string;
  teamId?: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<VercelDeployment> {
  requireToken(input.token);
  const data = (await vercelFetch(input.baseUrl ?? VERCEL_API_BASE_URL, input.token, "/v13/deployments", {
    method: "POST",
    body: { name: input.projectName, project: input.projectId, target: "production" },
    teamId: input.teamId,
    signal: input.signal,
  })) as { uid?: string; url?: string; state?: string; target?: string };
  if (!data.uid) throw new VercelApiError("Vercel API returned no deployment id.");
  return { id: data.uid, url: data.url, state: data.state, target: data.target };
}

/** Neon-owned env keys synced to Vercel (never POSTGRES_URL — donor rule). */
export const NEON_VERCEL_ENV_KEYS = ["DATABASE_URL", "NEON_AUTH_BASE_URL", "NEON_AUTH_COOKIE_SECRET"] as const;

/** Upsert env vars across production/preview/development targets. */
export async function syncNeonEnvToVercel(input: {
  token: string;
  projectId: string;
  vars: Partial<Record<(typeof NEON_VERCEL_ENV_KEYS)[number], string>>;
  teamId?: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<string[]> {
  requireToken(input.token);
  const synced: string[] = [];
  for (const [key, value] of Object.entries(input.vars)) {
    if (!NEON_VERCEL_ENV_KEYS.includes(key as (typeof NEON_VERCEL_ENV_KEYS)[number])) continue;
    if (!value?.trim()) continue;
    await vercelFetch(
      input.baseUrl ?? VERCEL_API_BASE_URL,
      input.token,
      `/v10/projects/${encodeURIComponent(input.projectId)}/env`,
      {
        method: "POST",
        body: { key, value, type: "encrypted", target: ["production", "preview", "development"] },
        teamId: input.teamId,
        signal: input.signal,
      },
    );
    synced.push(key);
  }
  return synced;
}
