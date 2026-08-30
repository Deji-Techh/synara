// FILE: subagents.rpc.ts
// Purpose: WS contracts for engine subagent visibility: a snapshot RPC of
// currently-registered engine subagents (`subagents:getActive`) and a live
// stream of `spawn_subagent` lifecycle events (`subagents:subscribe`). The
// engine owns subagent state; the server relays verbatim, mirroring the goals
// bridge. Schemas live in the leaf module ./subagents so ws.ts stays
// cycle-free.
// Layer: Contracts (schema-only)

import { Schema } from "effect";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

import { WsRpcError } from "./rpc";
import { EngineActiveSubagent, EngineSubagentEvent } from "./subagents";

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
export const WsSubagentsRpcGroup = RpcGroup.make(WsSubagentsGetActiveRpc, WsSubagentsSubscribeRpc);
