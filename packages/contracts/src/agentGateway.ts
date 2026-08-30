/**
 * Public contracts for the Caide agent-control gateway.
 *
 * New gateway tools decode these schemas before doing any work. Keeping the
 * limits here ensures the MCP surface, server implementation, and tests share
 * the same definition of an exact creation/wait plan.
 */
import { Schema } from "effect";

import { ProjectId, ThreadId, TurnId } from "./baseSchemas";
import { ModelSelection, ProviderKind } from "./orchestration";
import { ProviderModelDescriptor } from "./providerDiscovery";
import { ServerProviderAuthStatus } from "./server";

export const CAIDE_GATEWAY_MAX_THREADS_PER_OPERATION = 20;
export const CAIDE_GATEWAY_MAX_REQUEST_ID_LENGTH = 256;
export const CAIDE_GATEWAY_MAX_WAIT_MS = 60_000;

export const CaideGatewayErrorCode = Schema.Literals([
  "caller_session_inactive",
  "caller_turn_inactive",
  "capability_denied",
  "provider_unavailable",
  "model_unavailable",
  "model_option_unavailable",
  "idempotency_conflict",
  "creation_plan_locked",
  "creation_limit_exceeded",
  "thread_not_found",
  "wait_timed_out",
  "operation_failed",
]);
export type CaideGatewayErrorCode = typeof CaideGatewayErrorCode.Type;

export const CaideGatewayError = Schema.Struct({
  code: CaideGatewayErrorCode,
  message: Schema.String,
  details: Schema.optional(Schema.Unknown),
});
export type CaideGatewayError = typeof CaideGatewayError.Type;

export const CaideGatewayErrorResult = Schema.Struct({
  error: CaideGatewayError,
});
export type CaideGatewayErrorResult = typeof CaideGatewayErrorResult.Type;

export const CaideContextResult = Schema.Struct({
  harness: Schema.Struct({
    name: Schema.Literal("Caide"),
    policyVersion: Schema.String,
  }),
  caller: Schema.Struct({
    threadId: ThreadId,
    turnId: Schema.NullOr(TurnId),
    provider: ProviderKind,
    projectId: ProjectId,
  }),
  capabilities: Schema.Struct({
    threadRead: Schema.Boolean,
    threadCreate: Schema.Boolean,
    threadWait: Schema.Boolean,
    automations: Schema.Boolean,
  }),
});
export type CaideContextResult = typeof CaideContextResult.Type;

export const CaideCreateThreadSpec = Schema.Struct({
  prompt: Schema.String.check(Schema.isNonEmpty()),
  title: Schema.optional(Schema.String.check(Schema.isNonEmpty())),
  target: ModelSelection,
  projectId: Schema.optional(ProjectId),
  environment: Schema.optional(Schema.Literals(["local", "worktree"])),
  baseRef: Schema.optional(Schema.String.check(Schema.isNonEmpty())),
  // Legacy inputs remain decodable for replay/backward compatibility, but the
  // MCP catalog no longer advertises branch-backed worktree creation.
  baseBranch: Schema.optional(Schema.String.check(Schema.isNonEmpty())),
  branchName: Schema.optional(Schema.String.check(Schema.isNonEmpty())),
  runtimeMode: Schema.optional(Schema.Literals(["approval-required", "full-access"])),
});
export type CaideCreateThreadSpec = typeof CaideCreateThreadSpec.Type;

const CaideGatewayRequestId = Schema.String.check(Schema.isNonEmpty()).check(
  Schema.isMaxLength(CAIDE_GATEWAY_MAX_REQUEST_ID_LENGTH),
);

