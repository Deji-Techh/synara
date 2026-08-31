import http from "node:http";

import type { ServerSettingsError } from "@caide/contracts";
import { Effect, Exit, FileSystem, Layer, Path, Schema, Scope, ServiceMap } from "effect";
import { HttpRouter } from "effect/unstable/http";

import {
  clearPersistedServerRuntimeState,
  makePersistedServerRuntimeState,
  persistServerRuntimeState,
} from "./serverRuntimeState";
import { remoteAccessPolicyError, ServerConfig } from "./config";
import { resolveListeningPort } from "./startupAccess";
import { patchBunWebSocketCloseEventCompatibility } from "./bunWebSocketCompatibility";
import { makeEffectHttpRouteLayer } from "./http";
import { Keybindings } from "./keybindings";
import { ServerLifecycleEvents } from "./serverLifecycleEvents";
import { ServerRuntimeStartup } from "./serverRuntimeStartup";
import { ServerSettingsService } from "./serverSettings";
import { makeServerReadiness } from "./server/readiness";
import { makeServerShutdownController, type ServerShutdownController } from "./serverShutdown";
import { makeBoundedNodeHttpServer } from "./nodeHttpServer";
import { websocketRpcRouteLayer } from "./wsRpc";

export interface ServerShape {
  readonly start: Effect.Effect<
    http.Server,
    ServerLifecycleError | ServerSettingsError,
    | Scope.Scope
    | ServerConfig
    | FileSystem.FileSystem
    | Path.Path
    | Keybindings
    | ServerLifecycleEvents
    | ServerRuntimeStartup
    | ServerSettingsService
  >;
  readonly stopSignal: Effect.Effect<void, never>;
}

export class Server extends ServiceMap.Service<Server, ServerShape>()(
  "caide/effectServer/Server",
) {}

export class ServerLifecycleError extends Schema.TaggedErrorClass<ServerLifecycleError>()(
  "ServerLifecycleError",
  {
    operation: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}

export const createEffectServer = Effect.fn(function* (
  shutdownController: ServerShutdownController,
  appLayer: Layer.Layer<any>,
) {
  const config = yield* ServerConfig;
  const remotePolicyError = remoteAccessPolicyError(config);
  if (remotePolicyError) {
    return yield* new ServerLifecycleError({
      operation: "validateRemoteAccessPolicy",
      cause: new Error(remotePolicyError),
    });
  }
  const keybindings = yield* Keybindings;
  const lifecycleEvents = yield* ServerLifecycleEvents;
  const runtimeStartup = yield* ServerRuntimeStartup;
  const serverSettings = yield* ServerSettingsService;
  const readiness = yield* makeServerReadiness;

  yield* keybindings.syncDefaultKeybindingsOnStartup.pipe(
    Effect.catch((error) =>
      Effect.logWarning("failed to sync keybindings defaults on startup", {
        path: error.configPath,
        detail: error.detail,
        cause: error.cause,
      }),
    ),
  );
  yield* serverSettings.start;
  yield* readiness.markPushBusReady;
  yield* readiness.markKeybindingsReady;

  let nodeServer: http.Server | null = null;
  patchBunWebSocketCloseEventCompatibility();

  const listenOptions = { host: config.host ?? "127.0.0.1", port: config.port };
  const httpServer = yield* makeBoundedNodeHttpServer(() => {
    nodeServer = http.createServer();
    return nodeServer;
  }, listenOptions).pipe(
    Effect.mapError((cause) => new ServerLifecycleError({ operation: "httpServerListen", cause })),
  );

  const routesLayer = Layer.mergeAll(
    makeEffectHttpRouteLayer(readiness, shutdownController),
    websocketRpcRouteLayer,
  );
  const fullRoutesLayer = Layer.provideMerge(routesLayer, appLayer);
  const httpApp = yield* Effect.scoped(HttpRouter.toHttpEffect(fullRoutesLayer));
  yield* httpServer
    .serve(httpApp)
    .pipe(
      Effect.mapError((cause) => new ServerLifecycleError({ operation: "httpServerServe", cause })),
    );

  const listeningPort = resolveListeningPort(
    (nodeServer as http.Server | null)?.address() ?? null,
    config.port,
  );
  yield* persistServerRuntimeState({
    path: config.serverRuntimeStatePath,
    state: makePersistedServerRuntimeState({
      config,
      port: listeningPort,
    }),
  }).pipe(
    Effect.mapError(
      (cause) => new ServerLifecycleError({ operation: "persistServerRuntimeState", cause }),
    ),
  );
  yield* Effect.addFinalizer(() => clearPersistedServerRuntimeState(config.serverRuntimeStatePath));
  yield* readiness.markHttpListening;
  process.stdout.write(`Listening on http://${config.host ?? "127.0.0.1"}:${listeningPort}\n`);
  yield* readiness.markTerminalSubscriptionsReady;
  yield* readiness.markOrchestrationSubscriptionsReady;

  yield* runtimeStartup.markCommandReady;

  yield* lifecycleEvents.publish({
    type: "welcome",
    payload: {
      cwd: config.cwd,
      homeDir: config.homeDir,
      chatWorkspaceRoot: config.chatWorkspaceRoot,
      projectName: config.cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? config.cwd,
    },
  });
  yield* lifecycleEvents.publish({
    type: "ready",
    payload: { at: new Date().toISOString() },
  });

  if (!nodeServer) {
    return yield* new ServerLifecycleError({ operation: "httpServerListen" });
  }
  return nodeServer as http.Server;
});

export const ServerLive = Layer.effect(
  Server,
  Effect.gen(function* () {
    const shutdownController = yield* makeServerShutdownController();
    return {
      start: createEffectServer(shutdownController) as ServerShape["start"],
      stopSignal: shutdownController.stopSignal,
    } satisfies ServerShape;
  }),
);
