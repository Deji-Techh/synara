// FILE: coolifyApi.ts
// Purpose: Coolify self-host REST via API token (PAT-first, Phase 4c):
// probe, discover servers/projects, create project, trigger + read
// application deploys. No hosted broker; token from Settings or COOLIFY_TOKEN.

export class CoolifyApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "CoolifyApiError";
  }
}

export interface CoolifyServer {
  uuid: string;
  name?: string;
  ip?: string;
}

export interface CoolifyProject {
  uuid: string;
  name?: string;
}

export interface CoolifyApplication {
  uuid: string;
  name?: string;
  status?: string;
  fqdn?: string;
}

async function coolifyFetch(
  instanceUrl: string,
  token: string,
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal; query?: Record<string, string> } = {},
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const qs = options.query
      ? `?${new URLSearchParams(options.query).toString()}`
      : "";
    const res = await fetch(`${instanceUrl.replace(/\/+$/, "")}${path}${qs}`, {
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
      throw new CoolifyApiError(`Coolify API ${res.status} on ${path}`, res.status);
    }
    return (await res.json()) as unknown;
  } catch (err) {
    if (err instanceof CoolifyApiError) throw err;
    throw new CoolifyApiError(
      `Coolify API request failed (${path}): ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

function base(input: { instanceUrl: string; token: string }): { baseUrl: string; token: string } {
  const instanceUrl = input.instanceUrl.trim().replace(/\/+$/, "");
  if (!instanceUrl) throw new CoolifyApiError("Coolify instance URL is required.");
  if (!input.token.trim()) throw new CoolifyApiError("Coolify API token is required.");
  return { baseUrl: instanceUrl, token: input.token };
}

/** Probe: version endpoint validates URL + token. */
export async function probeCoolifyInstance(input: {
  instanceUrl: string;
  token: string;
  signal?: AbortSignal;
}): Promise<{ version?: string }> {
  const { baseUrl, token } = base(input);
  const data = (await coolifyFetch(baseUrl, token, "/api/v1/version", { signal: input.signal })) as {
    version?: string;
  };
  return { version: data.version };
}

export async function listCoolifyServers(input: {
  instanceUrl: string;
  token: string;
  signal?: AbortSignal;
}): Promise<CoolifyServer[]> {
  const { baseUrl, token } = base(input);
  const data = (await coolifyFetch(baseUrl, token, "/api/v1/servers", { signal: input.signal })) as Array<{
    uuid?: string;
    name?: string;
    ip?: string;
  }>;
  return (Array.isArray(data) ? data : []).map((s) => ({ uuid: s.uuid ?? "", name: s.name, ip: s.ip }));
}

export async function listCoolifyProjects(input: {
  instanceUrl: string;
  token: string;
  signal?: AbortSignal;
}): Promise<CoolifyProject[]> {
  const { baseUrl, token } = base(input);
  const data = (await coolifyFetch(baseUrl, token, "/api/v1/projects", { signal: input.signal })) as Array<{
    uuid?: string;
    name?: string;
  }>;
  return (Array.isArray(data) ? data : []).map((p) => ({ uuid: p.uuid ?? "", name: p.name }));
}

export async function createCoolifyProject(input: {
  instanceUrl: string;
  token: string;
  name: string;
  signal?: AbortSignal;
}): Promise<CoolifyProject> {
  const { baseUrl, token } = base(input);
  const name = input.name.trim();
  if (!name) throw new CoolifyApiError("Project name is required.");
  const data = (await coolifyFetch(baseUrl, token, "/api/v1/projects", {
    method: "POST",
    body: { name, description: `Created by Caide` },
    signal: input.signal,
  })) as { uuid?: string; name?: string };
  if (!data.uuid) throw new CoolifyApiError("Coolify API returned no project uuid.");
  return { uuid: data.uuid, name: data.name ?? name };
}

/** Trigger a deployment for an application uuid. Returns the queued state. */
export async function triggerCoolifyDeploy(input: {
  instanceUrl: string;
  token: string;
  applicationUuid: string;
  force?: boolean;
  signal?: AbortSignal;
}): Promise<{ queued: boolean }> {
  const { baseUrl, token } = base(input);
  if (!input.applicationUuid.trim()) throw new CoolifyApiError("Application uuid is required.");
  await coolifyFetch(baseUrl, token, "/api/v1/deploy", {
    method: "POST",
    query: { uuid: input.applicationUuid.trim(), ...(input.force ? { force: "true" } : {}) },
    signal: input.signal,
  });
  return { queued: true };
}

/** Read application status (includes fqdn when deployed). */
export async function getCoolifyApplication(input: {
  instanceUrl: string;
  token: string;
  applicationUuid: string;
  signal?: AbortSignal;
}): Promise<CoolifyApplication> {
  const { baseUrl, token } = base(input);
  const data = (await coolifyFetch(
    baseUrl,
    token,
    `/api/v1/applications/${encodeURIComponent(input.applicationUuid)}`,
    { signal: input.signal },
  )) as { uuid?: string; name?: string; status?: string; fqdn?: string };
  return { uuid: data.uuid ?? input.applicationUuid, name: data.name, status: data.status, fqdn: data.fqdn };
}
