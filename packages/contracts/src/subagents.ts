// FILE: subagents.ts
// Purpose: Contracts for engine subagent visibility: a snapshot RPC of
// currently-registered engine subagents (`subagents:getActive`) and a live
// stream of `spawn_subagent` lifecycle events (`subagents:subscribe`). The
// engine owns subagent state; the server relays verbatim, mirroring the goals
// bridge. Kept in a leaf module so ws.ts can reference it cycle-free.
// Layer: Contracts (schema-only)

import { Schema } from "effect";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

import { WsRpcError } from "./rpc";

export const EngineSubagentStatus = Schema.Literals(["running", "completed", "failed"]);
export type EngineSubagentStatus = typeof EngineSubagentStatus.Type;

/**
 * Live lifecycle event relayed from the engine's `subagent:updated`
 * notification. appId/chatId are engine-native rowids; scoping to Caide
 * threads happens at the WS boundary.
 */
export const EngineSubagentEvent = Schema.Struct({
  appId: Schema.optional(Schema.Number),
  chatId: Schema.optional(Schema.Number),
  taskId: Schema.String,
  role: Schema.String,
  task: Schema.String,
  status: EngineSubagentStatus,
  startedAt: Schema.Number,
});
export type EngineSubagentEvent = typeof EngineSubagentEvent.Type;

/** Snapshot entry for a subagent registered in the engine. */
export const EngineActiveSubagent = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  startedAt: Schema.Number,
  status: Schema.optional(EngineSubagentStatus),
  appId: Schema.optional(Schema.Number),
  chatId: Schema.optional(Schema.Number),
});
export type EngineActiveSubagent = typeof EngineActiveSubagent.Type;

export const SUBAGENTS_WS_METHODS = {
  getActive: "subagents:getActive",
} as const;

export const WS_SUBAGENTS_SUBSCRIBE = "subagents:subscribe" as const;

export const WsSubagentsGetActiveRpc = Rpc.make(SUBAGENTS_WS_METHODS.getActive, {
  payload: Schema.Struct({
    appId: Schema.optional(Schema.NullOr(Schema.Number)),
  }),
  success: Schema.Array(EngineActiveSubagent),
  error: WsRpcError,
});

export const WsSubagentsSubscribeRpc = Rpc.make(WS_SUBAGENTS_SUBSCRIBE, {
  payload: Schema.Struct({}),
  success: EngineSubagentEvent,
  error: WsRpcError,
  stream: true,
});

/**
 * Live subagents group. Lives in this module (not rpc.ts) to keep the import
 * direction one-way: this file already imports WsRpcError from ./rpc, so a
 * reverse import would create a module-eval cycle.
 */
export const WsSubagentsRpcGroup = RpcGroup.make(
  WsSubagentsGetActiveRpc,
  WsSubagentsSubscribeRpc,
);
