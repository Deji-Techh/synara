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

export const UiPromptKind = Schema.Literals([
  "questionnaire",
  "env-vars",
  "integration",
  "tool-consent",
  "mcp-consent",
]);
export type UiPromptKind = typeof UiPromptKind.Type;

/** Server asks the user something mid-turn (answers come back as prompt_answer). */
export const UiPromptHarnessEvent = Schema.Struct({
  type: Schema.Literal("ui_prompt"),
  sessionId: Schema.String,
  requestId: Schema.String,
  kind: UiPromptKind,
  payload: Schema.Unknown,
});
export type UiPromptHarnessEvent = typeof UiPromptHarnessEvent.Type;

/** Server asks the client to reveal a right-dock pane. */
export const UiRevealHarnessEvent = Schema.Struct({
  type: Schema.Literal("ui_reveal"),
  sessionId: Schema.String,
  pane: Schema.Literals(["database", "preview"]),
  reason: Schema.String,
});
export type UiRevealHarnessEvent = typeof UiRevealHarnessEvent.Type;

/** write_plan presentation (approve/request-change in the preview panel). */
export const PlanUpdateHarnessEvent = Schema.Struct({
  type: Schema.Literal("plan_update"),
  sessionId: Schema.String,
  title: Schema.String,
  summary: Schema.String,
  plan: Schema.String,
});
export type PlanUpdateHarnessEvent = typeof PlanUpdateHarnessEvent.Type;

/** exit_plan transition (client raises the Continue-in-Agent-mode gate). */
export const PlanExitHarnessEvent = Schema.Struct({
  type: Schema.Literal("plan_exit"),
  sessionId: Schema.String,
});
export type PlanExitHarnessEvent = typeof PlanExitHarnessEvent.Type;

export const BlueprintVisualSchema = Schema.Struct({
  type: Schema.Literals(["logo", "photo", "illustration", "icon", "background", "other"]),
  description: Schema.String,
  prompt: Schema.String,
});
export type BlueprintVisualSchema = typeof BlueprintVisualSchema.Type;

/** write_app_blueprint presentation (approve/request-change on the card). */
export const BlueprintUpdateHarnessEvent = Schema.Struct({
  type: Schema.Literal("blueprint_update"),
  sessionId: Schema.String,
  appName: Schema.String,
  userPrompt: Schema.String,
  framework: Schema.optional(Schema.String),
  designDirection: Schema.String,
  primaryColor: Schema.String,
  visuals: Schema.Array(BlueprintVisualSchema),
});
export type BlueprintUpdateHarnessEvent = typeof BlueprintUpdateHarnessEvent.Type;

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
  UiPromptHarnessEvent,
  UiRevealHarnessEvent,
  PlanUpdateHarnessEvent,
  PlanExitHarnessEvent,
  BlueprintUpdateHarnessEvent,
]);
export type HarnessEvent = typeof HarnessEvent.Type;
