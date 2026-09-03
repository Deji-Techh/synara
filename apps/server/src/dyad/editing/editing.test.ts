// FILE: editing.test.ts
// Purpose: M2b gate — fuzzy search/replace engine, markers, safe paths, and
// the file-edit tool batch end to end on a temp workspace.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { ToolContext } from "../../harness/tools/defineTool.ts";
import { escapeSearchReplaceMarkers } from "./markers.ts";
import { safeJoinAppPath, UnsafePathError } from "./safePath.ts";
import { applySearchReplace } from "./searchReplaceProcessor.ts";
import { parseSearchReplaceBlocks } from "./searchReplaceParser.ts";
import {
  ALL_FILE_EDIT_TOOLS,
  copyFileTool,
  deleteFileTool,
  executeMultiReplace,
  executeSearchReplace,
  multiReplaceTool,
  renameFileTool,
  searchReplaceTool,
} from "./fileEditTools.ts";

function workspace(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-edit-"));
  fs.writeFileSync(
    path.join(dir, "app.ts"),
    ["import { x } from './x';", "", "export function hello() {", "  return 'hi';", "}", ""].join("\n"),
  );
  return dir;
}

function toolCtx(appPath: string): ToolContext {
  return {
    signal: AbortSignal.timeout(10_000),
    appPath,
    sessionId: "test-session",
    toolId: "tool-test",
  };
}