export const CaideCreateThreadsInput = Schema.Struct({
  requestId: CaideGatewayRequestId,
  threads: Schema.Array(CaideCreateThreadSpec)
    .check(Schema.isMinLength(1))
    .check(Schema.isMaxLength(CAIDE_GATEWAY_MAX_THREADS_PER_OPERATION)),
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type CaideCreateThreadsInput = typeof CaideCreateThreadsInput.Type;

export const CaideProviderCatalog = Schema.Struct({
  provider: ProviderKind,
  defaultModel: Schema.NullOr(Schema.String),
  models: Schema.Array(ProviderModelDescriptor),
  enabled: Schema.Boolean,
  available: Schema.Boolean,
  authStatus: Schema.optional(ServerProviderAuthStatus),
  source: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
});
export type CaideProviderCatalog = typeof CaideProviderCatalog.Type;

export const CaideGatewayTargetOptionValue = Schema.Union([
  Schema.String,
  Schema.Number,
  Schema.Boolean,
]);
export type CaideGatewayTargetOptionValue = typeof CaideGatewayTargetOptionValue.Type;

export const CaideGatewayTargetOptionRule = Schema.Struct({
  key: Schema.String,
  valueType: Schema.Literals(["string", "number", "boolean"]),
  allowedValues: Schema.Array(CaideGatewayTargetOptionValue),
  allowedValuesSource: Schema.Literals(["provider-contract", "model-discovery"]),
});
export type CaideGatewayTargetOptionRule = typeof CaideGatewayTargetOptionRule.Type;

export const CaideGatewayTargetConstruction = Schema.Struct({
  modelValueSource: Schema.Literal("providers[].models[].slug"),
  primaryOptionKey: Schema.String,
  alternativeOptionKeys: Schema.Array(Schema.String),
  optionSelectionRule: Schema.String,
  providerOptions: Schema.Array(CaideGatewayTargetOptionRule),
  optionsByModel: Schema.Record(Schema.String, Schema.Array(CaideGatewayTargetOptionRule)),
  exampleTarget: Schema.NullOr(ModelSelection),
});
export type CaideGatewayTargetConstruction = typeof CaideGatewayTargetConstruction.Type;

export const CaideCapabilitiesResult = Schema.Struct({
  targetConstruction: Schema.Record(Schema.String, CaideGatewayTargetConstruction),
  providers: Schema.Array(CaideProviderCatalog),
  limits: Schema.Struct({
    maxThreadsPerOperation: Schema.Int,
    maxWaitMs: Schema.Int,
    oneCreationPlanPerActiveTurn: Schema.Boolean,
  }),
});
export type CaideCapabilitiesResult = typeof CaideCapabilitiesResult.Type;

export const CaideCreatedThreadResult = Schema.Struct({
  index: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  threadId: ThreadId,
  projectId: ProjectId,
  title: Schema.String,
  target: ModelSelection,
  provider: ProviderKind,
  model: Schema.String,
  runtimeMode: Schema.Literals(["approval-required", "full-access"]),
  environment: Schema.Literals(["local", "worktree"]),
  branch: Schema.NullOr(Schema.String),
  worktreePath: Schema.NullOr(Schema.String),
  status: Schema.Literal("task_dispatched"),
});
export type CaideCreatedThreadResult = typeof CaideCreatedThreadResult.Type;

export const CaideCreateThreadsResult = Schema.Struct({
  operationId: Schema.String,
  requestId: CaideGatewayRequestId,
  requestedCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  createdCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  threadIds: Schema.Array(ThreadId),
  threads: Schema.Array(CaideCreatedThreadResult),
});
export type CaideCreateThreadsResult = typeof CaideCreateThreadsResult.Type;

export const CaideWaitForThreadsInput = Schema.Struct({
  threadIds: Schema.Array(ThreadId)
    .check(Schema.isMinLength(1))
    .check(Schema.isMaxLength(CAIDE_GATEWAY_MAX_THREADS_PER_OPERATION)),
  runIds: Schema.optional(
    Schema.Array(Schema.NullOr(TurnId)).check(
      Schema.isMaxLength(CAIDE_GATEWAY_MAX_THREADS_PER_OPERATION),
    ),
  ),
  timeoutMs: Schema.optional(
    Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).check(
      Schema.isLessThanOrEqualTo(CAIDE_GATEWAY_MAX_WAIT_MS),
    ),
  ),
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type CaideWaitForThreadsInput = typeof CaideWaitForThreadsInput.Type;

export const CaideWaitedThreadResult = Schema.Struct({
  threadId: ThreadId,
  runId: Schema.NullOr(TurnId),
  state: Schema.Literals(["idle", "pending", "running", "completed", "error", "interrupted"]),
  terminal: Schema.Boolean,
  timedOut: Schema.Boolean,
  summary: Schema.NullOr(Schema.String),
  summaryTruncated: Schema.Boolean,
  error: Schema.NullOr(Schema.String),
  readThread: Schema.Struct({
    tool: Schema.Literal("caide_read_thread"),
    arguments: Schema.Struct({ threadId: ThreadId }),
  }),
});
export type CaideWaitedThreadResult = typeof CaideWaitedThreadResult.Type;

export const CaideWaitForThreadsResult = Schema.Struct({
  callerThreadId: ThreadId,
  runIds: Schema.Array(Schema.NullOr(TurnId)),
  allTerminal: Schema.Boolean,
  timedOut: Schema.Boolean,
  threads: Schema.Array(CaideWaitedThreadResult),
});
export type CaideWaitForThreadsResult = typeof CaideWaitForThreadsResult.Type;
