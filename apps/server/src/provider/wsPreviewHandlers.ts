/**
 * WebSocket handlers for the preview RPC group.
 *
 * The preview pane talks to the Flutter Builder engine through the engine
 * provider adapter's per-thread session (which owns the `flutter run` child
 * process). Keeping the handlers out of `wsRpc.ts` mirrors
 * `device/wsDeviceHandlers.ts`: the group is exhaustively handled whether or
 * not an engine session exists, and engine-level failures surface as WsRpcError
 * messages the pane can render inline.
 *
 * Preview ops are keyed by the thread's *engine* session, but the chat thread
 * itself may run on any provider. The pane therefore drives a lazily-created
 * engine session: a thread with no engine session yet gets one started
 * (resolving the workspace cwd) before the op dispatches, so "Unknown engine
 * adapter thread" is replaced by the session actually coming up. The
 * session-ensure strategy is injected because only the WS-RPC layer can
 * resolve the thread's workspace from the projection read model.
 *
 * @module provider/wsPreviewHandlers
 */
import {
  PREVIEW_WS_METHODS,
  ThreadId,
  WsRpcError,
  type PreviewAnalyzeInput,
  type PreviewAnalyzeResult,
  type PreviewBuildStartInput,
  type PreviewBuildStartResult,
  type PreviewBuildStateInput,
  type PreviewBuildStateResult,
  type PreviewGetStateInput,
  type PreviewReloadInput,
  type PreviewReloadResult,
  type PreviewState,
  type PreviewStartInput,
  type PreviewStartResult,
  type PreviewStopInput,
  type PreviewStopResult,
  type PreviewTestInput,
  type PreviewTestResult,
  type PreviewScreenshotInput,
  type PreviewScreenshotResult,
} from "@caide/contracts";
import { Effect } from "effect";

import type { ProviderAdapterError } from "./Errors.ts";
import type { EngineAdapterShape } from "./Services/EngineAdapter.ts";
import type { ProviderAdapterRegistryShape } from "./Services/ProviderAdapterRegistry.ts";

/**
 * Resolve the engine adapter. The registry's base `getByProvider` shapes the
 * common provider surface; preview ops exist only on the engine adapter, so
 * narrow the resolved adapter to `EngineAdapterShape`. The engine group is
 * only wired when the engine adapter is registered, and a swapped-in adapter
 * without preview ops fails its effect as an unsupported preview below.
 */
const resolveEngineAdapter = (
  registry: ProviderAdapterRegistryShape,
): Effect.Effect<EngineAdapterShape, WsRpcError> =>
  registry.getByProvider("engine").pipe(
    Effect.mapError((cause) => new WsRpcError({ message: cause.message })),
    Effect.map((adapter) => adapter as EngineAdapterShape),
  );

/**
 * Lazily ensure the thread's engine session exists before dispatching a
 * preview op. A thread that has never started an engine session (e.g. its chat
 * provider is a stock CLI/API adapter) has no flutter process to drive; this
 * starts one in the thread's workspace so the pane works without requiring the
 * user to bind the thread to the engine provider first.
 */
export interface PreviewSessionEnsurer {
  readonly ensureEngineSession: (threadId: ThreadId) => Effect.Effect<void, WsRpcError>;
}

export interface WsPreviewHandlers {
  readonly [PREVIEW_WS_METHODS.start]: (
    input: PreviewStartInput,
  ) => Effect.Effect<PreviewStartResult, WsRpcError>;
  readonly [PREVIEW_WS_METHODS.stop]: (
    input: PreviewStopInput,
  ) => Effect.Effect<PreviewStopResult, WsRpcError>;
  readonly [PREVIEW_WS_METHODS.reload]: (
    input: PreviewReloadInput,
  ) => Effect.Effect<PreviewReloadResult, WsRpcError>;
  readonly [PREVIEW_WS_METHODS.getState]: (
    input: PreviewGetStateInput,
  ) => Effect.Effect<PreviewState, WsRpcError>;
  readonly [PREVIEW_WS_METHODS.analyze]: (
    input: PreviewAnalyzeInput,
  ) => Effect.Effect<PreviewAnalyzeResult, WsRpcError>;
  readonly [PREVIEW_WS_METHODS.test]: (
    input: PreviewTestInput,
  ) => Effect.Effect<PreviewTestResult, WsRpcError>;
  readonly [PREVIEW_WS_METHODS.buildStart]: (
    input: PreviewBuildStartInput,
  ) => Effect.Effect<PreviewBuildStartResult, WsRpcError>;
  readonly [PREVIEW_WS_METHODS.buildState]: (
    input: PreviewBuildStateInput,
  ) => Effect.Effect<PreviewBuildStateResult, WsRpcError>;
  readonly [PREVIEW_WS_METHODS.screenshot]: (
    input: PreviewScreenshotInput,
  ) => Effect.Effect<PreviewScreenshotResult, WsRpcError>;
}

