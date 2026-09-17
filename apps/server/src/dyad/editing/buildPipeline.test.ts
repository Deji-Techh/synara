// FILE: buildPipeline.test.ts
// Purpose: 008-m9a gate — pure build-tag pipeline (dry-run + apply order)
// on temp workspaces. No provider, DB, or git involved.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyBuildResponseTags,
  dryRunSearchReplaceTags,
  normalizeTestPath,
} from "./buildPipeline.ts";

function workspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-pipeline-"));
  fs.writeFileSync(path.join(dir, "app.ts"), "line one\nline two\nline three\n");
  fs.writeFileSync(path.join(dir, "old.ts"), "to be renamed\n");
  fs.writeFileSync(path.join(dir, "gone.ts"), "to be deleted\n");
  fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
  fs.writeFileSync(path.join(dir, "assets", "logo.svg"), "<svg/>\n");
  return dir;
}

const read = (dir: string, rel: string): string => fs.readFileSync(path.join(dir, rel), "utf8");

describe("normalizeTestPath (donor verbatim logic)", () => {
  it("forces paths under tests/ with a spec extension", () => {
    expect(normalizeTestPath("login")).toBe("tests/login.spec.ts");
    expect(normalizeTestPath("tests/login.spec.ts")).toBe("tests/login.spec.ts");
    // Donor keeps the infix: only the final known extension is stripped.
    expect(normalizeTestPath("checkout.test.ts")).toBe("tests/checkout.test.spec.ts");
  });

  it("neutralizes traversal and empties", () => {
    expect(normalizeTestPath("../../etc/passwd")).toBe("tests/etc/passwd.spec.ts");
    expect(normalizeTestPath("")).toBe("tests/generated.spec.ts");
    expect(normalizeTestPath("tests")).toBe("tests/generated.spec.ts");
  });
});

describe("dryRunSearchReplaceTags", () => {
  it("reports missing targets and unappliable diffs, passes good ones", async () => {
    const dir = workspace();
    const response = [
      '<dyad-search-replace path="app.ts">',
      "<<<<<<< SEARCH",
      "line two",
      "=======",
      "LINE TWO",
      ">>>>>>> REPLACE",
      "</dyad-search-replace>",
      '<dyad-search-replace path="missing.ts">',
      "<<<<<<< SEARCH",
      "x",
      "=======",
      "y",
      ">>>>>>> REPLACE",
      "</dyad-search-replace>",
      '<dyad-search-replace path="app.ts">',
      "<<<<<<< SEARCH",
      "no such line here",
      "=======",
      "y",
      ">>>>>>> REPLACE",
      "</dyad-search-replace>",
    ].join("\n");
    const issues = await dryRunSearchReplaceTags(response, dir);
    expect(issues).toHaveLength(2);
    expect(issues.map((i) => i.filePath).sort()).toEqual(["app.ts", "missing.ts"]);
  });

  it("flags unsafe paths without throwing", async () => {
    const dir = workspace();
    const issues = await dryRunSearchReplaceTags(
      '<dyad-search-replace path="../evil.ts"><<<<<<< SEARCH\nx\n=======\ny\n>>>>>>> REPLACE</dyad-search-replace>',
      dir,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.filePath).toBe("../evil.ts");
  });
});

describe("applyBuildResponseTags (donor order)", () => {
  it("deletes, renames, edits, copies, writes, and generates tests", async () => {
    const dir = workspace();
    const response = [
      '<dyad-delete path="gone.ts" />',
      '<dyad-rename from="old.ts" to="new.ts"></dyad-rename>',
      '<dyad-search-replace path="app.ts">',
      "<<<<<<< SEARCH",
      "line two",
      "=======",
      "LINE TWO",
      ">>>>>>> REPLACE",
      "</dyad-search-replace>",
      '<dyad-copy from="assets/logo.svg" to="public/logo.svg" />',
      '<dyad-write path="src/fresh.ts">export const fresh = 1;\n</dyad-write>',
      '<dyad-generate-test path="login">test("x", () => {});\n</dyad-generate-test>',
    ].join("\n");
    const result = await applyBuildResponseTags(response, dir);
    expect(result.errors).toEqual([]);
    expect(result.hasChanges).toBe(true);
    expect(result.deletedFiles).toEqual(["gone.ts"]);
    expect(result.renamedFiles).toEqual(["new.ts"]);
    expect(fs.existsSync(path.join(dir, "gone.ts"))).toBe(false);
    expect(read(dir, "new.ts")).toBe("to be renamed\n");
    expect(read(dir, "app.ts")).toContain("LINE TWO");
    expect(read(dir, "public/logo.svg")).toBe("<svg/>\n");
    // Tag content is trimmed by the parser (donor); file has no trailing newline.
    expect(read(dir, "src/fresh.ts")).toBe("export const fresh = 1;");
    expect(read(dir, "tests/login.spec.ts")).toContain('test("x"');
    expect(result.writtenFiles).toEqual(
      expect.arrayContaining(["app.ts", "public/logo.svg", "src/fresh.ts", "tests/login.spec.ts"]),
    );
  });

  it("parses caide- aliases and dedupes sibling test tags", async () => {
    const dir = workspace();
    const response = [
      '<caide-write path="a.ts">const a = 1;\n</caide-write>',
      '<dyad-generate-test path="same">one\n</dyad-generate-test>',
      '<dyad-generate-test path="same">two\n</dyad-generate-test>',
    ].join("\n");
    const result = await applyBuildResponseTags(response, dir);
    expect(read(dir, "a.ts")).toBe("const a = 1;");
    expect(read(dir, "tests/same.spec.ts")).toBe("one");
    expect(read(dir, "tests/same-2.spec.ts")).toBe("two");
    expect(result.errors).toEqual([]);
  });

  it("skips search-replace misses silently but records copy/write failures", async () => {
    const dir = workspace();
    const response = [
      '<dyad-search-replace path="app.ts">',
      "<<<<<<< SEARCH",
      "absent line",
      "=======",
      "y",
      ">>>>>>> REPLACE",
      "</dyad-search-replace>",
      '<dyad-search-replace path="missing.ts">',
      "<<<<<<< SEARCH",
      "x",
      "=======",
      "y",
      ">>>>>>> REPLACE",
      "</dyad-search-replace>",
      '<dyad-copy from="nope.ts" to="dest.ts" />',
      '<dyad-write path="../evil.ts">x</dyad-write>',
    ].join("\n");
    const result = await applyBuildResponseTags(response, dir);
    expect(result.hasChanges).toBe(false);
    expect(result.writtenFiles).toEqual([]);
    expect(result.errors.map((e) => e.message)).toEqual(
      expect.arrayContaining([
        "Failed to copy nope.ts to dest.ts",
        "Refusing to write unsafe path: ../evil.ts",
      ]),
    );
    expect(fs.existsSync(path.join(dir, "evil.ts"))).toBe(false);
  });

  it("reports no changes for a tag-free response", async () => {
    const dir = workspace();
    const result = await applyBuildResponseTags("Just some chat text.", dir);
    expect(result).toMatchObject({ hasChanges: false, errors: [] });
  });
});
