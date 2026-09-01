// FILE: wsRpcError.ts
// Purpose: Leaf home for the shared WsRpcError schema type. Lives outside
//          rpc.ts so modules that rpc.ts itself imports (directly or via
//          ws.ts) can reference the error without creating an import cycle.
// Layer: Contracts (schema-only)

import { Schema } from "effect";

export class WsRpcError extends Schema.TaggedErrorClass<WsRpcError>()("WsRpcError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown),
  code: Schema.optional(Schema.String),
  retryable: Schema.optional(Schema.Boolean),
  retryAfterMs: Schema.optional(Schema.Number),
}) {}
