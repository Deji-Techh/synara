import { describe, expect, it } from "vitest";
import { isPersistedGoalComplete, PersistedGoalStateSchema } from "./goal_state";

function state() {
  return PersistedGoalStateSchema.parse({
    version: 1,
    goalId: "goal-1",
    objective: "Build the application",
    status: "completed",
    currentPhase: "Verification",
    currentTask: null,
    tasks: [
      {
        id: "task-1",
        title: "Build",
        description: "",
        status: "verified",
        order: 0,
        required: true,
        dependencies: [],
        completionCriteria: ["Build passes"],
        verificationMethod: "npm run build",
      },
    ],
    evidence: [
      {
        id: "build-evidence",
        taskId: "task-1",
        kind: "build",
        label: "Production build",
        reference: "build.log",
        passed: true,
        revision: "abc123",
        createdAt: Date.now(),
      },
    ],
    blocker: null,
    verification: {
      passed: true,
      checkedAt: Date.now(),
      revision: "abc123",
      criteria: [
        {
          criterion: "Build passes",
          passed: true,
          evidence: ["build-evidence"],
        },
      ],
    },
    updatedAt: Date.now(),
  });
}

describe("persisted goal completion", () => {
  it("requires completed state, verified required tasks and all criteria", () => {
    expect(isPersistedGoalComplete(state())).toBe(true);
  });

  it("rejects model completion claims without verification evidence", () => {
    const candidate = state();
    candidate.verification.criteria[0].passed = false;
    expect(isPersistedGoalComplete(candidate)).toBe(false);
  });

  it("rejects completion while a required task remains unfinished or skipped", () => {
    const candidate = state();
    candidate.tasks[0].status = "running";
    expect(isPersistedGoalComplete(candidate)).toBe(false);
    candidate.tasks[0].status = "skipped";
    expect(isPersistedGoalComplete(candidate)).toBe(false);
  });

  it("requires criterion evidence from the verified revision", () => {
    const candidate = state();
    candidate.evidence[0].revision = "older-revision";
    expect(isPersistedGoalComplete(candidate)).toBe(false);
  });
});
