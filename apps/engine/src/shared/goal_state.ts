import { z } from "zod";

export const PersistedGoalTaskStateSchema = z.object({
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

export const PersistedGoalEvidenceSchema = z.object({
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

export const PersistedGoalVerificationCriterionSchema = z.object({
  criterion: z.string().min(1),
  passed: z.boolean(),
  evidence: z.array(z.string()),
});

export const PersistedGoalStateSchema = z.object({
  version: z.number().describe("Must be 1"),
  goalId: z.string().min(1),
  objective: z.string().min(1),
  status: z.enum([
    "active",
    "blocked",
    "awaiting-user",
    "completion-candidate",
    "completed",
  ]),
  currentPhase: z.string().nullable(),
  currentTask: z.string().nullable(),
  tasks: z.array(PersistedGoalTaskStateSchema),
  evidence: z.array(PersistedGoalEvidenceSchema),
  steering: z
    .array(
      z.object({
        instruction: z.string().min(1),
        createdAt: z.number(),
      }),
    )
    .default([]),
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
    criteria: z.array(PersistedGoalVerificationCriterionSchema),
  }),
  updatedAt: z.number(),
});

export type PersistedGoalTaskState = z.infer<
  typeof PersistedGoalTaskStateSchema
>;
export type PersistedGoalEvidence = z.infer<typeof PersistedGoalEvidenceSchema>;
export type PersistedGoalState = z.infer<typeof PersistedGoalStateSchema>;

export function isPersistedGoalComplete(state: PersistedGoalState): boolean {
  const requiredTasksPass = state.tasks
    .filter((task) => task.required)
    .every((task) => task.status === "verified");
  const verificationRevision = state.verification.revision;
  const evidenceById = new Map<string, PersistedGoalEvidence>(
    state.evidence.map((evidence) => [evidence.id, evidence]),
  );
  const criteriaPass =
    state.verification.criteria.length > 0 &&
    verificationRevision !== null &&
    state.verification.criteria.every((criterion) => {
      if (!criterion.passed || criterion.evidence.length === 0) return false;
      return criterion.evidence.every((evidenceId) => {
        const evidence = evidenceById.get(evidenceId);
        return (
          evidence?.passed === true &&
          evidence.revision === verificationRevision
        );
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
