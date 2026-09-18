// FILE: vercelEnvSync.test.ts
// Purpose: Env-sync correctness rules (donor helper parity).

import { describe, expect, it } from "vitest";
import {
  buildVercelEnvPayload,
  canonicalOrigin,
  reconcileTrustedDomains,
  VERCEL_ENV_TARGETS,
} from "./vercelEnvSync.ts";

describe("vercel env sync rules", () => {
  it("targets production only", () => {
    expect(VERCEL_ENV_TARGETS).toEqual(["production"]);
  });

  it("builds DATABASE_URL always, auth vars conditionally", () => {
    const base = buildVercelEnvPayload(
      { databaseUrl: "postgres://x", isNextJs: false },
      { target: VERCEL_ENV_TARGETS },
    );
    expect(base.map((v) => v.key)).toEqual(["DATABASE_URL"]);
    const auth = buildVercelEnvPayload(
      {
        databaseUrl: "postgres://x",
        neonAuthBaseUrl: "https://ep.auth",
        neonAuthCookieSecret: "s",
        isNextJs: true,
      },
      { target: VERCEL_ENV_TARGETS },
    );
    expect(auth.map((v) => v.key)).toEqual([
      "DATABASE_URL",
      "NEON_AUTH_BASE_URL",
      "NEON_AUTH_COOKIE_SECRET",
    ]);
    // Non-Next.js never gets the cookie secret (its only consumer).
    const web = buildVercelEnvPayload(
      {
        databaseUrl: "postgres://x",
        neonAuthBaseUrl: "https://ep.auth",
        neonAuthCookieSecret: "s",
        isNextJs: false,
      },
      { target: VERCEL_ENV_TARGETS },
    );
    expect(web.map((v) => v.key)).toEqual(["DATABASE_URL", "NEON_AUTH_BASE_URL"]);
  });

  it("canonicalizes origins and diffs trusted domains", () => {
    expect(canonicalOrigin("https://Shop.Vercel.app/path?q=1")).toBe("https://shop.vercel.app");
    expect(canonicalOrigin("*.vercel.app")).toBeNull();
    expect(canonicalOrigin("")).toBeNull();
    expect(
      reconcileTrustedDomains(
        ["https://shop.vercel.app"],
        ["shop.vercel.app", "api.shop.vercel.app", "https://shop.vercel.app/"],
      ),
    ).toEqual(["https://api.shop.vercel.app"]);
  });
});
