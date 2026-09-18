// FILE: envFile.test.ts
// Purpose: .env.local parse/serialize/inject/strip (donor parity).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isSensitiveEnvVarKey,
  parseEnvFile,
  readEnvVarsOrEmpty,
  redactAppEnvVars,
  removeNeonEnvVars,
  resolveRedactedEnvVarUpdates,
  serializeEnvFile,
  updateNeonEnvVars,
  writeEnvFileSecurely,
} from "./envFile.ts";

describe("env file management", () => {
  it("parses quoted values and comments", () => {
    const vars = parseEnvFile('# db url\nDATABASE_URL="postgres://a b#c"\nPLAIN=x\n');
    expect(vars).toMatchObject([
      { key: "DATABASE_URL", value: "postgres://a b#c", description: "db url" },
      { key: "PLAIN", value: "x" },
    ]);
  });

  it("round-trips through serialize", () => {
    const content = 'A=1\n# note\nB="x y"\n';
    expect(serializeEnvFile(parseEnvFile(content))).toBe('A=1\n# note\nB="x y"');
  });

  it("refuses symlinks on secure write", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-env-"));
    const link = path.join(dir, ".env.local");
    fs.symlinkSync(path.join(dir, "target"), link);
    await expect(writeEnvFileSecurely(link, "A=1")).rejects.toThrow(/symbolic link/);
  });

  it("injects Neon vars selectively and strips on remove", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-env-"));
    await updateNeonEnvVars({
      appPath: dir,
      connectionUri: "postgres://user@ep.neon.tech/db",
      neonAuthBaseUrl: "https://ep.auth",
      frameworkType: "website",
      cookieSecret: "s",
    });
    let vars = await readEnvVarsOrEmpty(dir);
    const keys = vars.map((v) => v.key);
    // website (not Next.js): no cookie secret written.
    expect(keys).toEqual(["DATABASE_URL", "POSTGRES_URL", "NEON_AUTH_BASE_URL"]);
    await removeNeonEnvVars(dir);
    vars = await readEnvVarsOrEmpty(dir);
    // .neon.tech-marked generic keys are stripped; nothing else remains here.
    expect(vars).toEqual([]);
  });

  it("keeps hand-rolled Postgres URLs on remove", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-env-"));
    await writeEnvFileSecurely(
      path.join(dir, ".env.local"),
      "DATABASE_URL=postgres://localhost/mine\nNEON_AUTH_BASE_URL=https://ep.auth\n",
    );
    await removeNeonEnvVars(dir);
    const vars = await readEnvVarsOrEmpty(dir);
    expect(vars.map((v) => v.key)).toEqual(["DATABASE_URL"]);
  });

  it("redacts sensitive keys and resolves masked updates", () => {
    expect(isSensitiveEnvVarKey("DATABASE_URL")).toBe(true);
    expect(isSensitiveEnvVarKey("PUBLIC_KEY")).toBe(false);
    const redacted = redactAppEnvVars([{ key: "DATABASE_URL", value: "secret" }]);
    expect(redacted).toEqual([{ key: "DATABASE_URL", value: "••••••••", sensitive: true }]);
    const resolved = resolveRedactedEnvVarUpdates({
      existing: [{ key: "DATABASE_URL", value: "secret" }],
      incoming: [{ key: "DATABASE_URL", value: "••••••••" }],
    });
    expect(resolved).toEqual([{ key: "DATABASE_URL", value: "secret" }]);
    expect(() =>
      resolveRedactedEnvVarUpdates({
        existing: [],
        incoming: [{ key: "DATABASE_URL", value: "••••••••" }],
      }),
    ).toThrow(/masked value/);
  });
});