/**
 * Build the preview handlers. Engine sessions are keyed by thread inside the
 * adapter; preview ops always ensure the session exists first (lazily creating
 * one from the thread's workspace when missing), so the pane never surfaces
 * "unknown engine adapter thread" for a thread whose chat runs on another
 * provider.
 */
export function makeWsPreviewHandlers(
  registry: ProviderAdapterRegistryShape,
  ensure?: PreviewSessionEnsurer,
): WsPreviewHandlers {
  const mapEngineError = (cause: unknown, fallback: string): WsRpcError =>
    cause instanceof WsRpcError
      ? cause
      : new WsRpcError({
          message: cause instanceof Error && cause.message.length > 0 ? cause.message : fallback,
          cause,
        });

  const withEngineSession = <A>(
    threadId: ThreadId,
    run: (adapter: EngineAdapterShape) => Effect.Effect<A, ProviderAdapterError>,
  ): Effect.Effect<A, WsRpcError> =>
    resolveEngineAdapter(registry).pipe(
      Effect.flatMap((adapter) =>
        (ensure?.ensureEngineSession(threadId) ?? Effect.void).pipe(
          Effect.flatMap(() => run(adapter)),
        ),
      ),
      Effect.mapError((cause) => mapEngineError(cause, "Preview operation failed")),
    );

  return {
    [PREVIEW_WS_METHODS.start]: (input) =>
      withEngineSession(ThreadId.makeUnsafe(input.threadId), (adapter) =>
        adapter.previewStart({
          threadId: ThreadId.makeUnsafe(input.threadId),
          ...(input.appDir !== undefined ? { appDir: input.appDir } : {}),
          ...(input.port !== undefined ? { port: input.port } : {}),
          ...(input.hostname !== undefined ? { hostname: input.hostname } : {}),
        }),
      ),
    [PREVIEW_WS_METHODS.stop]: (input) =>
      withEngineSession(ThreadId.makeUnsafe(input.threadId), (adapter) =>
        adapter.previewStop({ threadId: ThreadId.makeUnsafe(input.threadId) }),
      ),
    [PREVIEW_WS_METHODS.reload]: (input) =>
      withEngineSession(ThreadId.makeUnsafe(input.threadId), (adapter) =>
        adapter.previewReload({
          threadId: ThreadId.makeUnsafe(input.threadId),
          hotReload: input.hotReload,
        }),
      ),
    [PREVIEW_WS_METHODS.getState]: (input) =>
      withEngineSession(ThreadId.makeUnsafe(input.threadId), (adapter) =>
        adapter.previewState({ threadId: ThreadId.makeUnsafe(input.threadId) }),
      ),
    [PREVIEW_WS_METHODS.analyze]: (input) =>
      withEngineSession(ThreadId.makeUnsafe(input.threadId), (adapter) =>
        adapter.previewAnalyze({ threadId: ThreadId.makeUnsafe(input.threadId) }),
      ),
    [PREVIEW_WS_METHODS.test]: (input) =>
      withEngineSession(ThreadId.makeUnsafe(input.threadId), (adapter) =>
        adapter.previewTest({
          threadId: ThreadId.makeUnsafe(input.threadId),
          ...(input.testPath !== undefined ? { testPath: input.testPath } : {}),
        }),
      ),
    [PREVIEW_WS_METHODS.buildStart]: (input) =>
      withEngineSession(ThreadId.makeUnsafe(input.threadId), (adapter) =>
        adapter.previewBuildStart({
          threadId: ThreadId.makeUnsafe(input.threadId),
          target: input.target,
          ...(input.channel !== undefined ? { channel: input.channel } : {}),
        }),
      ),
    [PREVIEW_WS_METHODS.buildState]: (input) =>
      withEngineSession(ThreadId.makeUnsafe(input.threadId), (adapter) =>
        adapter.previewBuildState({
          threadId: ThreadId.makeUnsafe(input.threadId),
          buildId: input.buildId,
        }),
      ),
    [PREVIEW_WS_METHODS.screenshot]: (input) =>
      withEngineSession(ThreadId.makeUnsafe(input.threadId), (adapter) =>
        adapter.previewScreenshot({
          threadId: ThreadId.makeUnsafe(input.threadId),
        }),
      ),
  };
}
