// FILE: projectPackage.test.ts
// Purpose: CAIDEPKG export → inspect → import round-trip (workspace + git
// history + secret exclusion).

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  exportProjectPackage,
  importProjectPackage,
  inspectProjectPackage,
} from "./projectPackage.ts";

function fixture(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-pkg-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@t.dev"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
  fs.writeFileSync(path.join(dir, ".gitignore"), "node_modules/\n.caide/\n");
  fs.writeFileSync(path.join(dir, "a.txt"), "v1\n");
  fs.writeFileSync(path.join(dir, ".env"), "SECRET=1\n");
  fs.mkdirSync(path.join(dir, ".caide"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".caide", "APP_MEMORY.md"), "# memory\n");
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["commit", "-m", "init"], { cwd: dir });
  return dir;
}

describe("project packages", () => {
  it("exports, inspects, and imports with git history", async () => {
    const dir = fixture();
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-pkg-out-"));
    const exported = await exportProjectPackage({
      appPath: dir,
      projectName: "Demo App",
      destination: path.join(outDir, "demo.caidepkg"),
    });
    expect(exported.path.endsWith(".caidepkg")).toBe(true);
    expect(exported.manifest.includes.gitHistory).toBe(true);
    expect(exported.securityReport.excludedFiles).toContain(".env");

    const inspected = await inspectProjectPackage(exported.path);
    expect(inspected.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(inspected.manifest.projectName).toBe("Demo-App");

    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "caide-pkg-import-"));
    const imported = await importProjectPackage({
      packagePath: exported.path,
      workspaceRoot,
    });
    expect(imported.gitRestored).toBe(true);
    expect(fs.readFileSync(path.join(imported.appPath, "a.txt"), "utf8")).toBe("v1\n");
    // .caide state travels with the package despite the gitignore.
    expect(fs.readFileSync(path.join(imported.appPath, ".caide", "APP_MEMORY.md"), "utf8")).toBe(
      "# memory\n",
    );
    // Secrets never travel.
    expect(fs.existsSync(path.join(imported.appPath, ".env"))).toBe(false);
    const log = execFileSync("git", ["log", "--oneline"], { cwd: imported.appPath }).toString();
    expect(log).toContain("init");
  });
});
