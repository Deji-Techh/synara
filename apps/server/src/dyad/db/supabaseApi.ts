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

async function supabasePost(
  baseUrl: string,
  token: string,
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
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

function randomDbPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"[b % 72]).join("");
}

/** Create a Supabase project. The generated db password is never stored —
 * return it once so the caller can hand it to project creation only. */
export async function createSupabaseProject(input: {
  token: string;
  name: string;
  organizationId: string;
  region?: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<{ id: string; name: string }> {
  if (!input.token.trim()) throw new SupabaseApiError("Supabase token is required.");
  const name = input.name.trim();
  const organizationId = input.organizationId.trim();
  if (!name) throw new SupabaseApiError("Project name is required.");
  if (!organizationId) throw new SupabaseApiError("Organization id is required.");
  const data = (await supabasePost(
    input.baseUrl ?? SUPABASE_API_BASE_URL,
    input.token,
    "/v1/projects",
    {
      name,
      organization_slug: organizationId,
      region: input.region?.trim() || "us-east-1",
      db_pass: randomDbPassword(),
    },
    input.signal,
  )) as { id?: string; name?: string; ref?: string };
  const id = data.id ?? data.ref ?? "";
  if (!id) throw new SupabaseApiError("Supabase API returned no project id.");
  return { id, name: data.name ?? name };
}

export interface SupabaseApiKey {
  name: string;
  apiKey?: string;
}

/** List project API keys. With reveal=true secret values are exposed —
 * audit-logged by Supabase; callers must never log or print them. */
export async function getSupabaseProjectApiKeys(input: {
  token: string;
  projectId: string;
  reveal?: boolean;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<SupabaseApiKey[]> {
  if (!input.token.trim()) throw new SupabaseApiError("Supabase token is required.");
  const path = `/v1/projects/${encodeURIComponent(input.projectId)}/api-keys${input.reveal ? "?reveal=true" : ""}`;
  const data = (await supabaseFetch(input.baseUrl ?? SUPABASE_API_BASE_URL, input.token, path, input.signal)) as Array<{
    name?: string;
    api_key?: string;
    apiKey?: string;
  }>;
  return (Array.isArray(data) ? data : []).map((k) => ({
    name: k.name ?? "",
    ...((typeof k.api_key === "string" || typeof k.apiKey === "string") && { apiKey: (k.api_key ?? k.apiKey) as string }),
  }));
}

/** Deploy one Edge Function from bundled source. */
export async function deploySupabaseFunction(input: {
  token: string;
  projectId: string;
  slug: string;
  bundleB64: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<void> {
  if (!input.token.trim()) throw new SupabaseApiError("Supabase token is required.");
  const slug = input.slug.trim();
  if (!slug) throw new SupabaseApiError("Function slug is required.");
  await supabasePost(
    input.baseUrl ?? SUPABASE_API_BASE_URL,
    input.token,
    `/v1/projects/${encodeURIComponent(input.projectId)}/functions/deploy?slug=${encodeURIComponent(slug)}`,
    { bundle: input.bundleB64 },
    input.signal,
  );
}

export interface SupabaseTestUser {
  id: string;
  email: string;
}

/**
 * Create a throwaway Auth user for isolated end-to-end verification.
 * Uses the project's secret key (Auth Admin) — the key must come from
 * getSupabaseProjectApiKeys(reveal=true) and must never be stored in the
 * app or printed in chat. The app itself keeps running on the publishable key.
 */
export async function createSupabaseTestUser(input: {
  projectRef: string;
  secretKey: string;
  email?: string;
  signal?: AbortSignal;
}): Promise<SupabaseTestUser> {
  if (!input.secretKey.trim()) throw new SupabaseApiError("Project secret key is required.");
  const email = input.email?.trim() || `dyad-test-${Date.now().toString(36)}@dyad.test`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`https://${input.projectRef}.supabase.co/auth/v1/admin/users`, {
      method: "POST",
      signal: input.signal ?? controller.signal,
      headers: {
        "content-type": "application/json",
        apikey: input.secretKey,
        authorization: `Bearer ${input.secretKey}`,
      },
      body: JSON.stringify({ email, email_confirm: true }),
    });
    if (!res.ok) throw new SupabaseApiError(`Supabase Auth Admin ${res.status}`, res.status);
    const data = (await res.json()) as { id?: string; email?: string };
    if (!data.id) throw new SupabaseApiError("Auth Admin returned no user id.");
    return { id: data.id, email: data.email ?? email };
  } catch (err) {
    if (err instanceof SupabaseApiError) throw err;
    throw new SupabaseApiError(`Test user create failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Delete a throwaway Auth user created by createSupabaseTestUser. */
export async function deleteSupabaseTestUser(input: {
  projectRef: string;
  secretKey: string;
  userId: string;
  signal?: AbortSignal;
}): Promise<void> {
  if (!input.secretKey.trim()) throw new SupabaseApiError("Project secret key is required.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(
      `https://${input.projectRef}.supabase.co/auth/v1/admin/users/${encodeURIComponent(input.userId)}`,
      {
        method: "DELETE",
        signal: input.signal ?? controller.signal,
        headers: { apikey: input.secretKey, authorization: `Bearer ${input.secretKey}` },
      },
    );
    if (!res.ok && res.status !== 404) {
      throw new SupabaseApiError(`Supabase Auth Admin ${res.status}`, res.status);
    }
  } catch (err) {
    if (err instanceof SupabaseApiError) throw err;
    throw new SupabaseApiError(`Test user delete failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    clearTimeout(timer);
  }
}
