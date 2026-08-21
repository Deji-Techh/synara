// FILE: subagents.ts
// Purpose: Schemas for engine subagent visibility. Leaf module (no imports
// from rpc.ts/ws.ts) so ws.ts can reference it cycle-free; the RPC
// definitions live in ./subagents.rpc.
// Layer: Contracts (schema-only)

import { Schema } from "effect";

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
