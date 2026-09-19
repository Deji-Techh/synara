// FILE: neonApi.ts
// Purpose: Neon Management API v2 over fetch (user API key): list projects
// and branches. SQL itself runs over the linked DATABASE_URL via bun:sql —
// this client is for inspection/linking only.
// Donor: neon_admin/neon_context getNeonProjectInfo/getNeonTableSchema
// behavior (SDK calls replaced by direct REST).

export const NEON_API_BASE_URL = "https://console.neon.tech/api/v2";

export class NeonApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "NeonApiError";
  }
}

export interface NeonProject {
  id: string;
  name: string;
  createdAt?: string;
}

export interface NeonBranch {
  id: string;
  name: string;
  primary?: boolean;
}

async function neonFetch(
  baseUrl: string,
  apiKey: string,
  path: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, {
      signal: controller.signal,
      headers: { accept: "application/json", authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      throw new NeonApiError(`Neon API ${res.status} on ${path}`, res.status);
    }
    return (await res.json()) as unknown;
  } catch (err) {
    if (err instanceof NeonApiError) throw err;
    throw new NeonApiError(
      `Neon API request failed (${path}): ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

export async function listNeonProjects(input: {
  apiKey: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<NeonProject[]> {
  if (!input.apiKey.trim()) throw new NeonApiError("Neon API key is required.");
  const data = (await neonFetch(
    input.baseUrl ?? NEON_API_BASE_URL,
    input.apiKey,
    "/projects",
    input.signal,
  )) as {
    projects?: Array<{ id: string; name: string; created_at?: string }>;
  };
  return (data.projects ?? []).map((p) => ({ id: p.id, name: p.name, createdAt: p.created_at }));
}

export async function listNeonBranches(input: {
  apiKey: string;
  projectId: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<NeonBranch[]> {
  if (!input.apiKey.trim()) throw new NeonApiError("Neon API key is required.");
  const data = (await neonFetch(
    input.baseUrl ?? NEON_API_BASE_URL,
    input.apiKey,
    `/projects/${encodeURIComponent(input.projectId)}/branches`,
    input.signal,
  )) as { branches?: Array<{ id: string; name: string; primary?: boolean }> };
  return (data.branches ?? []).map((b) => ({ id: b.id, name: b.name, primary: b.primary }));
}

export interface NeonCreatedBranch {
  id: string;
  name: string;
  connectionUri?: string;
}

async function neonPost(
  baseUrl: string,
  apiKey: string,
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new NeonApiError(`Neon API ${res.status} on ${path}`, res.status);
    }
    return (await res.json()) as unknown;
  } catch (err) {
    if (err instanceof NeonApiError) throw err;
    throw new NeonApiError(
      `Neon API request failed (${path}): ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Create a branch (database) inside a Neon project. Returns the branch plus
 * a pooled connection URI when the API provides one. */
export async function createNeonBranch(input: {
  apiKey: string;
  projectId: string;
  branchName: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<NeonCreatedBranch> {
  if (!input.apiKey.trim()) throw new NeonApiError("Neon API key is required.");
  const name = input.branchName.trim();
  if (!name) throw new NeonApiError("Branch name is required.");
  const data = (await neonPost(
    input.baseUrl ?? NEON_API_BASE_URL,
    input.apiKey,
    `/projects/${encodeURIComponent(input.projectId)}/branches`,
    { endpoints: [{ type: "read_write" }], branch: { name } },
    input.signal,
  )) as {
    branch?: { id?: string; name?: string };
    connection_uris?: Array<{ connection_uri?: string }>;
  };
  const id = data.branch?.id ?? "";
  if (!id) throw new NeonApiError("Neon API returned no branch id.");
  const connectionUri = data.connection_uris?.map((u) => u.connection_uri).find(Boolean);
  return { id, name: data.branch?.name ?? name, ...(connectionUri ? { connectionUri } : {}) };
}

export interface NeonCreatedProject {
  id: string;
  name: string;
  connectionUri?: string;
}

/** Create a Neon project. On post-create failure the caller should delete
 * the orphan project (donor parity: best-effort cleanup lives in the tool). */
export async function createNeonProject(input: {
  apiKey: string;
  name: string;
  regionId?: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<NeonCreatedProject> {
  if (!input.apiKey.trim()) throw new NeonApiError("Neon API key is required.");
  const name = input.name.trim();
  if (!name) throw new NeonApiError("Project name is required.");
  const data = (await neonPost(
    input.baseUrl ?? NEON_API_BASE_URL,
    input.apiKey,
    "/projects",
    {
      project: {
        name,
        ...(input.regionId?.trim() ? { region_id: input.regionId.trim() } : {}),
      },
    },
    input.signal,
  )) as {
    project?: { id?: string; name?: string };
    connection_uris?: Array<{ connection_uri?: string }>;
  };
  const id = data.project?.id ?? "";
  if (!id) throw new NeonApiError("Neon API returned no project id.");
  const connectionUri = data.connection_uris?.map((u) => u.connection_uri).find(Boolean);
  return { id, name: data.project?.name ?? name, ...(connectionUri ? { connectionUri } : {}) };
}

/** Delete a Neon project (orphan cleanup after failed provisioning). */
export async function deleteNeonProject(input: {
  apiKey: string;
  projectId: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<void> {
  if (!input.apiKey.trim()) throw new NeonApiError("Neon API key is required.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(
      `${(input.baseUrl ?? NEON_API_BASE_URL).replace(/\/+$/, "")}/projects/${encodeURIComponent(input.projectId)}`,
      {
        method: "DELETE",
        signal: controller.signal,
        headers: { accept: "application/json", authorization: `Bearer ${input.apiKey}` },
      },
    );
    if (!res.ok && res.status !== 404) {
      throw new NeonApiError(`Neon API ${res.status} on delete project`, res.status);
    }
  } catch (err) {
    if (err instanceof NeonApiError) throw err;
    throw new NeonApiError(
      `Neon API request failed (delete project): ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Delete a Neon branch (test-branch teardown). */
export async function deleteNeonBranch(input: {
  apiKey: string;
  projectId: string;
  branchId: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<void> {
  if (!input.apiKey.trim()) throw new NeonApiError("Neon API key is required.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(
      `${(input.baseUrl ?? NEON_API_BASE_URL).replace(/\/+$/, "")}/projects/${encodeURIComponent(input.projectId)}/branches/${encodeURIComponent(input.branchId)}`,
      {
        method: "DELETE",
        signal: controller.signal,
        headers: { accept: "application/json", authorization: `Bearer ${input.apiKey}` },
      },
    );
    if (!res.ok && res.status !== 404) {
      throw new NeonApiError(`Neon API ${res.status} on delete branch`, res.status);
    }
  } catch (err) {
    if (err instanceof NeonApiError) throw err;
    throw new NeonApiError(
      `Neon API request failed (delete branch): ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}
