// FILE: shareStore.test.ts
// Purpose: Share-grant lifecycle — mint, resolve, expiry, revoke, listing.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  listShareGrants,
  mintShareGrant,
  resetShareStores,
  resolveShareGrant,
  revokeShareGrant,
} from "./shareStore.ts";
import { listSharesTool, revokeShareTool, shareArtifactTool } from "./shareTools.ts";

function toolCtx(appPath: string) {
  return {
    signal: AbortSignal.timeout(5000),
    appPath,
    sessionId: "s-share",
    toolId: "t-share",
  };
}

describe("share grants (item 38)", () => {
  let home = "";
  let file = "";
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "caide-share-home-"));
    file = path.join(home, "shares.json");
    process.env.CAIDE_SHARES_PATH = file;
    resetShareStores();
  });
  afterEach(() => {
    delete process.env.CAIDE_SHARES_PATH;
    resetShareStores();
  });

  it("mints, resolves, expires, and revokes", () => {
    const grant = mintShareGrant("/app", "dist/app.apk", { expiresInDays: 7, note: "beta", filePath: file });
    expect(grant.token).toMatch(/^[0-9a-f]{32}$/);
    expect(grant.expiresAtMs - grant.createdAt).toBe(7 * 86_400_000);
    expect(resolveShareGrant(grant.token, { filePath: file })).toMatchObject({ relPath: "dist/app.apk" });
    // Expired grants resolve to null and prune.
    expect(resolveShareGrant(grant.token, { filePath: file, nowMs: grant.expiresAtMs + 1 })).toBeNull();
    const g2 = mintShareGrant("/app", "a.png", { filePath: file });
    expect(listShareGrants("/app", file)).toHaveLength(1);
    expect(revokeShareGrant(g2.token, file)).toBe(true);
    expect(revokeShareGrant(g2.token, file)).toBe(false);
    expect(listShareGrants("/app", file)).toHaveLength(0);
  });

  it("clamps TTL to 1-30 days", () => {
    const g = mintShareGrant("/app", "a.png", { expiresInDays: 99, filePath: file });
    expect(g.expiresAtMs - g.createdAt).toBe(30 * 86_400_000);
    const g2 = mintShareGrant("/app", "b.png", { expiresInDays: 0, filePath: file });
    expect(g2.expiresAtMs - g2.createdAt).toBe(1 * 86_400_000);
  });

  it("share_artifact rejects paths outside the app", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-share-app-"));
    await expect(
      shareArtifactTool.execute({ path: "../escape.txt" }, toolCtx(dir)),
    ).rejects.toThrow(/not a file under the app/);
    await expect(
      shareArtifactTool.execute({ path: "missing.png" }, toolCtx(dir)),
    ).rejects.toThrow(/not a file under the app/);
  });

  it("share_artifact mints a link and list/revoke round-trip", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-share-app-"));
    fs.writeFileSync(path.join(dir, "hero.png"), "bytes");
    process.env.CAIDE_PUBLIC_BASE_URL = "http://example.test:1234";
    try {
      const out = (await shareArtifactTool.execute(
        { path: "hero.png", expiresInDays: 3, note: "hero" },
        toolCtx(dir),
      )) as string;
      expect(out).toContain("http://example.test:1234/api/share?token=");
      expect(out).toContain("expires in 3 days");
      const listed = (await listSharesTool.execute({}, toolCtx(dir))) as string;
      expect(listed).toContain("hero.png");
      expect(listed).toContain("hero");
      const token = listed.match(/- ([0-9a-f]{8})…/)?.[1] ?? "";
      expect(token).toHaveLength(8);
      expect(await revokeShareTool.execute({ token }, toolCtx(dir))).toContain("revoked");
      expect(await listSharesTool.execute({}, toolCtx(dir))).toContain("No active share links");
    } finally {
      delete process.env.CAIDE_PUBLIC_BASE_URL;
    }
  });

  it("presents countable calls", () => {
    expect(shareArtifactTool.presentCall?.({ path: "a.png" })).toBe("Share a.png");
    expect(revokeShareTool.presentCall?.({})).toBe("Revoke share link");
    expect(listSharesTool.presentCall?.({})).toBe("List share links");
  });
});
