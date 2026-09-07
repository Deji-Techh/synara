// FILE: connections.test.ts
// Purpose: Project-scoped DB persistence — session link wins, app link
// survives across chats in the same project (0600, tokens never on disk),
// never leaks across projects.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  clearAppLinkCache,
  DbNotConnectedError,
  getAppDatabaseLink,
  linkAppDatabase,
  linkDatabase,
  resolveDatabaseUrl,
  unlinkAppDatabase,
  unlinkDatabase,
} from "./connections.ts";

function appDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "caide-dblink-"));
}

describe("project-scoped database links", () => {
  it("prefers session links, falls back to the app link, then env files", () => {
    const dir = appDir();
    clearAppLinkCache();
    linkDatabase("s1", { provider: "neon", databaseUrl: "postgres://session/db" });
    linkAppDatabase(dir, { provider: "supabase", databaseUrl: "postgres://app/db" });
    try {
      expect(resolveDatabaseUrl(dir, "s1")).toMatchObject({
        databaseUrl: "postgres://session/db",
        source: "session-link",
      });
      expect(resolveDatabaseUrl(dir, "s2")).toMatchObject({
        databaseUrl: "postgres://app/db",
        source: "app-link",
      });
      // Fresh cache still resolves from disk (persists across restarts).
      clearAppLinkCache();
      expect(resolveDatabaseUrl(dir, "s2")).toMatchObject({ source: "app-link" });
    } finally {
      unlinkDatabase("s1");
      unlinkAppDatabase(dir);
      clearAppLinkCache();
    }
  });

  it("never leaks links across projects", () => {
    const a = appDir();
    const b = appDir();
    clearAppLinkCache();
    linkAppDatabase(a, { provider: "supabase", databaseUrl: "postgres://a/db" });
    try {
      expect(getAppDatabaseLink(b)).toBeUndefined();
      expect(() => resolveDatabaseUrl(b, "s-x")).toThrow(DbNotConnectedError);
    } finally {
      unlinkAppDatabase(a);
      clearAppLinkCache();
    }
  });

  it("stores 0600 files without management tokens", () => {
    const dir = appDir();
    clearAppLinkCache();
    linkAppDatabase(dir, {
      provider: "neon",
      databaseUrl: "postgres://t/db",
      managementToken: "secret-token",
    });
    try {
      const raw = fs.readFileSync(path.join(dir, ".caide", "db-link.json"), "utf8");
      expect(raw).not.toContain("secret-token");
      expect(raw).not.toContain("managementToken");
      expect(fs.statSync(path.join(dir, ".caide", "db-link.json")).mode & 0o777).toBe(0o600);
      expect(getAppDatabaseLink(dir)?.managementToken).toBeUndefined();
      // Corrupt files read as unlinked, never throw.
      fs.writeFileSync(path.join(dir, ".caide", "db-link.json"), "{bad");
      clearAppLinkCache();
      expect(getAppDatabaseLink(dir)).toBeUndefined();
    } finally {
      unlinkAppDatabase(dir);
      clearAppLinkCache();
    }
  });
});
