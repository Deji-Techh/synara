// FILE: supabaseAuth.ts
// Purpose: Supabase Auth management over the Management API v1 (PAT):
// social-auth providers (8), auth config read/patch, function logs,
// organization details/members.
// Donor: dyad x caide supabase_management_client.ts (provider table,
// status semantics, endpoint shapes) — OAuth SDK client replaced with
// direct PAT REST.

export const SOCIAL_AUTH_PROVIDERS = [
  {
    id: "google",
    name: "Google",
    description: "Google accounts on web, Android, and iOS.",
    setupUrl: "https://console.cloud.google.com/apis/credentials",
  },
  {
    id: "apple",
    name: "Apple",
    description: "Sign in with Apple for web and Apple platforms.",
    setupUrl: "https://developer.apple.com/account/resources/identifiers/list",
  },
  {
    id: "github",
    name: "GitHub",
    description: "GitHub accounts for developer-facing applications.",
    setupUrl: "https://github.com/settings/developers",
  },
  {
    id: "discord",
    name: "Discord",
    description: "Discord accounts and community identities.",
    setupUrl: "https://discord.com/developers/applications",
  },
  {
    id: "twitter",
    name: "X (Twitter)",
    description: "X accounts through the Twitter OAuth provider.",
    setupUrl: "https://developer.x.com/en/portal/dashboard",
  },
  {
    id: "facebook",
    name: "Facebook",
    description: "Facebook Login through a Meta application.",
    setupUrl: "https://developers.facebook.com/apps/",
  },
  {
    id: "azure",
    name: "Microsoft",
    description: "Microsoft personal and Entra ID accounts.",
    setupUrl: "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps",
  },
  {
    id: "linkedin_oidc",
    name: "LinkedIn",
    description: "LinkedIn OpenID Connect sign-in.",
    setupUrl: "https://www.linkedin.com/developers/apps",
  },
] as const;

export type SocialAuthProviderId = (typeof SOCIAL_AUTH_PROVIDERS)[number]["id"];

export interface SocialAuthProviderStatus {
  id: SocialAuthProviderId;
  name: string;
  description: string;
  setupUrl: string;
  enabled: boolean;
  configured: boolean;
  callbackUrl: string;
}

export class SupabaseAuthApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "SupabaseAuthApiError";
  }
}

import { SUPABASE_API_BASE_URL } from "./supabaseApi.ts";

