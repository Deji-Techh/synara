// FILE: frameworkType.test.ts
// Purpose: Disk framework-type + Next.js-major detection (donor parity:
// nextjs via config or dep, vite vs vite-nitro via nitro config/dep,
// "other" fallback, null-safety, non-numeric next versions).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { detectFrameworkType, detectNextJsMajorVersion } from "./frameworkType.ts";

function dir(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "caide-fwtype-"));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(root, name), content);
  }
  return root;
}

describe("detectFrameworkType (donor parity)", () => {
  it("detects nextjs via config file", () => {
    expect(detectFrameworkType(dir({ "next.config.mjs": "" }))).toBe("nextjs");
  });

  it("detects nextjs via dependency", () => {
    const root = dir({
      "package.json": JSON.stringify({ dependencies: { next: "^14.2.0" } }),
    });
    expect(detectFrameworkType(root)).toBe("nextjs");
  });

  it("detects vite vs vite-nitro", () => {
    expect(detectFrameworkType(dir({ "vite.config.ts": "" }))).toBe("vite");
    expect(detectFrameworkType(dir({ "vite.config.ts": "", "nitro.config.ts": "" }))).toBe(
      "vite-nitro",
    );
    const dep = dir({
      "package.json": JSON.stringify({ devDependencies: { vite: "^6.0.0", nitro: "^2.0.0" } }),
    });
    expect(detectFrameworkType(dep)).toBe("vite-nitro");
  });

  it("falls back to other, never throws", () => {
    expect(detectFrameworkType(dir({ "README.md": "" }))).toBe("other");
    expect(detectFrameworkType(path.join(os.tmpdir(), "caide-fwtype-missing"))).toBe("other");
  });
});

describe("detectNextJsMajorVersion (donor parity)", () => {
  it("reads the major from deps or devDeps", () => {
    const root = dir({
      "package.json": JSON.stringify({ dependencies: { next: "^15.1.3" } }),
    });
    expect(detectNextJsMajorVersion(root)).toBe(15);
  });

  it("returns null for missing/non-numeric versions", () => {
    expect(detectNextJsMajorVersion(dir({}))).toBeNull();
    const latest = dir({
      "package.json": JSON.stringify({ dependencies: { next: "latest" } }),
    });
    expect(detectNextJsMajorVersion(latest)).toBeNull();
    const canary = dir({
      "package.json": JSON.stringify({ devDependencies: { next: "canary" } }),
    });
    expect(detectNextJsMajorVersion(canary)).toBeNull();
  });
});
