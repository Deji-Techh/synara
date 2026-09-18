// FILE: vercelEnvSync.ts
// Purpose: Neon → Vercel env sync correctness (production-only targets,
// trusted-domain allowlist diff, keys-only preview, owned-key removal).
// Donor: dyad x caide src/ipc/utils/vercel_neon_sync_helpers.ts (pure
// helpers verbatim) + vercel_neon_sync.ts orchestration semantics. The V2
// vercelApi.syncNeonEnvToVercel all-three-targets upsert was wrong per
// 012 §2 — production-only is the donor default.

export type VercelEnvTarget = "production" | "preview" | "development";

/**
 * Donor VERCEL_ENV_TARGETS parity: production ONLY. The synced DATABASE_URL
 * is usually the production branch — exposing it to preview/development
 * (e.g. via `vercel env pull`) makes accidental production mutation easy.
 */
export const VERCEL_ENV_TARGETS: VercelEnvTarget[] = ["production"];

/** Env keys this sync owns (never POSTGRES_URL on Vercel). */
export const NEON_VERCEL_ENV_KEYS = [
  "DATABASE_URL",
  "NEON_AUTH_BASE_URL",
  "NEON_AUTH_COOKIE_SECRET",
] as const;

export interface VercelEnvVar {
  key: string;
  value: string;
  type: "encrypted";
  target: VercelEnvTarget[];
}

/** The resolved Neon branch values that feed the Vercel env payload. */
export interface NeonBranchEnvValues {
  databaseUrl: string;
  neonAuthBaseUrl?: string;
  neonAuthCookieSecret?: string;
  isNextJs: boolean;
}

/**
 * Donor buildVercelEnvPayload parity: always DATABASE_URL (POSTGRES_URL is
 * intentionally NOT pushed); NEON_AUTH_BASE_URL when auth is active;
 * NEON_AUTH_COOKIE_SECRET Next.js-only (its only consumer).
 */
export function buildVercelEnvPayload(
  vars: NeonBranchEnvValues,
  { target }: { target: readonly VercelEnvTarget[] },
): VercelEnvVar[] {
  const targetArr = [...target];
  const payload: VercelEnvVar[] = [
    { key: "DATABASE_URL", value: vars.databaseUrl, type: "encrypted", target: targetArr },
  ];
  if (vars.neonAuthBaseUrl) {
    payload.push({
      key: "NEON_AUTH_BASE_URL",
      value: vars.neonAuthBaseUrl,
      type: "encrypted",
      target: targetArr,
    });
    if (vars.isNextJs && vars.neonAuthCookieSecret) {
      payload.push({
        key: "NEON_AUTH_COOKIE_SECRET",
        value: vars.neonAuthCookieSecret,
        type: "encrypted",
        target: targetArr,
      });
    }
  }
  return payload;
}

/**
 * Donor canonicalOrigin parity: canonical `https://<host>` for comparison.
 * Null for empty/wildcard values (which can't be redirect URIs).
 */
export function canonicalOrigin(value: string): string | null {
  if (!value) return null;
  let host = value.trim();
  if (!host) return null;
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  host = host.split(/[/?#]/)[0] ?? "";
  host = host.toLowerCase();
  if (!host || host.includes("*")) return null;
  return `https://${host}`;
}

/**
 * Donor reconcileTrustedDomains parity: diffs Vercel domains against the
 * existing Neon trusted-domain allowlist; returns canonical origins to add
 * (deduped, missing only).
 */
export function reconcileTrustedDomains(
  existingNeonDomains: string[],
  desiredVercelHosts: string[],
): string[] {
  const existing = new Set<string>();
  for (const d of existingNeonDomains) {
    const origin = canonicalOrigin(d);
    if (origin) existing.add(origin);
  }
  const toAdd: string[] = [];
  const seen = new Set<string>();
  for (const host of desiredVercelHosts) {
    const origin = canonicalOrigin(host);
    if (!origin || existing.has(origin) || seen.has(origin)) continue;
    seen.add(origin);
    toAdd.push(origin);
  }
  return toAdd;
}
