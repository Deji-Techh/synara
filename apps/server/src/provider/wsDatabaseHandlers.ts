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
import path from "node:path";

const resolveEngineAdapter = (
  registry: ProviderAdapterRegistryShape,
): Effect.Effect<EngineAdapterShape, WsRpcError> =>
  registry.getByProvider("engine").pipe(
    Effect.mapError((cause) => new WsRpcError({ message: cause.message })),
    Effect.map((adapter) => adapter as EngineAdapterShape),
  );

export interface DatabaseSessionEnsurer {
  readonly ensureEngineSession: (threadId: ThreadId) => Effect.Effect<void, WsRpcError>;
  /** Resolve the trusted project workspace owning this thread. */
  readonly resolveProjectWorkspace: (
    threadId: ThreadId,
  ) => Effect.Effect<string | null, WsRpcError>;
}

export interface WsDatabaseHandlers {
  [DATABASE_WS_METHODS.invoke]: (
    input: DatabaseInvokeInput,
  ) => Effect.Effect<DatabaseInvokeResult, WsRpcError>;
}

export const makeWsDatabaseHandlers = (
  providerAdapterRegistry: ProviderAdapterRegistryShape,
  { ensureEngineSession, resolveProjectWorkspace }: DatabaseSessionEnsurer,
): WsDatabaseHandlers => ({
  [DATABASE_WS_METHODS.invoke]: (input) =>
    Effect.gen(function* () {
      const adapter = yield* resolveEngineAdapter(providerAdapterRegistry);
      yield* ensureEngineSession(input.threadId);
      const workspaceRoot = yield* resolveProjectWorkspace(input.threadId);
      if (workspaceRoot === null) {
        return yield* new WsRpcError({
          message: `Cannot open the database pane: thread '${input.threadId}' has no project workspace.`,
        });
      }
      const { value } = yield* adapter
        .databaseInvoke({
          threadId: input.threadId,
          channel: "list-apps",
        })
        .pipe(Effect.mapError((cause) => new WsRpcError({ message: cause.message })));
      const apps =
        value && typeof value === "object" && Array.isArray((value as { apps?: unknown }).apps)
          ? (value as { apps: unknown[] }).apps
          : [];
      const normalizedWorkspace = path.resolve(workspaceRoot);
      const app = apps.find((candidate) => {
        if (!candidate || typeof candidate !== "object") return false;
        const record = candidate as { resolvedPath?: unknown; path?: unknown };
        const candidatePath =
          typeof record.resolvedPath === "string"
            ? record.resolvedPath
            : typeof record.path === "string" && path.isAbsolute(record.path)
              ? record.path
              : null;
        return candidatePath !== null && path.resolve(candidatePath) === normalizedWorkspace;
      });
      if (!app || typeof app !== "object") {
        return yield* new WsRpcError({
          message: "The project's database record could not be resolved for this workspace.",
        });
      }
      const appRecord = app as {
        id?: unknown;
        neonProjectId?: unknown;
      };
      const payload =
        input.payload && typeof input.payload === "object"
          ? (input.payload as Record<string, unknown>)
          : undefined;
      if (
        payload?.appId !== undefined &&
        (typeof appRecord.id !== "number" || payload.appId !== appRecord.id)
      ) {
        return yield* new WsRpcError({ message: "Database app does not belong to this project." });
      }
      if (
        input.channel === "neon:get-project" &&
        payload?.projectId !== undefined &&
        payload.projectId !== appRecord.neonProjectId
      ) {
        return yield* new WsRpcError({ message: "Neon project does not belong to this project." });
      }
      if (input.channel === "list-apps") {
        return { value: { apps: [app] } };
      }
      const scopedPayload = {
        ...(payload ?? {}),
        ...(typeof appRecord.id === "number" && payload?.appId === undefined
          ? { appId: appRecord.id }
          : {}),
      };
      const result = yield* adapter
        .databaseInvoke({
          threadId: input.threadId,
          channel: input.channel,
          payload: scopedPayload,
        })
        .pipe(Effect.mapError((cause) => new WsRpcError({ message: cause.message })));
      return result;
    }),
});
