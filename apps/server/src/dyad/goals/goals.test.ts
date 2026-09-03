// FILE: goals.test.ts
// Purpose: Goal state lifecycle + tools (fixtures, no server needed).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { ToolContext } from "../../harness/tools/defineTool.ts";
import { createGoalState, isGoalComplete, type GoalState } from "./goalState.ts";
import { goalStatusTool, updateGoalStateTool } from "./goalTools.ts";

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
    expect(fresh.tasks[1].dependencies).toEqual(["task-1"]);
    expect(isGoalComplete(fresh)).toBe(false);
    expect(isGoalComplete(verifiedState())).toBe(true);
    const noCriteria = { ...verifiedState(), verification: { passed: true, checkedAt: 2, revision: "abc", criteria: [] } };
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
});
