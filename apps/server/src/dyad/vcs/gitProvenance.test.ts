// FILE: gitProvenance.test.ts
// Purpose: Turn provenance capture (start/end/previous) + repo detection.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  captureTurnEnd,
  captureTurnStart,
  clearTurnProvenance,
  isGitRepo,
} from "./gitProvenance.ts";

function initRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-prov-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@caide.dev"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Caide Test"], { cwd: dir });
  fs.writeFileSync(path.join(dir, "a.txt"), "v1\n");
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["commit", "-m", "init"], { cwd: dir });
  return dir;
}

describe("turn git provenance", () => {
  it("detects repos and tracks commits across turns", async () => {
    const dir = initRepo();
    const sid = `prov-${Date.now()}`;
    clearTurnProvenance(sid);
    try {
      expect(await isGitRepo(dir)).toBe(true);
      expect(await isGitRepo(fs.mkdtempSync(path.join(os.tmpdir(), "caide-plain-")))).toBe(false);

      // First turn: no previous record.
      expect(await captureTurnStart(sid, dir)).toBeUndefined();
      fs.writeFileSync(path.join(dir, "a.txt"), "v2\n");
      execFileSync("git", ["add", "-A"], { cwd: dir });
      execFileSync("git", ["commit", "-m", "second"], { cwd: dir });
      const ended = await captureTurnEnd(sid, dir);
      expect(ended.commitHash).toMatch(/^[0-9a-f]{40}$/);
      expect(ended.sourceCommitHash).toBeTruthy();
      expect(ended.commitHash).not.toBe(ended.sourceCommitHash);

      // Second turn sees the first turn's outcome.
      const prev = await captureTurnStart(sid, dir);
      expect(prev?.commitHash).toBe(ended.commitHash);
    } finally {
      clearTurnProvenance(sid);
    }
  });

  it("records no-commit turns without a commit hash", async () => {
    const dir = initRepo();
    const sid = `prov-clean-${Date.now()}`;
    clearTurnProvenance(sid);
    try {
      await captureTurnStart(sid, dir);
      const ended = await captureTurnEnd(sid, dir);
      expect(ended.commitHash).toBeUndefined();
      expect(ended.sourceCommitHash).toMatch(/^[0-9a-f]{40}$/);
    } finally {
      clearTurnProvenance(sid);
    }
  });
});
