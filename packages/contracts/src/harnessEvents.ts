import { Schema } from "effect";
import { ProjectFramework } from "./projectFramework";

export const TurnStatus = Schema.Literals([
  "created",
  "running",
  "waiting",
  "completed",
  "failed",
  "cancelled",
  "aborted",
]);
export type TurnStatus = typeof TurnStatus.Type;

export const TokenHarnessEvent = Schema.Struct({
  type: Schema.Literal("token"),
  sessionId: Schema.String,
  content: Schema.String,
});
export type TokenHarnessEvent = typeof TokenHarnessEvent.Type;

export const ToolCallStatus = Schema.Literals(["started", "completed", "failed"]);
export type ToolCallStatus = typeof ToolCallStatus.Type;

export const ToolCallHarnessEvent = Schema.Struct({
  type: Schema.Literal("tool_call"),
  sessionId: Schema.String,
  id: Schema.String,
  name: Schema.String,
  args: Schema.Unknown,
  status: ToolCallStatus,
  result: Schema.optional(Schema.Unknown),
  durationMs: Schema.optional(Schema.Number),
});
export type ToolCallHarnessEvent = typeof ToolCallHarnessEvent.Type;

export const StageHarnessEvent = Schema.Struct({
  type: Schema.Literal("stage"),
  sessionId: Schema.String,
  from: Schema.String,
  to: Schema.String,
  meta: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
});
export type StageHarnessEvent = typeof StageHarnessEvent.Type;

export const CheckpointHarnessEvent = Schema.Struct({
  type: Schema.Literal("checkpoint"),
  sessionId: Schema.String,
  id: Schema.String,
  reason: Schema.String,
  requiresResponse: Schema.Boolean,
  diff: Schema.optional(Schema.String),
});
export type CheckpointHarnessEvent = typeof CheckpointHarnessEvent.Type;

export const ArtifactUpdatedHarnessEvent = Schema.Struct({
  type: Schema.Literal("artifact_updated"),
  sessionId: Schema.String,
  path: Schema.String,
  framework: ProjectFramework,
  sizeBytes: Schema.Number,
});
export type ArtifactUpdatedHarnessEvent = typeof ArtifactUpdatedHarnessEvent.Type;

export const TurnStartHarnessEvent = Schema.Struct({
  type: Schema.Literal("turn_start"),
  sessionId: Schema.String,
  turnId: Schema.String,
  prompt: Schema.String,
});
export type TurnStartHarnessEvent = typeof TurnStartHarnessEvent.Type;

export const TurnEndHarnessEvent = Schema.Struct({
  type: Schema.Literal("turn_end"),
  sessionId: Schema.String,
  turnId: Schema.String,
  status: TurnStatus,
});
export type TurnEndHarnessEvent = typeof TurnEndHarnessEvent.Type;

export const VerifierResultHarnessEvent = Schema.Struct({
  type: Schema.Literal("verifier_result"),
  sessionId: Schema.String,
  passed: Schema.Boolean,
  confidence: Schema.Number,
  tasteScore: Schema.Number,
  issues: Schema.Array(Schema.String),
});
export type VerifierResultHarnessEvent = typeof VerifierResultHarnessEvent.Type;

export const CompactionHarnessEvent = Schema.Struct({
  type: Schema.Literal("compaction"),
  sessionId: Schema.String,
  reason: Schema.String,
  summaryLength: Schema.Number,
});
export type CompactionHarnessEvent = typeof CompactionHarnessEvent.Type;

export const ErrorHarnessEvent = Schema.Struct({
  type: Schema.Literal("error"),
  sessionId: Schema.String,
  code: Schema.String,
  message: Schema.String,
  recoverable: Schema.Boolean,
});
export type ErrorHarnessEvent = typeof ErrorHarnessEvent.Type;

export const HarnessEvent = Schema.Union([
  TokenHarnessEvent,
  ToolCallHarnessEvent,
  StageHarnessEvent,
  CheckpointHarnessEvent,
  ArtifactUpdatedHarnessEvent,
  TurnStartHarnessEvent,
  TurnEndHarnessEvent,
  VerifierResultHarnessEvent,
  CompactionHarnessEvent,
  ErrorHarnessEvent,
]);
export type HarnessEvent = typeof HarnessEvent.Type;
