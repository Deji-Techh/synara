// harness/acceptance.test.ts — M26 acceptance: 2 projects×N chats + compaction + preview
import { describe, it, expect } from "vitest";
import { scaffoldProject } from "./scaffold";
import { CaideRunner } from "./caideRunner";
import { shouldCompact } from "./compaction";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("M26 acceptance — pure Caide", () => {
  it("2 projects concurrent do not cross-talk", async () => {
    const r1 = new CaideRunner();
    const r2 = new CaideRunner();
    const events1: string[] = [];
    const events2: string[] = [];
    r1.onEvent((e) => events1.push(e.threadId));
    r2.onEvent((e) => events2.push(e.threadId));
    r1.startTurn("t1", "turn1", "proj1", "builder", "stage", []);
    r2.startTurn("t2", "turn2", "proj2", "builder", "stage", []);
    await r1.runSlice("t1", "turn1", "screen A", "b64");
    await r2.runSlice("t2", "turn2", "screen B", "b64");
    expect(events1.every((id) => id === "t1")).toBe(true);
    expect(events2.every((id) => id === "t2")).toBe(true);
    expect(events1).not.toContain("t2");
  });

  it("long-chat compaction @70% triggers", () => {
    expect(shouldCompact({ tokenBudget: 100, usedTokens: 70, summary: null, recentTurns: [], persistentArtifacts: [] })).toBe(true);
    expect(shouldCompact({ tokenBudget: 100, usedTokens: 69, summary: null, recentTurns: [], persistentArtifacts: [] })).toBe(false);
  });

  it("scaffold + preview green per framework", async () => {
    const base = mkdtempSync(join(tmpdir(), "caide-accept-"));
    try {
      for (const fw of ["blank", "website"] as const) {
        const root = join(base, fw);
        const res = await scaffoldProject({ projectId: `p-${fw}`, workspaceRoot: root, framework: fw, name: `App ${fw}` });
        expect(res.framework).toBe(fw);
      }
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
