import { Schema } from "effect";
import { TrimmedNonEmptyString, NonNegativeInt, PositiveInt, ProjectId, ThreadId } from "./baseSchemas";

export const GoalId = Schema.brand("GoalId")(TrimmedNonEmptyString);
export type GoalId = typeof GoalId.Type;

export const GoalRunId = Schema.brand("GoalRunId")(TrimmedNonEmptyString);
export type GoalRunId = typeof GoalRunId.Type;

export const GoalTaskId = Schema.brand("GoalTaskId")(TrimmedNonEmptyString);
export type GoalTaskId = typeof GoalTaskId.Type;

export const GoalEvidenceId = Schema.brand("GoalEvidenceId")(TrimmedNonEmptyString);
export type GoalEvidenceId = typeof GoalEvidenceId.Type;

export const GoalStatus = Schema.Literals([
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
  "cancelled"
]);
export type GoalStatus = typeof GoalStatus.Type;

export const GoalExecutionTarget = Schema.Literals(["local", "remote", "hybrid"]);
export type GoalExecutionTarget = typeof GoalExecutionTarget.Type;

export const GoalTaskStatus = Schema.Literals([
  "pending",
  "ready",
  "running",
  "verifying",
  "repairing",
  "blocked",
  "awaiting-approval",
  "verified",
  "skipped",
  "cancelled"
]);
export type GoalTaskStatus = typeof GoalTaskStatus.Type;

export const GoalRunStatus = Schema.Literals([
  "pending",
  "claimed",
  "running",
  "succeeded",
  "failed",
  "cancelled"
]);
export type GoalRunStatus = typeof GoalRunStatus.Type;

export const GoalRunKind = Schema.Literals(["plan", "execute", "repair", "verify"]);
export type GoalRunKind = typeof GoalRunKind.Type;

export const GoalTask = Schema.Struct({
  id: GoalTaskId,
  goalId: GoalId,
  title: Schema.String,
  description: Schema.String,
  status: GoalTaskStatus,
  order: NonNegativeInt,
  required: Schema.Boolean,
  dependencies: Schema.Array(Schema.String),
  completionCriteria: Schema.Array(Schema.String),
  verificationMethod: Schema.NullOr(Schema.String),
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
});
export type GoalTask = typeof GoalTask.Type;

export const GoalEvidence = Schema.Struct({
  id: GoalEvidenceId,
  goalId: GoalId,
  taskId: Schema.NullOr(GoalTaskId),
  kind: Schema.Literals([
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
    "other"
  ]),
  label: Schema.String,
  reference: Schema.String,
  passed: Schema.Boolean,
  revision: Schema.NullOr(Schema.String),
  createdAt: Schema.Number,
});
export type GoalEvidence = typeof GoalEvidence.Type;

export const GoalBlocker = Schema.Struct({
  reason: Schema.String,
  userAction: Schema.NullOr(Schema.String),
  retryable: Schema.Boolean,
  detectedAt: Schema.Number,
});
export type GoalBlocker = typeof GoalBlocker.Type;

export const Goal = Schema.Struct({
  id: GoalId,
  appId: ProjectId,
  originatingChatId: Schema.NullOr(ThreadId),
  goalChatId: Schema.NullOr(ThreadId),
  title: Schema.String,
  objective: Schema.String,
  definitionOfDone: Schema.Array(Schema.String),
  constraints: Schema.Array(Schema.String),
  status: GoalStatus,
  executionTarget: GoalExecutionTarget,
  currentPhase: Schema.NullOr(Schema.String),
  currentTask: Schema.NullOr(Schema.String),
  blocker: Schema.NullOr(GoalBlocker),
  nextRetryAt: Schema.NullOr(Schema.Number),
  consecutiveFailures: NonNegativeInt,
  verifiedTaskCount: NonNegativeInt,
  totalTaskCount: NonNegativeInt,
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
  activatedAt: Schema.NullOr(Schema.Number),
  completedAt: Schema.NullOr(Schema.Number),
  cancelledAt: Schema.NullOr(Schema.Number),
  lastHeartbeatAt: Schema.NullOr(Schema.Number),
  stateRevision: NonNegativeInt,
  tasks: Schema.Array(GoalTask),
  evidence: Schema.Array(GoalEvidence),
});
export type Goal = typeof Goal.Type;

export const GoalActivityEvent = Schema.Struct({
  id: Schema.String,
  goalId: GoalId,
  type: Schema.String,
  summary: Schema.String,
  metadata: Schema.Record(Schema.String, Schema.Unknown),
  createdAt: Schema.Number,
});
export type GoalActivityEvent = typeof GoalActivityEvent.Type;

export const GoalRun = Schema.Struct({
  id: GoalRunId,
  goalId: GoalId,
  appId: ProjectId,
  chatId: ThreadId,
  kind: GoalRunKind,
  status: GoalRunStatus,
  prompt: Schema.String,
  attempt: PositiveInt,
  runnerId: Schema.NullOr(Schema.String),
  leaseExpiresAt: Schema.NullOr(Schema.Number),
  createdAt: Schema.Number,
  startedAt: Schema.NullOr(Schema.Number),
  finishedAt: Schema.NullOr(Schema.Number),
  error: Schema.NullOr(Schema.String),
});
export type GoalRun = typeof GoalRun.Type;

export const GoalRunRequested = Schema.Struct({
  run: GoalRun,
});
export type GoalRunRequested = typeof GoalRunRequested.Type;

export const GoalUpdated = Schema.Struct({
  goal: Goal,
  reason: Schema.String,
});
export type GoalUpdated = typeof GoalUpdated.Type;

export const GoalControlRequested = Schema.Struct({
  goalId: GoalId,
  chatId: Schema.NullOr(ThreadId),
  action: Schema.Literals(["pause", "cancel", "interrupt"]),
});
export type GoalControlRequested = typeof GoalControlRequested.Type;
