// FILE: supabaseApi.ts
// Purpose: Supabase Management API v1 over fetch (user Personal Access
// Token): list organizations and projects. SQL itself runs over the linked
// DATABASE_URL via bun:sql — this client is for inspection/linking only.
// Donor: supabase_admin project/org listing behavior (SDK replaced by REST).

export const SUPABASE_API_BASE_URL = "https://api.supabase.com";

export class SupabaseApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "SupabaseApiError";
  }
}

export interface SupabaseOrganization {
  id: string;
  name: string;
}

export interface SupabaseProject {
  id: string;
  name: string;
  organizationId?: string;
  region?: string;
  status?: string;
}

async function supabaseFetch(
  baseUrl: string,
  token: string,
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
      headers: { accept: "application/json", authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new SupabaseApiError(`Supabase API ${res.status} on ${path}`, res.status);
    }
    return (await res.json()) as unknown;
  } catch (err) {
    if (err instanceof SupabaseApiError) throw err;
    throw new SupabaseApiError(
      `Supabase API request failed (${path}): ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

export async function listSupabaseOrganizations(input: {
  token: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<SupabaseOrganization[]> {
  if (!input.token.trim()) throw new SupabaseApiError("Supabase token is required.");
  const data = (await supabaseFetch(
    input.baseUrl ?? SUPABASE_API_BASE_URL,
    input.token,
    "/v1/organizations",
    input.signal,
  )) as Array<{ id: string; name: string }>;
  return (Array.isArray(data) ? data : []).map((o) => ({ id: o.id, name: o.name }));
}

export async function listSupabaseProjects(input: {
  token: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<SupabaseProject[]> {
  if (!input.token.trim()) throw new SupabaseApiError("Supabase token is required.");
  const data = (await supabaseFetch(
    input.baseUrl ?? SUPABASE_API_BASE_URL,
    input.token,
    "/v1/projects",
    input.signal,
  )) as Array<{ id: string; name: string; organization_id?: string; region?: string; status?: string }>;
  return (Array.isArray(data) ? data : []).map((p) => ({
    id: p.id,
    name: p.name,
    organizationId: p.organization_id,
    region: p.region,
    status: p.status,
  }));
}
