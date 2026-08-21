/**
 * WebSocket handlers for the database integration RPC group (Neon + Supabase).
 *
 * Mirrors `wsPreviewHandlers.ts`: the group is exhaustively handled whether or
 * not an engine session exists, and engine-level failures surface as
 * WsRpcError messages the Database pane can render inline. Ops are keyed by
 * the thread's engine session; a thread with no session yet gets one started
 * lazily so the pane works without binding the thread to the engine provider.
 *
 * @module provider/wsDatabaseHandlers
 */
import {
  DATABASE_WS_METHODS,
  ThreadId,
  WsRpcError,
  type DatabaseInvokeInput,
  type DatabaseInvokeResult,
} from "@caide/contracts";
import { Effect } from "effect";

import type { EngineAdapterShape } from "./Services/EngineAdapter.ts";
import type { ProviderAdapterRegistryShape } from "./Services/ProviderAdapterRegistry.ts";

const resolveEngineAdapter = (
  registry: ProviderAdapterRegistryShape,
): Effect.Effect<EngineAdapterShape, WsRpcError> =>
  registry.getByProvider("engine").pipe(
    Effect.mapError((cause) => new WsRpcError({ message: cause.message })),
    Effect.map((adapter) => adapter as EngineAdapterShape),
  );

export interface DatabaseSessionEnsurer {
  readonly ensureEngineSession: (threadId: ThreadId) => Effect.Effect<void, WsRpcError>;
}

export interface WsDatabaseHandlers {
  [DATABASE_WS_METHODS.invoke]: (
    input: DatabaseInvokeInput,
  ) => Effect.Effect<DatabaseInvokeResult, WsRpcError>;
}

export const makeWsDatabaseHandlers = (
  providerAdapterRegistry: ProviderAdapterRegistryShape,
  { ensureEngineSession }: DatabaseSessionEnsurer,
): WsDatabaseHandlers => ({
  [DATABASE_WS_METHODS.invoke]: (input) =>
    Effect.gen(function* () {
      const adapter = yield* resolveEngineAdapter(providerAdapterRegistry);
      yield* ensureEngineSession(input.threadId);
      const { value } = yield* adapter
        .databaseInvoke({
          threadId: input.threadId,
          channel: input.channel,
          payload: input.payload,
        })
        .pipe(Effect.mapError((cause) => new WsRpcError({ message: cause.message })));
      return { value };
    }),
});
