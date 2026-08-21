import { Schema } from "effect";

import { ThreadId, TrimmedNonEmptyString } from "./baseSchemas";

// ── WebSocket surface ────────────────────────────────────────────────

/**
 * Database integration surface (Neon + Supabase). The web Database pane
 * forwards engine IPC channels over a single gated RPC method instead of
 * duplicating every engine contract across the WS boundary; the server
 * allowlists the channel namespaces.
 */
export const DATABASE_WS_METHODS = {
  invoke: "database.invoke",
} as const;

// ── Schemas ──────────────────────────────────────────────────────────

const DATABASE_CHANNEL_MAX_LENGTH = 128;

/**
 * Engine dyad-IPC channel for a database operation, e.g. "neon:list-projects"
 * or "supabase:list-organizations". Only the neon:* and supabase:* namespaces
 * plus two read-only app channels (so the pane can resolve the workspace's
 * app and its integration state) are relayed; the server rejects everything
 * else before it reaches the engine.
 */
export const DatabaseChannel = TrimmedNonEmptyString.check(
  Schema.isMaxLength(DATABASE_CHANNEL_MAX_LENGTH),
).check(Schema.isPattern(/^(?:(?:neon|supabase):[a-z0-9:-]+|list-apps|get-app)$/));

export const DatabaseInvokeInput = Schema.Struct({
  threadId: ThreadId,
  channel: DatabaseChannel,
  /** JSON-serializable engine handler input; validated again engine-side. */
  payload: Schema.optional(Schema.Unknown),
});
export type DatabaseInvokeInput = typeof DatabaseInvokeInput.Type;

export const DatabaseInvokeResult = Schema.Struct({
  /** The unwrapped engine handler result, JSON-serializable. */
  value: Schema.Unknown,
});
export type DatabaseInvokeResult = typeof DatabaseInvokeResult.Type;
