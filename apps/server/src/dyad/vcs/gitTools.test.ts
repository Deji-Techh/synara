// FILE: gitTools.test.ts
// Purpose: M2b gate — git tools against real temp repos (status/diff/log/
// commit, renames, empty states, non-repo + nothing-to-commit errors).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import type { ToolContext } from "../../harness/tools/defineTool.ts";
import {
  ALL_GIT_TOOLS,
  executeGitCommit,
  executeGitDiff,
  executeGitLog,
  executeGitStatus,
  gitCommitTool,
  gitDiffTool,
  GitToolError,
} from "./gitTools.ts";

function toolCtx(appPath: string): ToolContext {
  return {
    signal: AbortSignal.timeout(15_000),
    appPath,
    sessionId: "test-session",
    toolId: "tool-test",
  };
}

function initRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-git-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@caide.dev"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Caide Test"], { cwd: dir });
  fs.writeFileSync(path.join(dir, "a.txt"), "one\n");
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["commit", "-m", "first"], { cwd: dir });
  return dir;
}

describe("dyad git tools transplant (m2b)", () => {
  it("registers all four git tools with donor consent previews", () => {
    expect(ALL_GIT_TOOLS.map((t) => t.name)).toEqual([
      "git_status",
      "git_diff",
      "git_log",
      "git_commit",
    ]);
    expect(gitCommitTool.presentCall?.({ message: "hi" })).toBe('git commit -m "hi"');
    expect(gitDiffTool.presentCall?.({ path: "a.txt" })).toBe("git diff a.txt");
  });

  it("tracks the full checkpoint flow: status → diff → commit → log", async () => {
    const dir = initRepo();
    expect(await executeGitStatus(dir)).toBe("Working tree clean — no uncommitted changes.");

    fs.writeFileSync(path.join(dir, "a.txt"), "one\ntwo\n");
    fs.writeFileSync(path.join(dir, "b.txt"), "new\n");
    const status = await executeGitStatus(dir);
    expect(status).toContain("2 file(s)");
    expect(status).toContain("M  a.txt");
    expect(status).toContain("?  b.txt");

    const diff = await executeGitDiff({}, dir);
    expect(diff).toContain("+two");

    const committed = await gitCommitTool.execute(
      { message: "second", stage_all: true },
      toolCtx(dir),
    );
    expect(committed).toMatch(/^Created commit [0-9a-f]{40}: second$/);

    const log = await executeGitLog({ limit: 5 }, dir);
    expect(log).toContain("second");
    expect(log).toContain("first");
    expect(await executeGitStatus(dir)).toBe("Working tree clean — no uncommitted changes.");
  });

  it("reports renames, staged diffs, and empty states", async () => {
    const dir = initRepo();
    fs.renameSync(path.join(dir, "a.txt"), path.join(dir, "renamed.txt"));
    execFileSync("git", ["add", "-A"], { cwd: dir });
    expect(await executeGitStatus(dir)).toContain("R  renamed.txt");
    expect(await executeGitDiff({ staged: true }, dir)).toContain("renamed");
    expect(await executeGitDiff({}, dir)).toBe("No unstaged changes in working tree.");
  });

  it("fails structured outside repos and on nothing-to-commit", async () => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), "caide-plain-"));
    await expect(executeGitStatus(plain)).rejects.toThrow(GitToolError);
    await expect(executeGitStatus(plain)).rejects.toThrow(/Not a git repository/);

    const dir = initRepo();
    await expect(executeGitCommit({ message: "empty" }, dir)).rejects.toThrow(
      /Nothing to commit/,
    );
  });
});
