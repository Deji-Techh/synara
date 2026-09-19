// FILE: goals.test.ts
// Purpose: Goal state lifecycle + tools (fixtures, no server needed).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { ToolContext } from "../../harness/tools/defineTool.ts";
import { createGoalState, isGoalComplete, type GoalState } from "./goalState.ts";
import {
  captureEvidenceTool,
  detectLintCommand,
  detectTestCommand,
  goalStatusTool,
  updateGoalStateTool,
} from "./goalTools.ts";
import { createGoal, readGoal } from "./goalCenter.ts";

function mustTask(state: GoalState, index: number) {
  const task = state.tasks[index];
  if (!task) throw new Error(`fixture task ${index} missing`);
  return task;
}

function toolCtx(appPath: string): ToolContext {
  return {
    signal: AbortSignal.timeout(10_000),
    appPath,
    sessionId: "test-session",
    toolId: "tool-test",
  };
}

function verifiedState(): GoalState {
  const state = createGoalState("Ship auth", [{ title: "Build login" }]);
  const evidenceId = "ev-1";
  return {
    ...state,
    status: "completed",
    tasks: state.tasks.map((t) => ({ ...t, status: "verified" as const })),
    evidence: [
      {
        id: evidenceId,
        taskId: "task-1",
        kind: "test",
        label: "unit",
        reference: "bun run test",
        passed: true,
        revision: "abc",
        createdAt: 1,
      },
    ],
    verification: {
      passed: true,
      checkedAt: 2,
      revision: "abc",
      criteria: [{ criterion: "tests pass", passed: true, evidence: [evidenceId] }],
    },
  };
}

describe("dyad goals transplant", () => {
  it("creates skeletons and evaluates the completion predicate", () => {
    const fresh = createGoalState("Ship auth", [{ title: "A" }, { title: "B" }]);
    expect(fresh.version).toBe(1);
    expect(fresh.tasks).toHaveLength(2);
    expect(mustTask(fresh, 1).dependencies).toEqual(["task-1"]);
    expect(isGoalComplete(fresh)).toBe(false);
    expect(isGoalComplete(verifiedState())).toBe(true);
    const noCriteria = {
      ...verifiedState(),
      verification: { passed: true, checkedAt: 2, revision: "abc", criteria: [] },
    };
    expect(isGoalComplete(noCriteria)).toBe(false);
  });

  it("writes atomically and reads status back", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-goal-"));
    const state = verifiedState();
    const out = (await updateGoalStateTool.execute(
      { goalId: state.goalId, state },
      toolCtx(dir),
    )) as string;
    expect(out).toContain("successfully updated and validated");
    expect(fs.existsSync(path.join(dir, ".caide", "goals", state.goalId, "state.json"))).toBe(true);

    const status = (await goalStatusTool.execute({ goalId: state.goalId }, toolCtx(dir))) as string;
    expect(status).toContain("Ship auth");
    expect(status).toContain("completion predicate holds");
    expect(status).toContain("[verified] Build login");

    await expect(goalStatusTool.execute({ goalId: "missing" }, toolCtx(dir))).rejects.toThrow(
      /Goal not found/,
    );
    await expect(
      updateGoalStateTool.execute({ goalId: "../escape", state }, toolCtx(dir)),
    ).rejects.toThrow(/Invalid goalId/);
  });

  it("couples capture_evidence to goal state with server revision", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-goal-"));
    const goal = await createGoal(dir, "Ship", [{ title: "A" }]);
    const taskId = mustTask(goal, 0).id;
    const st = await readGoal(dir, goal.goalId);
    mustTask(st, 0).status = "running";
    await updateGoalStateTool.execute({ goalId: goal.goalId, state: st }, toolCtx(dir));
    const out = (await captureEvidenceTool.execute(
      {
        goalId: goal.goalId,
        taskId,
        kind: "test",
        label: "unit",
        reference: "npm run test",
        passed: true,
      },
      toolCtx(dir),
    )) as string;
    expect(out).toContain(`Evidence recorded for goal ${goal.goalId}`);
    expect(out).toContain("revision: (unknown)");
    const after = await readGoal(dir, goal.goalId);
    expect(mustTask(after, 0).status).toBe("verifying");
    expect(after.evidence[0]).toMatchObject({ taskId, kind: "test", passed: true, revision: null });
    await expect(
      captureEvidenceTool.execute(
        {
          goalId: goal.goalId,
          taskId: "nope",
          kind: "test",
          label: "x",
          reference: "y",
          passed: true,
        },
        toolCtx(dir),
      ),
    ).rejects.toThrow(/Task not found/);
    await expect(
      captureEvidenceTool.execute(
        { goalId: "missing", kind: "test", label: "x", reference: "y", passed: true },
        toolCtx(dir),
      ),
    ).rejects.toThrow(/Goal not found/);
  });

  it("auto-detects test and lint commands from package.json", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-goal-"));
    expect(await detectTestCommand(dir)).toBe("npm run test");
    expect(await detectLintCommand(dir)).toBe("npm run lint");
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({
        scripts: { "test:unit": "vitest run", lint: "eslint ." },
        devDependencies: { vitest: "^3.0.0" },
      }),
    );
    expect(await detectTestCommand(dir)).toBe("npm run test:unit");
    expect(await detectLintCommand(dir)).toBe("npm run lint");
  });
});
