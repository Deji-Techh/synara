// FILE: versions.test.ts
// Purpose: Version snapshots against real temp repos (create/list/restore,
// dirty-stash safety, invalid hashes, non-repo errors, favorite/note
// metadata, per-version diffs, checkout branches, revert commits).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  checkoutVersion,
  createVersion,
  getVersionChanges,
  listVersions,
  restoreVersion,
  revertVersion,
  updateVersionMetadata,
} from "./versions.ts";
import { GitToolError } from "./gitTools.ts";

function initRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-versions-"));
  execFileSync("git", ["init", "-b", "main"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@caide.dev"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Caide Test"], { cwd: dir });
  // Scaffold parity: every template ships a .gitignore covering .caide/.
  fs.writeFileSync(path.join(dir, ".gitignore"), "node_modules/\n.caide/\n");
  fs.writeFileSync(path.join(dir, "a.txt"), "v1\n");
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["commit", "-m", "init"], { cwd: dir });
  return dir;
}

describe("dyad app versions", () => {
  it("creates, lists, and restores versions with stash safety", async () => {
    const dir = initRepo();
    fs.writeFileSync(path.join(dir, "a.txt"), "v1 edited\n");
    const v1 = await createVersion(dir, "first slice");
    expect(v1.hash).toMatch(/^[0-9a-f]{40}$/);
    expect(v1.files).toContain("a.txt");

    fs.writeFileSync(path.join(dir, "a.txt"), "v2\n");
    const v2 = await createVersion(dir, "second slice");
    expect(v2.hash).not.toBe(v1.hash);

    const listed = await listVersions(dir);
    expect(listed.map((v) => v.hash)).toEqual([v2.hash, v1.hash]);
    expect(listed[0]).toMatchObject({ message: "second slice" });

    // Dirty work is stashed, snapshot content restored.
    fs.writeFileSync(path.join(dir, "a.txt"), "uncommitted\n");
    const summary = await restoreVersion(dir, v1.hash);
    expect(summary).toMatch(/caide-restore-wip/);
    expect(fs.readFileSync(path.join(dir, "a.txt"), "utf-8")).toBe("v1 edited\n");
    const stash = execFileSync("git", ["stash", "list"], { cwd: dir }).toString();
    expect(stash).toContain("caide-restore-wip");
  });

  it("records clean trees without new commits", async () => {
    const dir = initRepo();
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir }).toString().trim();
    const v = await createVersion(dir, "nothing changed");
    expect(v.hash).toBe(head);
    expect(v.files).toEqual([]);
    expect(await listVersions(dir)).toHaveLength(1);
  });

  it("rejects bad hashes and non-repos", async () => {
    const dir = initRepo();
    await expect(restoreVersion(dir, "notahash!!")).rejects.toBeInstanceOf(GitToolError);
    await expect(restoreVersion(dir, "0".repeat(40))).rejects.toBeInstanceOf(GitToolError);
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), "caide-norepo-"));
    await expect(createVersion(plain, "x")).rejects.toBeInstanceOf(GitToolError);
    expect(await listVersions(plain)).toEqual([]);
  });

  it("stores favorite/note metadata on versions", async () => {
    const dir = initRepo();
    fs.writeFileSync(path.join(dir, "a.txt"), "v1 edited\n");
    const v1 = await createVersion(dir, "first slice");
    await updateVersionMetadata(dir, v1.hash, { isFavorite: true, note: "good state" });
    const listed = await listVersions(dir);
    expect(listed[0]).toMatchObject({ hash: v1.hash, isFavorite: true, note: "good state" });
    await expect(updateVersionMetadata(dir, "0".repeat(40), { note: "x" })).rejects.toBeInstanceOf(
      GitToolError,
    );
  });

  it("diffs a version with per-file changes", async () => {
    const dir = initRepo();
    fs.writeFileSync(path.join(dir, "a.txt"), "v1 edited\n");
    fs.writeFileSync(path.join(dir, "b.txt"), "new file\n");
    const v1 = await createVersion(dir, "edit + add");
    const changes = await getVersionChanges(dir, v1.hash);
    const byPath = new Map(changes.map((c) => [c.path, c]));
    expect(byPath.get("a.txt")?.type).toBe("modified");
    expect(byPath.get("a.txt")?.diff).toContain("v1 edited");
    expect(byPath.get("b.txt")?.type).toBe("added");
    await expect(getVersionChanges(dir, "notahash!!")).rejects.toBeInstanceOf(GitToolError);
  });

  it("checks out a version onto a new branch", async () => {
    const dir = initRepo();
    fs.writeFileSync(path.join(dir, "a.txt"), "v1 edited\n");
    const v1 = await createVersion(dir, "first slice");
    fs.writeFileSync(path.join(dir, "a.txt"), "v2\n");
    await createVersion(dir, "second slice");
    const msg = await checkoutVersion(dir, v1.hash, "rewind-branch");
    expect(msg).toContain("rewind-branch");
    const branch = execFileSync("git", ["branch", "--show-current"], { cwd: dir })
      .toString()
      .trim();
    expect(branch).toBe("rewind-branch");
    expect(fs.readFileSync(path.join(dir, "a.txt"), "utf-8")).toBe("v1 edited\n");
  });

  it("refuses checkout on a dirty tree", async () => {
    const dir = initRepo();
    fs.writeFileSync(path.join(dir, "a.txt"), "v1 edited\n");
    const v1 = await createVersion(dir, "first slice");
    fs.writeFileSync(path.join(dir, "a.txt"), "dirty\n");
    await expect(checkoutVersion(dir, v1.hash, "nope")).rejects.toBeInstanceOf(GitToolError);
  });

  it("reverts a version with a revert commit", async () => {
    const dir = initRepo();
    fs.writeFileSync(path.join(dir, "a.txt"), "v1 edited\n");
    const v1 = await createVersion(dir, "first slice");
    const msg = await revertVersion(dir, v1.hash);
    expect(msg).toContain(v1.hash);
    expect(fs.readFileSync(path.join(dir, "a.txt"), "utf-8")).toBe("v1\n");
    const log = execFileSync("git", ["log", "--oneline"], { cwd: dir }).toString();
    expect(log).toMatch(/Revert/);
  });

  it("refuses revert on a dirty tree", async () => {
    const dir = initRepo();
    fs.writeFileSync(path.join(dir, "a.txt"), "v1 edited\n");
    const v1 = await createVersion(dir, "first slice");
    fs.writeFileSync(path.join(dir, "a.txt"), "dirty\n");
    await expect(revertVersion(dir, v1.hash)).rejects.toBeInstanceOf(GitToolError);
  });
});
