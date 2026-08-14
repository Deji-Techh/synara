import { Schema } from "effect";
import * as Rpc from "effect/unstable/rpc/Rpc";
import { WsRpcError } from "./rpc";
import { Goal, GoalId, GoalStatus, GoalActivityEvent, GoalRun, GoalExecutionTarget } from "./goals";
import { ProjectId, ThreadId } from "./baseSchemas";

export const GOALS_WS_METHODS = {
  createGoal: "goals:create",
  getGoal: "goals:get",
  getActiveGoal: "goals:getActive",
  listGoals: "goals:list",
  listActivity: "goals:listActivity",
  pauseGoal: "goals:pause",
  resumeGoal: "goals:resume",
  cancelGoal: "goals:cancel",
  editGoal: "goals:edit",
  steerGoal: "goals:steer",
  retryGoal: "goals:retry",
  verifyGoal: "goals:verify",
} as const;

export const WsGoalsCreateGoalRpc = Rpc.make(GOALS_WS_METHODS.createGoal, {
  payload: Schema.Struct({
    appId: Schema.optional(Schema.NullOr(ProjectId)),
    chatId: Schema.optional(ThreadId),
    title: Schema.optional(Schema.String),
    objective: Schema.String,
    definitionOfDone: Schema.optional(Schema.Array(Schema.String)),
    constraints: Schema.optional(Schema.Array(Schema.String)),
    executionTarget: Schema.optional(GoalExecutionTarget),
  }),
  success: Goal,
  error: WsRpcError,
});

export const WsGoalsGetGoalRpc = Rpc.make(GOALS_WS_METHODS.getGoal, {
  payload: Schema.Struct({ goalId: GoalId }),
  success: Goal,
  error: WsRpcError,
});

export const WsGoalsGetActiveGoalRpc = Rpc.make(GOALS_WS_METHODS.getActiveGoal, {
  payload: Schema.Struct({ appId: Schema.optional(Schema.NullOr(ProjectId)) }),
  success: Schema.NullOr(Goal),
  error: WsRpcError,
});

export const WsGoalsListGoalsRpc = Rpc.make(GOALS_WS_METHODS.listGoals, {
  payload: Schema.Struct({
    appId: Schema.optional(ProjectId),
    statuses: Schema.optional(Schema.Array(GoalStatus)),
  }),
  success: Schema.Array(Goal),
  error: WsRpcError,
});

export const WsGoalsListActivityRpc = Rpc.make(GOALS_WS_METHODS.listActivity, {
  payload: Schema.Struct({
    goalId: GoalId,
    limit: Schema.optional(Schema.Number),
  }),
  success: Schema.Array(GoalActivityEvent),
  error: WsRpcError,
});

export const WsGoalsPauseGoalRpc = Rpc.make(GOALS_WS_METHODS.pauseGoal, {
  payload: Schema.Struct({
    goalId: GoalId,
    reason: Schema.optional(Schema.String),
  }),
  success: Goal,
  error: WsRpcError,
});

export const WsGoalsResumeGoalRpc = Rpc.make(GOALS_WS_METHODS.resumeGoal, {
  payload: Schema.Struct({ goalId: GoalId }),
  success: Goal,
  error: WsRpcError,
});

export const WsGoalsCancelGoalRpc = Rpc.make(GOALS_WS_METHODS.cancelGoal, {
  payload: Schema.Struct({
    goalId: GoalId,
    reason: Schema.optional(Schema.String),
  }),
  success: Goal,
  error: WsRpcError,
});

export const WsGoalsEditGoalRpc = Rpc.make(GOALS_WS_METHODS.editGoal, {
  payload: Schema.Struct({
    goalId: GoalId,
    title: Schema.optional(Schema.String),
    objective: Schema.optional(Schema.String),
    definitionOfDone: Schema.optional(Schema.Array(Schema.String)),
    constraints: Schema.optional(Schema.Array(Schema.String)),
    executionTarget: Schema.optional(GoalExecutionTarget),
  }),
  success: Goal,
  error: WsRpcError,
});

export const WsGoalsSteerGoalRpc = Rpc.make(GOALS_WS_METHODS.steerGoal, {
  payload: Schema.Struct({
    goalId: GoalId,
    instruction: Schema.String,
  }),
  success: Goal,
  error: WsRpcError,
});

export const WsGoalsRetryGoalRpc = Rpc.make(GOALS_WS_METHODS.retryGoal, {
  payload: Schema.Struct({ goalId: GoalId }),
  success: Goal,
  error: WsRpcError,
});

export const WsGoalsVerifyGoalRpc = Rpc.make(GOALS_WS_METHODS.verifyGoal, {
  payload: Schema.Struct({ goalId: GoalId }),
  success: Goal,
  error: WsRpcError,
});
