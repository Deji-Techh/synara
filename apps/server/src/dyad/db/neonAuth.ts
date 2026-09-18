// FILE: neonAuth.ts
// Purpose: Neon Auth lifecycle over the Neon API v2 (PAT): ensure/get,
// branch typing, email+password config (verification switches), trusted
// redirect domains, per-branch env resolution.
// Donor: dyad x caide neon_utils.ts (ensureNeonAuth 404→create→409-refetch
// semantics, cookie-secret rules) + Neon API auth reference (endpoint
// shapes). SDK/OAuth client replaced with direct PAT REST.

import { generateCookieSecret, readEnvVarsOrEmpty, updateNeonEnvVars } from "./envFile.ts";
import { NEON_API_BASE_URL, type NeonBranch } from "./neonApi.ts";

export class NeonAuthApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "NeonAuthApiError";
  }
}

async function neonAuthFetch(
  apiKey: string,
  path: string,
  opts?: { method?: string; body?: unknown; baseUrl?: string; signal?: AbortSignal },
): Promise<{ status: number; data: unknown }> {
  if (!apiKey.trim()) throw new NeonAuthApiError("Neon API key is required.");
  const base = (opts?.baseUrl ?? NEON_API_BASE_URL).replace(/\/+$/, "");
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
        authorization: `Bearer ${apiKey}`,
        ...(opts?.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(opts?.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });
    const data = (await res.json().catch(() => null)) as unknown;
    return { status: res.status, data };
  } catch (err) {
    if (err instanceof NeonAuthApiError) throw err;
    throw new NeonAuthApiError(
      `Neon API request failed (${path}): ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
    opts?.signal?.removeEventListener("abort", onAbort);
  }
}

export interface NeonAuthIntegration {
  authProvider: string;
  baseUrl?: string;
  jwksUrl?: string;
  branchId?: string;
}

/**
 * Donor ensureNeonAuth parity: GET (already enabled → base_url), 404 →
 * POST create (better_auth), 409 (inherited schema) → GET retry, else
 * undefined. Returns the auth base URL or undefined when unavailable.
 */
export async function ensureNeonAuth(input: {
  apiKey: string;
  projectId: string;
  branchId: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<string | undefined> {
  const path = `/projects/${encodeURIComponent(input.projectId)}/branches/${encodeURIComponent(input.branchId)}/auth`;
  const shared = { baseUrl: input.baseUrl, signal: input.signal };
  const current = await neonAuthFetch(input.apiKey, path, shared);
  if (current.status === 200) {
    const baseUrl = (current.data as { base_url?: unknown })?.base_url;
    return typeof baseUrl === "string" ? baseUrl : undefined;
  }
  if (current.status !== 404) {
    throw new NeonAuthApiError(`Neon Auth lookup failed (${current.status})`, current.status);
  }
  const created = await neonAuthFetch(input.apiKey, path, {
    ...shared,
    method: "POST",
    body: { auth_provider: "better_auth" },
  });
  if (created.status === 200 || created.status === 201) {
    const baseUrl = (created.data as { base_url?: unknown })?.base_url;
    return typeof baseUrl === "string" ? baseUrl : undefined;
  }
  if (created.status === 409) {
    const retry = await neonAuthFetch(input.apiKey, path, shared);
    if (retry.status === 200) {
      const baseUrl = (retry.data as { base_url?: unknown })?.base_url;
      return typeof baseUrl === "string" ? baseUrl : undefined;
    }
    return undefined;
  }
  throw new NeonAuthApiError(`Neon Auth enable failed (${created.status})`, created.status);
}

export interface NeonEmailPasswordConfig {
  enabled?: boolean;
  allowSignUp?: boolean;
  verifyEmailOnSignUp?: boolean;
  verifyEmailOnSignIn?: boolean;
  requireEmailVerification?: boolean;
  autoSignInAfterVerification?: boolean;
}

/** Read the branch email+password config (verification switches, 013). */
export async function getNeonEmailPasswordConfig(input: {
  apiKey: string;
  projectId: string;
  branchId: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<NeonEmailPasswordConfig> {
  const { status, data } = await neonAuthFetch(
    input.apiKey,
    `/projects/${encodeURIComponent(input.projectId)}/branches/${encodeURIComponent(input.branchId)}/auth/email_and_password`,
    { baseUrl: input.baseUrl, signal: input.signal },
  );
  if (status !== 200) {
    throw new NeonAuthApiError(`Neon Auth email config read failed (${status})`, status);
  }
  const config = (data ?? {}) as Record<string, unknown>;
  const pick = (key: string): boolean | undefined =>
    typeof config[key] === "boolean" ? (config[key] as boolean) : undefined;
  return {
    enabled: pick("enabled"),
    allowSignUp: pick("allow_sign_up"),
    verifyEmailOnSignUp: pick("verify_email_on_sign_up"),
    verifyEmailOnSignIn: pick("verify_email_on_sign_in"),
    requireEmailVerification: pick("require_email_verification"),
    autoSignInAfterVerification: pick("auto_sign_in_after_verification"),
  };
}

/** Patch the branch email+password config (verification switch in UI). */
export async function updateNeonEmailPasswordConfig(input: {
  apiKey: string;
  projectId: string;
  branchId: string;
  patch: NeonEmailPasswordConfig;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<NeonEmailPasswordConfig> {
  const snake: Record<string, boolean> = {};
  const put = (camel: keyof NeonEmailPasswordConfig, key: string) => {
    const value = input.patch[camel];
    if (value !== undefined) snake[key] = value;
  };
  put("enabled", "enabled");
  put("allowSignUp", "allow_sign_up");
  put("verifyEmailOnSignUp", "verify_email_on_sign_up");
  put("verifyEmailOnSignIn", "verify_email_on_sign_in");
  put("requireEmailVerification", "require_email_verification");
  put("autoSignInAfterVerification", "auto_sign_in_after_verification");
  const { status } = await neonAuthFetch(
    input.apiKey,
    `/projects/${encodeURIComponent(input.projectId)}/branches/${encodeURIComponent(input.branchId)}/auth/email_and_password`,
    { method: "PATCH", body: snake, baseUrl: input.baseUrl, signal: input.signal },
  );
  if (status !== 200) {
    throw new NeonAuthApiError(`Neon Auth email config update failed (${status})`, status);
  }
  return getNeonEmailPasswordConfig(input);
}

/** List trusted redirect domains for the branch auth integration. */
export async function listNeonTrustedDomains(input: {
  apiKey: string;
  projectId: string;
  branchId: string;
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<string[]> {
  const { status, data } = await neonAuthFetch(
    input.apiKey,
    `/projects/${encodeURIComponent(input.projectId)}/branches/${encodeURIComponent(input.branchId)}/auth/domains`,
    { baseUrl: input.baseUrl, signal: input.signal },
  );
  if (status !== 200) {
    throw new NeonAuthApiError(`Neon trusted domains read failed (${status})`, status);
  }
  const rows = (data as { domains?: Array<{ domain?: unknown }> })?.domains ?? [];
  return rows.map((d) => String(d.domain ?? "")).filter(Boolean);
}

/** Add trusted redirect domains (donor reconcileTrustedDomains feeds this). */
export async function addNeonTrustedDomains(input: {
  apiKey: string;
  projectId: string;
  branchId: string;
  domains: string[];
  baseUrl?: string;
  signal?: AbortSignal;
}): Promise<void> {
  const { status } = await neonAuthFetch(
    input.apiKey,
    `/projects/${encodeURIComponent(input.projectId)}/branches/${encodeURIComponent(input.branchId)}/auth/domains`,
    {
      method: "POST",
      body: { domains: input.domains },
      baseUrl: input.baseUrl,
      signal: input.signal,
    },
  );
  if (status !== 200 && status !== 201) {
    throw new NeonAuthApiError(`Neon trusted domains update failed (${status})`, status);
  }
}

export type NeonBranchType = "production" | "development" | "preview" | "snapshot";

/**
 * Donor branch typing parity: primary → production; explicit snapshot
 * branches stay snapshots; the rest split development/preview by name.
 * Pure (no I/O) so the Database panel + deploy preference share it.
 */
export function classifyNeonBranch(branch: NeonBranch): NeonBranchType {
  if (branch.primary) return "production";
  if (/snapshot/i.test(branch.name)) return "snapshot";
  if (/preview/i.test(branch.name)) return "preview";
  return "development";
}

export interface NeonBranchEnvResolution {
  databaseUrl: string;
  neonAuthBaseUrl?: string;
  cookieSecretUsed: boolean;
}

/**
 * Donor resolveNeonBranchEnvVars core parity: builds the per-branch env
 * values (DATABASE_URL from the branch connection string, Auth base URL
 * when active, Next.js-only cookie secret adopted from .env.local or
 * freshly generated), then writes them via updateNeonEnvVars. Connection
 * strings come from the caller (branch detail API), not re-fetched here.
 */
export async function resolveNeonBranchEnv(input: {
  appPath: string;
  connectionUri: string;
  neonAuthBaseUrl?: string;
  isNextJs?: boolean;
}): Promise<NeonBranchEnvResolution> {
  const cookieSecretUsed = input.isNextJs === true;
  let cookieSecret: string | undefined;
  if (cookieSecretUsed && input.neonAuthBaseUrl) {
    const existing = (await readEnvVarsOrEmpty(input.appPath)).find(
      (v) => v.key === "NEON_AUTH_COOKIE_SECRET",
    )?.value;
    cookieSecret = existing || generateCookieSecret();
  }
  await updateNeonEnvVars({
    appPath: input.appPath,
    connectionUri: input.connectionUri,
    neonAuthBaseUrl: input.neonAuthBaseUrl,
    frameworkType: input.isNextJs ? "nextjs" : null,
    cookieSecret,
  });
  return {
    databaseUrl: input.connectionUri,
    neonAuthBaseUrl: input.neonAuthBaseUrl,
    cookieSecretUsed,
  };
}
