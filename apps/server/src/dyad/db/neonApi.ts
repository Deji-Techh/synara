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
  const data = (await neonFetch(input.baseUrl ?? NEON_API_BASE_URL, input.apiKey, "/projects", input.signal)) as {
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
