// FILE: gitService.test.ts
// Purpose: Serialized commits, clean-tree nulls, index.lock classification.

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { GitService } from "./gitService.ts";

function initRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-gitsvc-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@t.dev"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
  return dir;
}

describe("git service", () => {
  it("inits with an initial commit", async () => {
    const dir = initRepo();
    fs.writeFileSync(path.join(dir, "a.txt"), "hi\n");
    const svc = new GitService();
    const hash = await svc.initRepoWithInitialCommit({ path: dir });
    expect(hash).toMatch(/^[0-9a-f]{40}$/);
  });

  it("commits when changed, null when clean", async () => {
    const dir = initRepo();
    const svc = new GitService();
    fs.writeFileSync(path.join(dir, "a.txt"), "v1\n");
    const first = await svc.stageAllAndCommitIfChanged({ path: dir, message: "one" });
    expect(first).toMatch(/^[0-9a-f]{40}$/);
    expect(await svc.stageAllAndCommitIfChanged({ path: dir, message: "two" })).toBeNull();
  });

  it("commits single files and skips ignored ones", async () => {
    const dir = initRepo();
    const svc = new GitService();
    fs.writeFileSync(path.join(dir, ".gitignore"), ".env.local\n");
    fs.writeFileSync(path.join(dir, "a.txt"), "v1\n");
    fs.writeFileSync(path.join(dir, ".env.local"), "S=1\n");
    execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync("git", ["commit", "-m", "init"], { cwd: dir });
    fs.writeFileSync(path.join(dir, "a.txt"), "v2\n");
    const hash = await svc.commitFile({ path: dir, filepath: "a.txt", message: "edit" });
    expect(hash).toMatch(/^[0-9a-f]{40}$/);
    expect(
      await svc.commitFile({ path: dir, filepath: ".env.local", message: "ignored" }),
    ).toBeNull();
  });

  it("serializes concurrent commits on one repo", async () => {
    const dir = initRepo();
    const svc = new GitService();
    fs.writeFileSync(path.join(dir, "a.txt"), "v1\n");
    fs.writeFileSync(path.join(dir, "b.txt"), "v1\n");
    const [h1, h2] = await Promise.all([
      svc.commitFiles({ path: dir, filepaths: ["a.txt"], message: "c1" }),
      svc.commitFiles({ path: dir, filepaths: ["b.txt"], message: "c2" }),
    ]);
    expect(h1).toMatch(/^[0-9a-f]{40}$/);
    expect(h2).toMatch(/^[0-9a-f]{40}$/);
    expect(h1).not.toBe(h2);
  });
});
