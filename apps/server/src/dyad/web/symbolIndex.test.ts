// FILE: symbolIndex.test.ts
// Purpose: C10 gate — definitions, cross-file references, mtime rebuild,
// cache hits, clearing.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildWorkspaceIndex,
  clearSymbolIndexes,
  indexStats,
  queryIndex,
} from "./symbolIndex.ts";
import { lookupSymbol } from "./codeSearch.ts";

function workspace(): { dir: string; files: string[] } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-idx-"));
  const auth = path.join(dir, "auth.ts");
  const index = path.join(dir, "index.ts");
  fs.writeFileSync(
    auth,
    "export function signIn(email: string) {\n  return authenticate(email);\n}\n\nexport class AuthSession {}\n",
  );
  fs.writeFileSync(index, "import { signIn } from './auth';\nconsole.log(signIn);\n");
  return { dir, files: [auth, index] };
}

describe("dyad symbol index (c10)", () => {
  it("indexes definitions and cross-file references", () => {
    clearSymbolIndexes();
    const { dir, files } = workspace();
    const first = buildWorkspaceIndex(dir, files);
    expect(first.rebuilt).toBe(true);
    expect(first.symbols).toBeGreaterThan(2);

    const defs = queryIndex(dir, "signIn", 10);
    expect(defs[0]).toMatchObject({ path: "auth.ts", line: 1, kind: "definition" });
    expect(defs.some((d) => d.kind === "reference" && d.path === "index.ts")).toBe(true);

    const cls = queryIndex(dir, "AuthSession", 10);
    expect(cls[0].kind).toBe("definition");

    // Unchanged tree serves from cache.
    const second = buildWorkspaceIndex(dir, files);
    expect(second.rebuilt).toBe(false);
    expect(indexStats(dir)?.files).toBe(2);

    // Touching a file rebuilds.
    fs.appendFileSync(files[0], "\n// touch\n");
    const third = buildWorkspaceIndex(dir, files);
    expect(third.rebuilt).toBe(true);
    clearSymbolIndexes();
    expect(indexStats(dir)).toBeUndefined();
  });

  it("serves lookupSymbol from the index with the same shape", async () => {
    clearSymbolIndexes();
    const { dir } = workspace();
    const defs = await lookupSymbol(dir, "signIn");
    expect(defs[0]).toMatchObject({ path: "auth.ts", line: 1, kind: "definition" });
    expect(await lookupSymbol(dir, "nope-missing")).toEqual([]);
    clearSymbolIndexes();
  });
});
