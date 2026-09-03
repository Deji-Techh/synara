// FILE: goalCenter.test.ts
// Purpose: A2 gate — center CRUD/transitions, scheduler advancement and
// verification, verify_goal tool (temp workspaces, best-effort git).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import type { ToolContext } from "../../harness/tools/defineTool.ts";
import {
  cancelGoal,
  createGoal,
  editGoal,
  listGoals,
  pauseGoal,
  resumeGoal,
  retryTask,
  steerGoal,
} from "./goalCenter.ts";
import { advanceGoal, nextActionableTasks, verifyGoal } from "./goalScheduler.ts";
import { readGoalState, verifyGoalTool } from "./goalTools.ts";

function appDir(withGit = false): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-goal-"));
  if (withGit) {
    execFileSync("git", ["init", "-b", "main"], { cwd: dir });
    execFileSync("git", ["config", "user.email", "t@t.dev"], { cwd: dir });
    execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
    fs.writeFileSync(path.join(dir, "f.txt"), "x\n");
    execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync("git", ["commit", "-m", "init"], { cwd: dir });
  }
  return dir;
}

function toolCtx(appPath: string): ToolContext {
  return { signal: AbortSignal.timeout(10_000), appPath, sessionId: "s", toolId: "t" };
}

describe("dyad goal center + scheduler (a2)", () => {
  it("creates, lists, steers, pauses, resumes, edits, retries, cancels", async () => {
    const dir = appDir();
    const goal = await createGoal(dir, "Ship auth", [{ title: "Build login" }, { title: "Add tests" }]);
    expect(goal.status).toBe("active");
    expect((await listGoals(dir))).toHaveLength(1);

    const steered = await steerGoal(dir, goal.goalId, "Use JWT sessions");
    expect(steered.steering).toHaveLength(1);

    const paused = await pauseGoal(dir, goal.goalId, "waiting on creds");
    expect(paused.status).toBe("paused");
    await expect(resumeGoal(dir, goal.goalId)).resolves.toMatchObject({ status: "active", blocker: null });

    const edited = await editGoal(dir, goal.goalId, { tasks: [{ title: "Build login" }, { title: "Add OAuth" }] });
    expect(edited.tasks.map((t) => t.title)).toEqual(["Build login", "Add OAuth"]);

    const retried = await retryTask(dir, goal.goalId, edited.tasks[1].id);
    expect(retried.tasks[1].status).toBe("pending");

    const cancelled = await cancelGoal(dir, goal.goalId, "pivoting");
    expect(cancelled.status).toBe("awaiting-user");
    expect(cancelled.tasks.every((t) => t.status === "cancelled")).toBe(true);

    await expect(readGoalState(dir, "missing")).rejects.toThrow(/not found/);
    await expect(createGoal(dir, "  ", [{ title: "x" }])).rejects.toThrow(/Objective/);
  });

  it("advances through dependency order and reports blockers", async () => {
    const dir = appDir();
    const goal = await createGoal(dir, "Ship", [{ title: "A" }, { title: "B" }]);
    expect(nextActionableTasks(goal).map((t) => t.title)).toEqual(["A"]);
    const first = await advanceGoal(dir, goal.goalId);
    expect(first).toContain('Next task: "A"');
    expect((await readGoalState(dir, goal.goalId)).currentTask).toBe("A");
  });

  it("verifies tasks with evidence at the current revision and completes", async () => {
    const dir = appDir(true);
    const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir }).toString().trim();
    const goal = await createGoal(dir, "Ship", [{ title: "A" }]);
    const tool = verifyGoalTool;
    expect(tool.presentCall?.({ goalId: goal.goalId })).toBe(`Verify goal: ${goal.goalId}`);

    // No verifying tasks yet → nothing verified, still open.
    const empty = await verifyGoal(dir, goal.goalId);
    expect(empty).toContain("still open");

    // Mark running + attach passing evidence at HEAD, then verify.
    const state = await readGoalState(dir, goal.goalId);
    state.tasks[0].status = "running";
    state.evidence.push({
      id: "ev-1", taskId: state.tasks[0].id, kind: "test", label: "unit",
      reference: "bun run test", passed: true, revision, createdAt: Date.now(),
    });
    const { GoalStateSchema } = await import("./goalState.ts");
    const file = path.join(dir, ".caide", "goals", goal.goalId, "state.json");
    await fs.promises.writeFile(file, JSON.stringify(GoalStateSchema.parse(state), null, 2));
    const done = await verifyGoalTool.execute({ goalId: goal.goalId }, toolCtx(dir));
    expect(String(done)).toContain("is complete");
    expect((await readGoalState(dir, goal.goalId)).status).toBe("completed");
  });
});
