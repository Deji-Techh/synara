import { z } from "zod";
import { createClient, createEventClient, defineContract, defineEvent } from "../contracts/core";

export const GoalStatusSchema = z.enum([
  "draft",
  "active",
  "running",
  "pausing",
  "paused",
  "verifying",
  "repairing",
  "blocked",
  "awaiting-user",
  "completed",
  "cancelled",
]);
export type GoalStatus = z.infer<typeof GoalStatusSchema>;

export const GoalExecutionTargetSchema = z.enum(["local", "remote", "hybrid"]);
export type GoalExecutionTarget = z.infer<typeof GoalExecutionTargetSchema>;

export const GoalTaskStatusSchema = z.enum([
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
]);
export type GoalTaskStatus = z.infer<typeof GoalTaskStatusSchema>;

export const GoalRunStatusSchema = z.enum([
  "pending",
  "claimed",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export type GoalRunStatus = z.infer<typeof GoalRunStatusSchema>;

export const GoalRunKindSchema = z.enum(["plan", "execute", "repair", "verify"]);
export type GoalRunKind = z.infer<typeof GoalRunKindSchema>;

export const GoalTaskSchema = z.object({
  id: z.string(),
  goalId: z.string(),
  title: z.string(),
  description: z.string(),
  status: GoalTaskStatusSchema,
  order: z.number().int().nonnegative(),
  required: z.boolean(),
  dependencies: z.array(z.string()),
  completionCriteria: z.array(z.string()),
  verificationMethod: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type GoalTask = z.infer<typeof GoalTaskSchema>;

export const GoalEvidenceSchema = z.object({
  id: z.string(),
  goalId: z.string(),
  taskId: z.string().nullable(),
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
  label: z.string(),
  reference: z.string(),
  passed: z.boolean(),
  revision: z.string().nullable(),
  createdAt: z.number(),
});
export type GoalEvidence = z.infer<typeof GoalEvidenceSchema>;

export const GoalBlockerSchema = z.object({
  reason: z.string(),
  userAction: z.string().nullable(),
  retryable: z.boolean(),
  detectedAt: z.number(),
});
export type GoalBlocker = z.infer<typeof GoalBlockerSchema>;

export const GoalSchema = z.object({
  id: z.string(),
  appId: z.number(),
  originatingChatId: z.number().nullable(),
  goalChatId: z.number().nullable(),
  title: z.string(),
  objective: z.string(),
  definitionOfDone: z.array(z.string()),
  constraints: z.array(z.string()),
  status: GoalStatusSchema,
  executionTarget: GoalExecutionTargetSchema,
  currentPhase: z.string().nullable(),
  currentTask: z.string().nullable(),
  blocker: GoalBlockerSchema.nullable(),
  nextRetryAt: z.number().nullable(),
  consecutiveFailures: z.number().int().nonnegative(),
  verifiedTaskCount: z.number().int().nonnegative(),
  totalTaskCount: z.number().int().nonnegative(),
  createdAt: z.number(),
  updatedAt: z.number(),
  activatedAt: z.number().nullable(),
  completedAt: z.number().nullable(),
  cancelledAt: z.number().nullable(),
  lastHeartbeatAt: z.number().nullable(),
  stateRevision: z.number().int().nonnegative(),
  tasks: z.array(GoalTaskSchema),
  evidence: z.array(GoalEvidenceSchema),
});
export type Goal = z.infer<typeof GoalSchema>;

export const GoalActivityEventSchema = z.object({
  id: z.string(),
  goalId: z.string(),
  type: z.string(),
  summary: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.number(),
});
export type GoalActivityEvent = z.infer<typeof GoalActivityEventSchema>;

export const GoalRunSchema = z.object({
  id: z.string(),
  goalId: z.string(),
  appId: z.number(),
  chatId: z.number(),
  kind: GoalRunKindSchema,
  status: GoalRunStatusSchema,
  prompt: z.string(),
  attempt: z.number().int().positive(),
  runnerId: z.string().nullable(),
  leaseExpiresAt: z.number().nullable(),
  createdAt: z.number(),
  startedAt: z.number().nullable(),
  finishedAt: z.number().nullable(),
  error: z.string().nullable(),
});
export type GoalRun = z.infer<typeof GoalRunSchema>;

export const GoalRunRequestedSchema = z.object({
  run: GoalRunSchema,
});
export type GoalRunRequested = z.infer<typeof GoalRunRequestedSchema>;

export const GoalUpdatedSchema = z.object({
  goal: GoalSchema,
  reason: z.string(),
});
export type GoalUpdated = z.infer<typeof GoalUpdatedSchema>;

export const GoalControlRequestedSchema = z.object({
  goalId: z.string(),
  chatId: z.number().nullable(),
  action: z.enum(["pause", "cancel", "interrupt"]),
});
export type GoalControlRequested = z.infer<typeof GoalControlRequestedSchema>;

const GoalIdInputSchema = z.object({ goalId: z.string().min(1) });

export const goalContracts = {
  createGoal: defineContract({
    channel: "goal:create",
    input: z.object({
      appId: z.number().nullable().optional(),
      chatId: z.number().optional(),
      title: z.string().trim().min(1).max(120).optional(),
      objective: z.string().trim().min(3).max(20_000),
      definitionOfDone: z.array(z.string().trim().min(1)).max(100).optional(),
      constraints: z.array(z.string().trim().min(1)).max(100).optional(),
      executionTarget: GoalExecutionTargetSchema.optional(),
    }),
    output: GoalSchema,
  }),
  getGoal: defineContract({
    channel: "goal:get",
    input: GoalIdInputSchema,
    output: GoalSchema,
  }),
  getActiveGoal: defineContract({
    channel: "goal:get-active",
    input: z.object({ appId: z.number().nullable().optional() }),
    output: GoalSchema.nullable(),
  }),
  listGoals: defineContract({
    channel: "goal:list",
    input: z.object({
      appId: z.number().optional(),
      statuses: z.array(GoalStatusSchema).optional(),
    }),
    output: z.array(GoalSchema),
  }),
  listActivity: defineContract({
    channel: "goal:list-activity",
    input: z.object({
      goalId: z.string().min(1),
      limit: z.number().int().positive().max(1_000).default(200),
    }),
    output: z.array(GoalActivityEventSchema),
  }),
  listRuns: defineContract({
    channel: "goal:list-runs",
    input: z.object({
      goalId: z.string().min(1),
      limit: z.number().int().positive().max(1_000).default(50),
    }),
    output: z.array(GoalRunSchema),
  }),
  pauseGoal: defineContract({
    channel: "goal:pause",
    input: GoalIdInputSchema.extend({
      reason: z.string().max(2_000).optional(),
    }),
    output: GoalSchema,
  }),
  resumeGoal: defineContract({
    channel: "goal:resume",
    input: GoalIdInputSchema,
    output: GoalSchema,
  }),
  cancelGoal: defineContract({
    channel: "goal:cancel",
    input: GoalIdInputSchema.extend({
      reason: z.string().max(2_000).optional(),
    }),
    output: GoalSchema,
  }),
  editGoal: defineContract({
    channel: "goal:edit",
    input: GoalIdInputSchema.extend({
      title: z.string().trim().min(1).max(120).optional(),
      objective: z.string().trim().min(3).max(20_000).optional(),
      definitionOfDone: z.array(z.string().trim().min(1)).max(100).optional(),
      constraints: z.array(z.string().trim().min(1)).max(100).optional(),
      executionTarget: GoalExecutionTargetSchema.optional(),
    }),
    output: GoalSchema,
  }),
  steerGoal: defineContract({
    channel: "goal:steer",
    input: GoalIdInputSchema.extend({
      instruction: z.string().trim().min(1).max(20_000),
    }),
    output: GoalSchema,
  }),
  retryGoal: defineContract({
    channel: "goal:retry",
    input: GoalIdInputSchema,
    output: GoalSchema,
  }),
  verifyGoal: defineContract({
    channel: "goal:verify",
    input: GoalIdInputSchema,
    output: GoalSchema,
  }),
  listRunnableRuns: defineContract({
    channel: "goal:runs:list-runnable",
    input: z.object({ runnerId: z.string().min(1) }),
    output: z.array(GoalRunSchema),
  }),
  claimRun: defineContract({
    channel: "goal:runs:claim",
    input: z.object({ runId: z.string().min(1), runnerId: z.string().min(1) }),
    output: GoalRunSchema.nullable(),
  }),
  heartbeatRun: defineContract({
    channel: "goal:runs:heartbeat",
    input: z.object({ runId: z.string().min(1), runnerId: z.string().min(1) }),
    output: z.boolean(),
  }),
  setRunWaiting: defineContract({
    channel: "goal:runs:set-waiting",
    input: z.object({
      runId: z.string().min(1),
      runnerId: z.string().min(1),
      waiting: z.boolean(),
      reason: z.string().max(2_000).optional(),
    }),
    output: GoalSchema,
  }),
  completeRun: defineContract({
    channel: "goal:runs:complete",
    input: z.object({
      runId: z.string().min(1),
      runnerId: z.string().min(1),
      success: z.boolean(),
      pausedByStepLimit: z.boolean().optional(),
      error: z.string().max(20_000).optional(),
    }),
    output: GoalSchema,
  }),
} as const;

export const goalEvents = {
  runRequested: defineEvent({
    channel: "goal:run-requested",
    payload: GoalRunRequestedSchema,
  }),
  updated: defineEvent({
    channel: "goal:updated",
    payload: GoalUpdatedSchema,
  }),
  controlRequested: defineEvent({
    channel: "goal:control-requested",
    payload: GoalControlRequestedSchema,
  }),
} as const;

export const goalClient = createClient(goalContracts);
export const goalEventClient = createEventClient(goalEvents);
