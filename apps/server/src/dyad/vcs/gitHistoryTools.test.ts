// FILE: gitHistoryTools.test.ts
// Purpose: Git history tools against real temp repos (show_commit/show_file
// line ranges/restore round-trip, revision validation, dotenv refusal,
// symlink rejection, non-repo errors).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  ALL_GIT_HISTORY_TOOLS,
  executeGitRestoreFile,
  executeGitShowCommit,
  executeGitShowFile,
  gitRestoreFileTool,
  gitShowCommitTool,
  gitShowFileTool,
} from "./gitHistoryTools.ts";
import { GitToolError } from "./gitTools.ts";

function initRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-githist-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@caide.dev"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Caide Test"], { cwd: dir });
  fs.writeFileSync(path.join(dir, "a.txt"), "one\ntwo\nthree\n");
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["commit", "-m", "first"], { cwd: dir });
  fs.writeFileSync(path.join(dir, "a.txt"), "one\nTWO\nthree\nfour\n");
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["commit", "-m", "second"], { cwd: dir });
  return dir;
}

describe("dyad git history tools", () => {
  it("registers show/restore tools with donor consent previews", () => {
    expect(ALL_GIT_HISTORY_TOOLS.map((t) => t.name)).toEqual([
      "git_show_commit",
      "git_show_file",
      "git_restore_file",
    ]);
    expect(gitShowCommitTool.presentCall?.({ revision: "HEAD", path: "a.txt" })).toBe(
      "Inspect commit HEAD for a.txt",
    );
    expect(gitShowFileTool.presentCall?.({ revision: "HEAD", path: "a.txt" })).toBe(
      "Read a.txt at HEAD",
    );
    expect(gitRestoreFileTool.presentCall?.({ revision: "HEAD~1", path: "a.txt" })).toBe(
      "Restore a.txt from HEAD~1 without staging it",
    );
  });

  it("shows commit metadata + bounded patch, optionally per path", async () => {
    const dir = initRepo();
    const full = await executeGitShowCommit({ revision: "HEAD" }, dir);
    expect(full).toMatch(/1 file\(s\), \+2\/-1/);
    expect(full).toContain("second");
    const scoped = await executeGitShowCommit({ revision: "HEAD", path: "a.txt" }, dir);
    expect(scoped).toContain("second");
  });

  it("reads files at revisions with bounded line ranges", async () => {
    const dir = initRepo();
    const whole = await executeGitShowFile({ revision: "HEAD~1", path: "a.txt" }, dir);
    expect(whole).toContain("lines 1-3 of 3");
    expect(whole).toContain("one\ntwo\nthree");
    const range = await executeGitShowFile(
      {
        revision: "HEAD",
        path: "a.txt",
        start_line_one_indexed: 2,
        end_line_one_indexed_inclusive: 3,
      },
      dir,
    );
    expect(range).toContain("lines 2-3 of 4");
    expect(range).toContain("TWO\nthree");
    await expect(
      executeGitShowFile(
        {
          revision: "HEAD",
          path: "a.txt",
          start_line_one_indexed: 3,
          end_line_one_indexed_inclusive: 2,
        },
        dir,
      ),
    ).rejects.toThrow();
  });

  it("restores a file from a revision without touching the index", async () => {
    const dir = initRepo();
    fs.writeFileSync(path.join(dir, "a.txt"), "working tree edit\n");
    const out = await executeGitRestoreFile({ revision: "HEAD~1", path: "a.txt" }, dir);
    expect(out).toMatch(/Restored a\.txt from HEAD~1 without changing the index/);
    expect(fs.readFileSync(path.join(dir, "a.txt"), "utf-8")).toBe("one\ntwo\nthree\n");
    // Index untouched: nothing staged for a.txt.
    const staged = execFileSync("git", ["diff", "--cached", "--name-only"], { cwd: dir })
      .toString()
      .trim();
    expect(staged).toBe("");
  });

  it("rejects option-like/range revisions, dotenv paths, and symlinks", async () => {
    const dir = initRepo();
    await expect(executeGitShowCommit({ revision: "--help" }, dir)).rejects.toThrow();
    await expect(executeGitShowCommit({ revision: "HEAD..main" }, dir)).rejects.toThrow();
    fs.writeFileSync(path.join(dir, ".env"), "SECRET=1\n");
    execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync("git", ["commit", "-m", "env"], { cwd: dir });
    await expect(
      executeGitShowFile({ revision: "HEAD", path: ".env" }, dir),
    ).rejects.toBeInstanceOf(GitToolError);
    fs.symlinkSync("a.txt", path.join(dir, "link.txt"));
    await expect(
      executeGitRestoreFile({ revision: "HEAD", path: "link.txt" }, dir),
    ).rejects.toBeInstanceOf(GitToolError);
  });

  it("fails structured outside a repo", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-norepo-"));
    await expect(executeGitShowCommit({ revision: "HEAD" }, dir)).rejects.toBeInstanceOf(
      GitToolError,
    );
  });

  it("reports bad revisions accurately (not as missing repos)", async () => {
    const dir = initRepo();
    const err = await executeGitShowCommit({ revision: "deadbee" }, dir).catch((e) => e);
    expect(err).toBeInstanceOf(GitToolError);
    expect(String(err.message)).not.toMatch(/Not a git repository/);
    expect(String(err.message)).toMatch(/exit 128/);
  });

  it("refuses dotenv restore and binary display", async () => {
    const dir = initRepo();
    fs.writeFileSync(path.join(dir, ".env"), "SECRET=1\n");
    execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync("git", ["commit", "-m", "env"], { cwd: dir });
    await expect(
      executeGitRestoreFile({ revision: "HEAD", path: ".env" }, dir),
    ).rejects.toBeInstanceOf(GitToolError);

    fs.writeFileSync(path.join(dir, "blob.bin"), Buffer.from([0, 1, 2, 0, 255, 254]));
    execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync("git", ["commit", "-m", "bin"], { cwd: dir });
    await expect(executeGitShowFile({ revision: "HEAD", path: "blob.bin" }, dir)).rejects.toThrow(
      /inary/,
    );
    // Binary restore round-trips byte-identical.
    fs.unlinkSync(path.join(dir, "blob.bin"));
    await executeGitRestoreFile({ revision: "HEAD", path: "blob.bin" }, dir);
    expect(fs.readFileSync(path.join(dir, "blob.bin"))).toEqual(
      Buffer.from([0, 1, 2, 0, 255, 254]),
    );
  });
});
