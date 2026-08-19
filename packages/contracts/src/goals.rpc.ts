import { Schema } from "effect";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";
import { WsRpcError } from "./rpc";
import { Goal, GoalId, GoalStatus, GoalActivityEvent, GoalExecutionTarget } from "./goals";


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

export const WS_GOALS_SUBSCRIBE = "goals:subscribe" as const;

/**
 * Live goal activity streamed from the engine (see ./goals for the schema —
 * it lives in the leaf module so ws.ts can reference it cycle-free).
 */
import { GoalDomainEvent } from "./goals";
export { GoalDomainEvent };

export const WsGoalsSubscribeRpc = Rpc.make(WS_GOALS_SUBSCRIBE, {
  payload: Schema.Struct({}),
  success: GoalDomainEvent,
  error: WsRpcError,
  stream: true,
});

export const WsGoalsCreateGoalRpc = Rpc.make(GOALS_WS_METHODS.createGoal, {
  payload: Schema.Struct({
    appId: Schema.optional(Schema.NullOr(Schema.Number)),
    chatId: Schema.optional(Schema.Number),
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
  payload: Schema.Struct({ appId: Schema.optional(Schema.NullOr(Schema.Number)) }),
  success: Schema.NullOr(Goal),
  error: WsRpcError,
});

export const WsGoalsListGoalsRpc = Rpc.make(GOALS_WS_METHODS.listGoals, {
  payload: Schema.Struct({
    appId: Schema.optional(Schema.Number),
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

/**
 * Live goals group. Lives in this module (not rpc.ts) to keep the import
 * direction one-way: goals.rpc already imports WsRpcError from ./rpc, so
 * a reverse import would create a module-eval cycle.
 */
export const WsGoalsRpcGroup = RpcGroup.make(
  WsGoalsCreateGoalRpc,
  WsGoalsGetGoalRpc,
  WsGoalsGetActiveGoalRpc,
  WsGoalsListGoalsRpc,
  WsGoalsListActivityRpc,
  WsGoalsPauseGoalRpc,
  WsGoalsResumeGoalRpc,
  WsGoalsCancelGoalRpc,
  WsGoalsEditGoalRpc,
  WsGoalsSteerGoalRpc,
  WsGoalsRetryGoalRpc,
  WsGoalsVerifyGoalRpc,
  WsGoalsSubscribeRpc,
);
