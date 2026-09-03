// FILE: goalState.ts
// Purpose: Durable goal state (tasks/evidence/verification/steering/blocker)
// + completion predicate + lifecycle helpers.
// Donor: dyad x caide src/shared/goal_state.ts (schemas + isComplete logic
// kept; zod-native, no Electron). Storage path is .caide/goals/<id>/.

import { z } from "zod";

export const GoalTaskStateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  status: z.enum([
    "pending",
    "ready",
    "running",
    "verifying",
    "repairing",
    "blocked",
    "awaiting-approval",
    "verified",
    "skipped",
    "cancelled",
  ]),
  order: z.number().int().nonnegative(),
  required: z.boolean().default(true),
  dependencies: z.array(z.string()).default([]),
  completionCriteria: z.array(z.string()).default([]),
  verificationMethod: z.string().nullable().default(null),
});

export const GoalEvidenceSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().nullable().default(null),
  kind: z.enum([
    "test",
    "build",
    "typecheck",
    "lint",
    "screenshot",
    "audit-report",
    "file-change",
    "command-output",
    "deployment",
    "manual-confirmation",
    "other",
  ]),
  label: z.string().min(1),
  reference: z.string().min(1),
  passed: z.boolean(),
  revision: z.string().nullable().default(null),
  createdAt: z.number(),
});

export const GoalVerificationCriterionSchema = z.object({
  criterion: z.string().min(1),
  passed: z.boolean(),
  evidence: z.array(z.string()),
});

export const GoalStateSchema = z.object({
  version: z.number().describe("Must be 1"),
  goalId: z.string().min(1),
  objective: z.string().min(1),
  status: z.enum(["active", "blocked", "awaiting-user", "completion-candidate", "completed", "paused"]),
  currentPhase: z.string().nullable(),
  currentTask: z.string().nullable(),
  tasks: z.array(GoalTaskStateSchema),
  evidence: z.array(GoalEvidenceSchema),
  steering: z.array(z.object({ instruction: z.string().min(1), createdAt: z.number() })).default([]),
  blocker: z
    .object({
      reason: z.string().min(1),
      userAction: z.string().nullable(),
      retryable: z.boolean(),
      detectedAt: z.number(),
    })
    .nullable(),
  verification: z.object({
    passed: z.boolean(),
    checkedAt: z.number().nullable(),
    revision: z.string().nullable(),
    criteria: z.array(GoalVerificationCriterionSchema),
  }),
  updatedAt: z.number(),
});

export type GoalTaskState = z.infer<typeof GoalTaskStateSchema>;
export type GoalEvidence = z.infer<typeof GoalEvidenceSchema>;
export type GoalState = z.infer<typeof GoalStateSchema>;

let goalCounter = 0;

/** Fresh goal skeleton (donor defaults). */
export function createGoalState(objective: string, tasks: Array<{ title: string; description?: string }>): GoalState {
  return {
    version: 1,
    goalId: `goal-${Date.now().toString(36)}-${++goalCounter}`,
    objective,
    status: "active",
    currentPhase: null,
    currentTask: tasks[0]?.title ?? null,
    tasks: tasks.map((t, i) => ({
      id: `task-${i + 1}`,
      title: t.title,
      description: t.description ?? "",
      status: "pending" as const,
      order: i,
      required: true,
      dependencies: i > 0 ? [`task-${i}`] : [],
      completionCriteria: [],
      verificationMethod: null,
    })),
    evidence: [],
    steering: [],
    blocker: null,
    verification: { passed: false, checkedAt: null, revision: null, criteria: [] },
    updatedAt: Date.now(),
  };
}

/** Donor completion predicate verbatim in meaning. */
export function isGoalComplete(state: GoalState): boolean {
  const requiredTasksPass = state.tasks
    .filter((task) => task.required)
    .every((task) => task.status === "verified");
  const verificationRevision = state.verification.revision;
  const evidenceById = new Map<string, GoalEvidence>(state.evidence.map((e) => [e.id, e]));
  const criteriaPass =
    state.verification.criteria.length > 0 &&
    verificationRevision !== null &&
    state.verification.criteria.every((criterion) => {
      if (!criterion.passed || criterion.evidence.length === 0) return false;
      return criterion.evidence.every((evidenceId) => {
        const evidence = evidenceById.get(evidenceId);
        return evidence?.passed === true && evidence.revision === verificationRevision;
      });
    });
  return (
    state.status === "completed" &&
    requiredTasksPass &&
    state.verification.passed &&
    state.verification.checkedAt !== null &&
    verificationRevision !== null &&
    criteriaPass
  );
}