describe("dyad editing transplant (m2b)", () => {
  it("registers all five file-edit tools with donor consent previews", () => {
    expect(ALL_FILE_EDIT_TOOLS.map((t) => t.name)).toEqual([
      "search_replace",
      "multi_replace",
      "copy_file",
      "delete_file",
      "rename_file",
    ]);
    expect(searchReplaceTool.presentCall?.({ file_path: "a.ts" })).toBe("Edit a.ts");
    expect(multiReplaceTool.presentCall?.({ file_path: "a.ts", chunks: [{}, {}] })).toBe(
      "Edit a.ts (2 chunks)",
    );
    expect(deleteFileTool.presentCall?.({ path: "a.ts" })).toBe("Delete a.ts");
    expect(renameFileTool.presentCall?.({ from: "a", to: "b" })).toBe("Rename a to b");
    expect(copyFileTool.presentCall?.({ from: "a", to: "b" })).toBe("Copy a to b");
  });

  it("parses blocks and round-trips escaped markers", () => {
    const blocks = parseSearchReplaceBlocks("<<<<<<< SEARCH\nfoo\n=======\nbar\n>>>>>>> REPLACE");
    expect(blocks).toEqual([{ searchContent: "foo", replaceContent: "bar" }]);
    expect(parseSearchReplaceBlocks("no blocks")).toEqual([]);
    const tricky = "=======\nkeep";
    const escaped = escapeSearchReplaceMarkers(tricky);
    expect(escaped).toBe("\\=======\nkeep");
    const ok = applySearchReplace(`${tricky}\nkeep\n`, `<<<<<<< SEARCH\n${escaped}\n=======\n${escaped}\n>>>>>>> REPLACE`);
    expect(ok.success).toBe(true);
  });

  it("matches exact, whitespace-fuzzy, and unicode variants; rejects ambiguity", () => {
    const file = "line one  \nline two\nline three\n";
    const exact = applySearchReplace(file, "<<<<<<< SEARCH\nline two\n=======\nLINE TWO\n>>>>>>> REPLACE");
    expect(exact).toEqual({ success: true, content: "line one  \nLINE TWO\nline three\n" });

    const fuzzy = applySearchReplace(file, "<<<<<<< SEARCH\nline one\n=======\nLINE ONE\n>>>>>>> REPLACE");
    expect(fuzzy.success).toBe(true);
    expect(fuzzy.content).toContain("LINE ONE");

    const smart = applySearchReplace("it’s here\n", "<<<<<<< SEARCH\nit's here\n=======\nIT IS HERE\n>>>>>>> REPLACE");
    expect(smart.success).toBe(true);

    const dup = applySearchReplace("same\nsame\n", "<<<<<<< SEARCH\nsame\n=======\nother\n>>>>>>> REPLACE");
    expect(dup.success).toBe(false);
    expect(dup.error).toMatch(/ambiguous/);

    const missing = applySearchReplace("aaa\n", "<<<<<<< SEARCH\nzzz\n=======\nq\n>>>>>>> REPLACE");
    expect(missing.success).toBe(false);
    expect(missing.error).toMatch(/did not match/);
  });

  it("denies workspace escapes but allows absolute-inside paths", () => {
    const dir = workspace();
    expect(safeJoinAppPath(dir, "sub/../app.ts")).toBe(path.join(dir, "app.ts"));
    expect(safeJoinAppPath(dir, path.join(dir, "app.ts"))).toBe(path.join(dir, "app.ts"));
    expect(() => safeJoinAppPath(dir, "../../etc/passwd")).toThrow(UnsafePathError);
    expect(() => safeJoinAppPath(dir, "/etc/passwd")).toThrow(UnsafePathError);
  });

  it("runs search_replace end to end with donor recovery errors", async () => {
    const dir = workspace();
    const out = await searchReplaceTool.execute(
      {
        file_path: "app.ts",
        old_string: "export function hello() {\n  return 'hi';\n}",
        new_string: "export function hello() {\n  return 'hello';\n}",
      },
      toolCtx(dir),
    );
    expect(out).toBe("Successfully applied edits to app.ts");
    expect(fs.readFileSync(path.join(dir, "app.ts"), "utf8")).toContain("return 'hello';");

    await expect(
      searchReplaceTool.execute(
        { file_path: "app.ts", old_string: "x", new_string: "x" },
        toolCtx(dir),
      ),
    ).rejects.toThrow(/must be different/);
    await expect(
      executeSearchReplace({ file_path: "nope.ts", old_string: "a", new_string: "b" }, dir),
    ).rejects.toThrow(/does not exist/);
    await expect(
      executeSearchReplace({ file_path: "app.ts", old_string: "zzz-nope", new_string: "q" }, dir),
    ).rejects.toThrow(/Recovery: re-read app.ts now/);
  });

  it("runs multi_replace with order/overlap/bounds validation", async () => {
    const dir = workspace();
    const out = await multiReplaceTool.execute(
      {
        file_path: "app.ts",
        chunks: [
          { startLine: 1, endLine: 1, replacementContent: "import { y } from './y';" },
          { startLine: 3, endLine: 4, replacementContent: "export function hello() {\n  return 'yo';\n}" },
        ],
      },
      toolCtx(dir),
    );
    expect(out).toContain("2 edit(s)");
    const content = fs.readFileSync(path.join(dir, "app.ts"), "utf8");
    expect(content).toContain("return 'yo';");

    await expect(
      executeMultiReplace(
        { file_path: "app.ts", chunks: [{ startLine: 3, endLine: 2, replacementContent: "x" }] },
        dir,
      ),
    ).rejects.toThrow(/startLine <= endLine/);
    await expect(
      executeMultiReplace(
        {
          file_path: "app.ts",
          chunks: [
            { startLine: 1, endLine: 3, replacementContent: "x" },
            { startLine: 2, endLine: 4, replacementContent: "y" },
          ],
        },
        dir,
      ),
    ).rejects.toThrow(/overlap/);
    await expect(
      executeMultiReplace(
        { file_path: "app.ts", chunks: [{ startLine: 1, endLine: 999, replacementContent: "x" }] },
        dir,
      ),
    ).rejects.toThrow(/exceeds file length/);
  });

  it("runs copy/rename/delete with traversal guards", async () => {
    const dir = workspace();
    const copied = await copyFileTool.execute({ from: "app.ts", to: "bak/app.ts" }, toolCtx(dir));
    expect(copied).toContain("bak/app.ts");
    expect(fs.existsSync(path.join(dir, "bak/app.ts"))).toBe(true);
    await expect(
      copyFileTool.execute({ from: "../../etc/passwd", to: "x" }, toolCtx(dir)),
    ).rejects.toThrow(UnsafePathError);

    const renamed = await renameFileTool.execute({ from: "bak/app.ts", to: "bak/app2.ts" }, toolCtx(dir));
    expect(renamed).toContain("app2.ts");
    await expect(
      renameFileTool.execute({ from: "bak/app2.ts", to: "app.ts" }, toolCtx(dir)),
    ).rejects.toThrow(/already exists/);

    const deleted = await deleteFileTool.execute({ path: "bak/app2.ts" }, toolCtx(dir));
    expect(deleted).toBe("Deleted bak/app2.ts");
    await expect(deleteFileTool.execute({ path: "bak" }, toolCtx(dir))).rejects.toThrow(
      /Not a file/,
    );
  });
});