async function authFetch(
  token: string,
  path: string,
  opts?: { method?: string; body?: unknown; baseUrl?: string; signal?: AbortSignal },
): Promise<unknown> {
  if (!token.trim()) throw new SupabaseAuthApiError("Supabase token is required.");
  const base = (opts?.baseUrl ?? SUPABASE_API_BASE_URL).replace(/\/+$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  const onAbort = () => controller.abort();
  opts?.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch(`${base}${path}`, {
      method: opts?.method ?? "GET",
      signal: controller.signal,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        ...(opts?.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(opts?.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });
    if (res.status === 403) {
      throw new SupabaseAuthApiError(
        "Supabase did not grant permission to manage authentication. Reconnect the account with Auth configuration access.",
        403,
      );
    }
    if (!res.ok) {
      throw new SupabaseAuthApiError(`Supabase API ${res.status} on ${path}`, res.status);
    }
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new SupabaseAuthApiError("Supabase returned an invalid authentication response.");
    }
  } catch (err) {
    if (err instanceof SupabaseAuthApiError) throw err;
    throw new SupabaseAuthApiError(
      `Supabase API request failed (${path}): ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
    opts?.signal?.removeEventListener("abort", onAbort);
  }
}

type AuthConfig = Record<string, unknown>;

function socialAuthStatus(
  provider: (typeof SOCIAL_AUTH_PROVIDERS)[number],
  config: AuthConfig,
  projectRef: string,
): SocialAuthProviderStatus {
  const prefix = `external_${provider.id}`;
  const clientId = config[`${prefix}_client_id`];
  return {
    ...provider,
    enabled: config[`${prefix}_enabled`] === true,
    configured: typeof clientId === "string" && clientId.trim().length > 0,
    callbackUrl: `https://${projectRef}.supabase.co/auth/v1/callback`,
  };
}

/** Donor buildSocialAuthProviderPatch parity. */
export function buildSocialAuthProviderPatch(input: {
  provider: SocialAuthProviderId;
  enabled: boolean;
  clientId?: string;
  clientSecret?: string;
}): Record<string, unknown> {
  const prefix = `external_${input.provider}`;
  if (!input.enabled) return { [`${prefix}_enabled`]: false };
  return {
    [`${prefix}_enabled`]: true,
    [`${prefix}_client_id`]: input.clientId,
    [`${prefix}_secret`]: input.clientSecret,
  };
}

/** Donor listSupabaseSocialAuthProviders parity (PAT REST). */
export async function listSupabaseSocialAuthProviders(input: {
  token: string;
  projectRef: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<SocialAuthProviderStatus[]> {
  const config = (await authFetch(
    input.token,
    `/v1/projects/${encodeURIComponent(input.projectRef)}/config/auth`,
    { baseUrl: input.baseUrl, signal: input.signal },
  )) as AuthConfig;
  return SOCIAL_AUTH_PROVIDERS.map((provider) =>
    socialAuthStatus(provider, config, input.projectRef),
  );
}

/** Donor updateSupabaseSocialAuthProvider parity (PATCH then re-read). */
export async function updateSupabaseSocialAuthProvider(input: {
  token: string;
  projectRef: string;
  provider: SocialAuthProviderId;
  enabled: boolean;
  clientId?: string;
  clientSecret?: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<SocialAuthProviderStatus> {
  const provider = SOCIAL_AUTH_PROVIDERS.find((candidate) => candidate.id === input.provider);
  if (!provider) throw new SupabaseAuthApiError("Unsupported social authentication provider.");
  await authFetch(input.token, `/v1/projects/${encodeURIComponent(input.projectRef)}/config/auth`, {
    method: "PATCH",
    body: buildSocialAuthProviderPatch(input),
    baseUrl: input.baseUrl,
    signal: input.signal,
  });
  const config = (await authFetch(
    input.token,
    `/v1/projects/${encodeURIComponent(input.projectRef)}/config/auth`,
    { baseUrl: input.baseUrl, signal: input.signal },
  )) as AuthConfig;
  return socialAuthStatus(provider, config, input.projectRef);
}

export interface SupabaseFunctionLog {
  timestamp: string;
  eventMessage: string;
  metadata?: unknown;
}

/**
 * Donor getSupabaseProjectLogs parity: edge-function logs via the
 * analytics SQL endpoint (→ console, 011). Defaults to the last 10
 * minutes, newest last, capped at 1000 rows.
 */
export async function getSupabaseFunctionLogs(input: {
  token: string;
  projectRef: string;
  timestampStart?: number;
  functionName?: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<SupabaseFunctionLog[]> {
  let sql = "SELECT timestamp, event_message, metadata FROM function_logs";
  const clauses: string[] = [];
  if (input.timestampStart) {
    clauses.push(`timestamp > TIMESTAMP_MICROS(${Math.floor(input.timestampStart) * 1000})`);
  }
  if (input.functionName) {
    const escaped = input.functionName.replace(/'/g, "''");
    clauses.push(`event_message LIKE '[${escaped}]%'`);
  }
  if (clauses.length > 0) sql += `\nWHERE ${clauses.join(" AND ")}`;
  sql += "\nORDER BY timestamp ASC\nLIMIT 1000";
  const now = new Date();
  const params = new URLSearchParams({
    sql,
    iso_timestamp_start: input.timestampStart
      ? new Date(input.timestampStart).toISOString()
      : new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
    iso_timestamp_end: now.toISOString(),
  });
  const data = (await authFetch(
    input.token,
    `/v1/projects/${encodeURIComponent(input.projectRef)}/analytics/endpoints/logs.all?${params.toString()}`,
    { baseUrl: input.baseUrl, signal: input.signal },
  )) as { result?: Array<{ timestamp?: string; event_message?: string; metadata?: unknown }> };
  return (data.result ?? []).map((row) => ({
    timestamp: String(row.timestamp ?? ""),
    eventMessage: String(row.event_message ?? ""),
    metadata: row.metadata,
  }));
}

export interface SupabaseOrganizationDetails {
  id: string;
  name: string;
  slug?: string;
}

export interface SupabaseOrganizationMember {
  userId: string;
  email: string;
  role: string;
  username?: string;
}

/** Donor getOrganizationDetails parity. */
export async function getSupabaseOrganizationDetails(input: {
  token: string;
  organizationSlug: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<SupabaseOrganizationDetails> {
  const data = (await authFetch(
    input.token,
    `/v1/organizations/${encodeURIComponent(input.organizationSlug)}`,
    { baseUrl: input.baseUrl, signal: input.signal },
  )) as { id?: string; name?: string; slug?: string };
  return {
    id: String(data.id ?? input.organizationSlug),
    name: String(data.name ?? input.organizationSlug),
    slug: data.slug,
  };
}

/** Donor getOrganizationMembers parity. */
export async function getSupabaseOrganizationMembers(input: {
  token: string;
  organizationSlug: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<SupabaseOrganizationMember[]> {
  const data = (await authFetch(
    input.token,
    `/v1/organizations/${encodeURIComponent(input.organizationSlug)}/members`,
    { baseUrl: input.baseUrl, signal: input.signal },
  )) as Array<{ user_id?: string; email?: string; role?: string; username?: string }>;
  return (Array.isArray(data) ? data : []).map((m) => ({
    userId: String(m.user_id ?? ""),
    email: String(m.email ?? ""),
    role: String(m.role ?? ""),
    username: m.username,
  }));
}
