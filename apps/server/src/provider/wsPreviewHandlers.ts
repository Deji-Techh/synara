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
} from "@caide/contracts";
import { Effect } from "effect";

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
}

/**
 * Build the four preview handlers. Engine sessions are keyed by thread inside
 * the adapter; there is no preview engine without a session, so the handlers
 * fail with a clear message instead of guessing.
 */
export function makeWsPreviewHandlers(registry: ProviderAdapterRegistryShape): WsPreviewHandlers {
  const mapEngineError = (cause: unknown, fallback: string): WsRpcError =>
    cause instanceof WsRpcError
      ? cause
      : new WsRpcError({
          message: cause instanceof Error && cause.message.length > 0 ? cause.message : fallback,
          cause,
        });

  return {
    [PREVIEW_WS_METHODS.start]: (input) =>
      resolveEngineAdapter(registry).pipe(
        Effect.flatMap((adapter) =>
          adapter.previewStart({
            threadId: ThreadId.makeUnsafe(input.threadId),
            ...(input.appDir !== undefined ? { appDir: input.appDir } : {}),
            ...(input.port !== undefined ? { port: input.port } : {}),
            ...(input.hostname !== undefined ? { hostname: input.hostname } : {}),
          }),
        ),
        Effect.mapError((cause) => mapEngineError(cause, "Failed to start preview")),
      ),
    [PREVIEW_WS_METHODS.stop]: (input) =>
      resolveEngineAdapter(registry).pipe(
        Effect.flatMap((adapter) =>
          adapter.previewStop({ threadId: ThreadId.makeUnsafe(input.threadId) }),
        ),
        Effect.mapError((cause) => mapEngineError(cause, "Failed to stop preview")),
      ),
    [PREVIEW_WS_METHODS.reload]: (input) =>
      resolveEngineAdapter(registry).pipe(
        Effect.flatMap((adapter) =>
          adapter.previewReload({
            threadId: ThreadId.makeUnsafe(input.threadId),
            hotReload: input.hotReload,
          }),
        ),
        Effect.mapError((cause) => mapEngineError(cause, "Failed to reload preview")),
      ),
    [PREVIEW_WS_METHODS.getState]: (input) =>
      resolveEngineAdapter(registry).pipe(
        Effect.flatMap((adapter) =>
          adapter.previewState({ threadId: ThreadId.makeUnsafe(input.threadId) }),
        ),
        Effect.mapError((cause) => mapEngineError(cause, "Failed to read preview state")),
      ),
    [PREVIEW_WS_METHODS.analyze]: (input) =>
      resolveEngineAdapter(registry).pipe(
        Effect.flatMap((adapter) =>
          adapter.previewAnalyze({ threadId: ThreadId.makeUnsafe(input.threadId) }),
        ),
        Effect.mapError((cause) => mapEngineError(cause, "Failed to run flutter analyze")),
      ),
    [PREVIEW_WS_METHODS.test]: (input) =>
      resolveEngineAdapter(registry).pipe(
        Effect.flatMap((adapter) =>
          adapter.previewTest({
            threadId: ThreadId.makeUnsafe(input.threadId),
            ...(input.testPath !== undefined ? { testPath: input.testPath } : {}),
          }),
        ),
        Effect.mapError((cause) => mapEngineError(cause, "Failed to run flutter test")),
      ),
    [PREVIEW_WS_METHODS.buildStart]: (input) =>
      resolveEngineAdapter(registry).pipe(
        Effect.flatMap((adapter) =>
          adapter.previewBuildStart({
            threadId: ThreadId.makeUnsafe(input.threadId),
            target: input.target,
            ...(input.channel !== undefined ? { channel: input.channel } : {}),
          }),
        ),
        Effect.mapError((cause) => mapEngineError(cause, "Failed to start flutter build")),
      ),
    [PREVIEW_WS_METHODS.buildState]: (input) =>
      resolveEngineAdapter(registry).pipe(
        Effect.flatMap((adapter) =>
          adapter.previewBuildState({
            threadId: ThreadId.makeUnsafe(input.threadId),
            buildId: input.buildId,
          }),
        ),
        Effect.mapError((cause) => mapEngineError(cause, "Failed to read flutter build state")),
      ),
  };
}
