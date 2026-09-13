// FILE: effectForkCompat.test.ts
// Purpose: Guard the effect-smol fork constraint that burned two debug
// cycles: `Effect.catchAll` / `Effect.catchAllCause` are declared in types
// but ABSENT at runtime. Any src usage throws `... is not a function`,
// masking the real error underneath. Use `Effect.orElseSucceed` (or
// `Effect.catchCause`) instead. This test scans the monorepo src so the
// trap can never be reintroduced by any package.

import * as fs from "node:fs";
import * as path from "node:path";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const SCAN_ROOTS = [
  "apps/server/src",
  "apps/web/src",
  "packages/contracts/src",
  "packages/shared/src",
];
const SCAN_EXTS = new Set([".ts", ".tsx"]);
const FORBIDDEN = /(?<![A-Za-z0-9_$])Effect\.catchAll(Cause)?\s*\(/;

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (SCAN_EXTS.has(path.extname(entry.name))) yield full;
  }
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
}

describe("effect-smol fork compatibility", () => {
  it("provides the replacement APIs at runtime", () => {
    expect(typeof Effect.orElseSucceed).toBe("function");
    expect(typeof Effect.catchCause).toBe("function");
  });

  it("documents the missing APIs (declared in types, absent at runtime)", () => {
    expect((Effect as unknown as Record<string, unknown>).catchAll).toBeUndefined();
    expect((Effect as unknown as Record<string, unknown>).catchAllCause).toBeUndefined();
  });

  it("has no runtime Effect.catchAll/catchAllCause calls in monorepo src", () => {
    const offenders: string[] = [];
    for (const root of SCAN_ROOTS) {
      const dir = path.join(REPO_ROOT, root);
      if (!fs.existsSync(dir)) continue;
      for (const file of walk(dir)) {
        if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;
        const lines = fs.readFileSync(file, "utf8").split("\n");
        lines.forEach((line, i) => {
          if (!isCommentLine(line) && FORBIDDEN.test(line)) offenders.push(`${file}:${i + 1}`);
        });
      }
    }
    expect(offenders).toEqual([]);
  });
});
