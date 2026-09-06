// FILE: preCommitTools.test.ts
// Purpose: run_pre_commit detection + staging + per-turn run limit against
// real temp repos (husky pass/fail, no-hook message, limit + reset).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  ALL_PRE_COMMIT_TOOLS,
  executeRunPreCommit,
  MAX_PRE_COMMIT_RUNS_PER_TURN,
  resetPreCommitCount,
  runPreCommitTool,
} from "./preCommitTools.ts";

function initRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-precommit-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@caide.dev"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Caide Test"], { cwd: dir });
  fs.writeFileSync(path.join(dir, "a.txt"), "one\n");
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["commit", "-m", "first"], { cwd: dir });
  return dir;
}

function addHuskyHook(dir: string, body: string): void {
  fs.mkdirSync(path.join(dir, ".husky"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".husky", "pre-commit"), body, { mode: 0o755 });
}

describe("dyad run_pre_commit tool", () => {
  it("registers with donor consent preview", () => {
    expect(ALL_PRE_COMMIT_TOOLS.map((t) => t.name)).toEqual(["run_pre_commit"]);
    expect(runPreCommitTool.presentCall?.({})).toBe("Stage all changes and run the pre-commit hook");
  });

  it("reports unavailable when no hook is configured", async () => {
    const dir = initRepo();
    const out = await executeRunPreCommit(dir, "s-nohook");
    expect(out).toMatch(/unavailable/);
  });

  it("stages changes and runs a passing husky hook", async () => {
    const dir = initRepo();
    addHuskyHook(dir, "#!/bin/sh\nexit 0\n");
    fs.writeFileSync(path.join(dir, "a.txt"), "one\ntwo\n");
    const out = await executeRunPreCommit(dir, "s-pass");
    expect(out).toMatch(/passed \(husky\)/);
    // Staged by the tool.
    const staged = execFileSync("git", ["diff", "--cached", "--name-only"], { cwd: dir })
      .toString()
      .trim();
    expect(staged).toContain("a.txt");
  });

  it("returns hook failure output for the model to fix", async () => {
    const dir = initRepo();
    addHuskyHook(dir, "#!/bin/sh\necho 'lint says no'\nexit 1\n");
    const out = await executeRunPreCommit(dir, "s-fail");
    expect(out).toMatch(/FAILED/);
    expect(out).toContain("lint says no");
  });

  it(`stops after ${MAX_PRE_COMMIT_RUNS_PER_TURN} runs per turn until reset`, async () => {
    const dir = initRepo();
    addHuskyHook(dir, "#!/bin/sh\nexit 1\n");
    const sid = "s-limit";
    resetPreCommitCount(sid);
    for (let i = 0; i < MAX_PRE_COMMIT_RUNS_PER_TURN; i++) {
      const out = await executeRunPreCommit(dir, sid);
      expect(out).toMatch(/FAILED/);
    }
    const limited = await executeRunPreCommit(dir, sid);
    expect(limited).toMatch(/run limit reached/);
    resetPreCommitCount(sid);
    const again = await executeRunPreCommit(dir, sid);
    expect(again).toMatch(/FAILED/);
  });
});
