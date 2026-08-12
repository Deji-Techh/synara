/**
 * EngineAdapterLive - Flutter Builder engine provider adapter.
 *
 * Spawns apps/engine over stdio JSON-RPC (codex app-server pattern) and
 * projects engine activity into Synara's canonical provider runtime event
 * stream. M1 scope: session lifecycle + hello-world turn round trip.
 *
 * @module EngineAdapterLive
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  EventId,
  type ProviderKind,
  type ProviderRuntimeEvent,
  type ProviderSession,
  type ProviderTurnStartResult,
  RuntimeMode,
  ThreadId,
  TurnId,
} from "@synara/contracts";
import { EngineClient } from "@synara/engine/client";
import {
  ENGINE_PROTOCOL_VERSION,
  InitializeResultSchema,
  PingResultSchema,
  PreviewReloadResultSchema,
  PreviewStartResultSchema,
  PreviewStateResultSchema,
  PreviewStopResultSchema,
} from "@synara/engine/protocol";
import { Effect, Layer, PubSub, Ref, Stream } from "effect";

import {
  ProviderAdapterProcessError,
  ProviderAdapterSessionNotFoundError,
  ProviderAdapterValidationError,
  type ProviderAdapterError,
} from "../Errors.ts";
import { EngineAdapter, type EngineAdapterShape } from "../Services/EngineAdapter.ts";
import { PROVIDER_ADAPTER_RUNTIME_EVENT_BUFFER_CAPACITY } from "../Services/ProviderAdapter.ts";

/**
 * Resolve the engine entrypoint to spawn.
 *
 * In dev, run the TS source through bun (matching the rest of the repo's dev
 * workflow). Packaged builds resolve to dist/index.mjs.
 */
function resolveEngineCommand(): { command: string; args: readonly string[] } {
  const engineEntry = fileURLToPath(new URL("../../../../engine/src/index.ts", import.meta.url));
  return { command: "bun", args: ["run", engineEntry] };
}

export interface EngineAdapterLiveOptions {
  readonly binaryPath?: string;
  readonly cwd?: string;
  readonly command?: string;
  readonly args?: readonly string[];
}

interface EngineSessionContext {
  readonly threadId: ThreadId;
  readonly session: ProviderSession;
  readonly client: EngineClient;
  readonly engineServerVersion: string;
  /**
   * The appDir the pane last previewed for this thread (first preview/start
   * wins, then stop/reload/state reuse it so the pair never drifts from the
   * session default when the pane omits it).
   */
  previewAppDir: string | null;
}

const makeEngineAdapter = (options?: EngineAdapterLiveOptions) =>
  Effect.gen(function* () {
    const runtimeEventQueue = yield* PubSub.unbounded<ProviderRuntimeEvent>();
    const sessions = yield* Ref.make<ReadonlyMap<ThreadId, EngineSessionContext>>(new Map());

    const binaryPath = options?.binaryPath;
    const resolvedCommand = options?.command ?? "bun";
    const resolvedArgs = options?.args ?? (binaryPath ? [binaryPath] : resolveEngineCommand().args);

    const makeEvent = <T extends { type: string; payload: unknown }>(
      threadId: ThreadId,
      event: Omit<T, "eventId" | "provider" | "threadId" | "createdAt"> & {
        eventId?: string;
        createdAt?: string;
      },
    ): T =>
      ({
        eventId: EventId.makeUnsafe(randomUUID()),
        provider: "engine" as ProviderKind,
        threadId,
        createdAt: new Date().toISOString(),
        ...event,
      }) as unknown as T;

    const processError = (threadId: ThreadId, detail: string, cause: unknown) =>
      new ProviderAdapterProcessError({
        provider: "engine",
        threadId,
        detail,
        cause: cause instanceof Error ? cause : new Error(String(cause)),
      });

    const startEngineSession = (
      threadId: ThreadId,
      input: { runtimeMode: RuntimeMode; cwd?: string },
    ): Effect.Effect<EngineSessionContext, ProviderAdapterError> =>
      Effect.gen(function* () {
        const cwd = options?.cwd ?? input.cwd;
        const client = new EngineClient({
          command: resolvedCommand,
          args: resolvedArgs,
          ...(cwd !== undefined ? { cwd } : {}),
        });
        yield* Effect.tryPromise({
          try: () => client.waitForSpawn(),
          catch: (cause) => processError(threadId, "engine process failed to spawn", cause),
        });

        const initializeResponse = yield* Effect.tryPromise({
          try: () =>
            client.initialize({
              clientName: "synara-server",
              protocolVersion: ENGINE_PROTOCOL_VERSION,
            }),
          catch: (cause) => processError(threadId, "engine initialize request failed", cause),
        });
        if (initializeResponse.error) {
          client.kill();
          return yield* Effect.fail(
            processError(
              threadId,
              `engine initialize failed: ${initializeResponse.error.code} ${initializeResponse.error.message}`,
              new Error(initializeResponse.error.message),
            ),
          );
        }
        const initialized = InitializeResultSchema.safeParse(initializeResponse.result);
        if (!initialized.success) {
          client.kill();
          return yield* Effect.fail(
            processError(
              threadId,
              "engine initialize returned malformed result",
              initialized.error,
            ),
          );
        }

        // Hello-world round trip: ping proves the stdio channel is alive.
        const pingResponse = yield* Effect.tryPromise({
          try: () => client.ping(),
          catch: (cause) => processError(threadId, "engine ping request failed", cause),
        });
        if (pingResponse.error) {
          client.kill();
          return yield* Effect.fail(
            processError(
              threadId,
              `engine ping failed: ${pingResponse.error.code} ${pingResponse.error.message}`,
              new Error(pingResponse.error.message),
            ),
          );
        }
        const ping = PingResultSchema.safeParse(pingResponse.result);
        if (!ping.success || ping.data.pong !== "pong") {
          client.kill();
          return yield* Effect.fail(
            processError(threadId, "engine ping returned unexpected result", ping.error),
          );
        }

        const now = new Date().toISOString();
        const session: ProviderSession = {
          provider: "engine",
          status: "ready",
          runtimeMode: input.runtimeMode,
          ...(input.cwd ? { cwd: input.cwd } : {}),
          threadId,
          createdAt: now,
          updatedAt: now,
        };
        const context: EngineSessionContext = {
          threadId,
          session,
          client,
          engineServerVersion: initialized.data.serverVersion,
          previewAppDir: null,
        };
        yield* Ref.update(sessions, (map) => new Map(map).set(threadId, context));

        yield* PubSub.publish(
          runtimeEventQueue,
          makeEvent<ProviderRuntimeEvent>(threadId, {
            type: "session.started",
            payload: {
              message: `Engine ${initialized.data.serverVersion} connected (protocol v${initialized.data.protocolVersion})`,
            },
          }),
        );
        yield* PubSub.publish(
          runtimeEventQueue,
          makeEvent<ProviderRuntimeEvent>(threadId, {
            type: "session.configured",
            payload: {
              config: {
                serverVersion: initialized.data.serverVersion,
                capabilities: initialized.data.capabilities,
              },
            },
          }),
        );
        yield* PubSub.publish(
          runtimeEventQueue,
          makeEvent<ProviderRuntimeEvent>(threadId, {
            type: "thread.started",
            payload: {},
          }),
        );

        return context;
      });

    const getSession = (
      threadId: ThreadId,
    ): Effect.Effect<EngineSessionContext, ProviderAdapterSessionNotFoundError> =>
      Ref.get(sessions).pipe(
        Effect.flatMap((map) => {
          const context = map.get(threadId);
          if (!context) {
            return Effect.fail(
              new ProviderAdapterSessionNotFoundError({ provider: "engine", threadId }),
            );
          }
          return Effect.succeed(context);
        }),
      );

    // Layer teardown: kill every live engine process so nothing outlives the
    // adapter (ProviderService also calls stopAll on shutdown, this is the
    // backstop for crash paths).
    yield* Effect.addFinalizer(() =>
      Ref.get(sessions).pipe(
        Effect.flatMap((map) => {
          for (const context of map.values()) {
            context.client.kill();
          }
          return Effect.void;
        }),
        Effect.ignore,
      ),
    );

    const adapter: EngineAdapterShape = {
      provider: "engine",
      capabilities: {
        sessionModelSwitch: "restart-session",
        conversationRollback: "restart-session",
        supportsRuntimeModelList: false,
      },

      startSession: (input) =>
        Effect.gen(function* () {
          if (input.provider !== undefined && input.provider !== "engine") {
            return yield* Effect.fail(
              new ProviderAdapterValidationError({
                provider: "engine",
                operation: "startSession",
                issue: `expected provider "engine", got ${input.provider}`,
              }),
            );
          }
          return yield* startEngineSession(input.threadId, {
            runtimeMode: input.runtimeMode,
            ...(input.cwd ? { cwd: input.cwd } : {}),
          }).pipe(Effect.map((context) => context.session));
        }),

      sendTurn: (input) =>
        Effect.gen(function* () {
          const context = yield* getSession(input.threadId);
          const turnId = TurnId.makeUnsafe(randomUUID());
          yield* PubSub.publish(
            runtimeEventQueue,
            makeEvent<ProviderRuntimeEvent>(input.threadId, {
              type: "turn.started",
              turnId,
              payload: { model: input.modelSelection?.model },
            }),
          );

          const echoResponse = yield* Effect.tryPromise({
            try: () => context.client.request("engine/echo", { message: input.input ?? "" }),
            catch: (cause) => processError(input.threadId, "engine echo request failed", cause),
          });
          if (echoResponse.error) {
            yield* PubSub.publish(
              runtimeEventQueue,
              makeEvent<ProviderRuntimeEvent>(input.threadId, {
                type: "turn.completed",
                turnId,
                payload: { state: "error" },
              }),
            );
            return yield* Effect.fail(
              processError(
                input.threadId,
                `engine echo failed: ${echoResponse.error.message}`,
                new Error(echoResponse.error.message),
              ),
            );
          }

          yield* PubSub.publish(
            runtimeEventQueue,
            makeEvent<ProviderRuntimeEvent>(input.threadId, {
              type: "item.started",
              turnId,
              payload: { itemType: "assistant_message" },
            }),
          );
          yield* PubSub.publish(
            runtimeEventQueue,
            makeEvent<ProviderRuntimeEvent>(input.threadId, {
              type: "content.delta",
              turnId,
              payload: {
                delta: `hello flutter: ${String((echoResponse.result as { message?: string }).message ?? "")}`,
              },
            }),
          );
          yield* PubSub.publish(
            runtimeEventQueue,
            makeEvent<ProviderRuntimeEvent>(input.threadId, {
              type: "item.completed",
              turnId,
              payload: { itemType: "assistant_message" },
            }),
          );
          yield* PubSub.publish(
            runtimeEventQueue,
            makeEvent<ProviderRuntimeEvent>(input.threadId, {
              type: "turn.completed",
              turnId,
              payload: { state: "completed", stopReason: "end_turn" },
            }),
          );

          const result: ProviderTurnStartResult = { threadId: input.threadId, turnId };
          return result;
        }),

      interruptTurn: (threadId) =>
        Effect.gen(function* () {
          yield* getSession(threadId);
          yield* PubSub.publish(
            runtimeEventQueue,
            makeEvent<ProviderRuntimeEvent>(threadId, {
              type: "turn.aborted",
              payload: { state: "interrupted" },
            }),
          );
        }),

      respondToRequest: (threadId) =>
        Effect.gen(function* () {
          yield* getSession(threadId);
        }),

      respondToUserInput: (threadId) =>
        Effect.gen(function* () {
          yield* getSession(threadId);
        }),

      stopSession: (threadId) =>
        Effect.gen(function* () {
          const context = yield* getSession(threadId);
          yield* Ref.update(sessions, (map) => {
            const next = new Map(map);
            next.delete(threadId);
            return next;
          });
          yield* Effect.tryPromise({
            try: () => context.client.shutdown(),
            catch: (cause) => processError(threadId, "engine shutdown failed", cause),
          });
          yield* PubSub.publish(
            runtimeEventQueue,
            makeEvent<ProviderRuntimeEvent>(threadId, {
              type: "session.exited",
              payload: { reason: "stopped", recoverable: true, exitKind: "graceful" },
            }),
          );
        }),

      // ── Preview operations (M4) ──────────────────────────────────────
      // The thread's engine session owns the flutter process; previews are
      // keyed by appDir inside the engine. The first start picks the appDir
      // (explicit or the session cwd); later ops reuse the remembered one so
      // the pair never drifts when the pane omits it.

      previewStart: (input) =>
        Effect.gen(function* () {
          const context = yield* getSession(input.threadId);
          const appDir = input.appDir ?? context.session.cwd ?? "";
          const response = yield* Effect.tryPromise({
            try: () =>
              context.client.previewStart({
                appDir,
                ...(input.port !== undefined ? { port: input.port } : {}),
                ...(input.hostname !== undefined ? { hostname: input.hostname } : {}),
              }),
            catch: (cause) =>
              processError(input.threadId, "engine preview/start request failed", cause),
          });
          if (response.error) {
            return yield* Effect.fail(
              processError(
                input.threadId,
                `engine preview/start failed: ${response.error.code} ${response.error.message}`,
                new Error(response.error.message),
              ),
            );
          }
          const result = PreviewStartResultSchema.safeParse(response.result);
          if (!result.success) {
            return yield* Effect.fail(
              processError(
                input.threadId,
                "engine preview/start returned malformed result",
                result.error,
              ),
            );
          }
          context.previewAppDir = appDir;
          return { url: result.data.url };
        }),

      previewStop: (input) =>
        Effect.gen(function* () {
          const context = yield* getSession(input.threadId);
          const appDir = context.previewAppDir ?? context.session.cwd ?? "";
          const response = yield* Effect.tryPromise({
            try: () => context.client.previewStop({ appDir }),
            catch: (cause) =>
              processError(input.threadId, "engine preview/stop request failed", cause),
          });
          if (response.error) {
            return yield* Effect.fail(
              processError(
                input.threadId,
                `engine preview/stop failed: ${response.error.code} ${response.error.message}`,
                new Error(response.error.message),
              ),
            );
          }
          const result = PreviewStopResultSchema.safeParse(response.result);
          if (!result.success) {
            return yield* Effect.fail(
              processError(
                input.threadId,
                "engine preview/stop returned malformed result",
                result.error,
              ),
            );
          }
          return { stopped: result.data.stopped };
        }),

      previewReload: (input) =>
        Effect.gen(function* () {
          const context = yield* getSession(input.threadId);
          const appDir = context.previewAppDir ?? context.session.cwd ?? "";
          const response = yield* Effect.tryPromise({
            try: () => context.client.previewReload({ appDir, hotReload: input.hotReload }),
            catch: (cause) =>
              processError(input.threadId, "engine preview/reload request failed", cause),
          });
          if (response.error) {
            return yield* Effect.fail(
              processError(
                input.threadId,
                `engine preview/reload failed: ${response.error.code} ${response.error.message}`,
                new Error(response.error.message),
              ),
            );
          }
          const result = PreviewReloadResultSchema.safeParse(response.result);
          if (!result.success) {
            return yield* Effect.fail(
              processError(
                input.threadId,
                "engine preview/reload returned malformed result",
                result.error,
              ),
            );
          }
          return { reloaded: result.data.reloaded };
        }),

      previewState: (input) =>
        Effect.gen(function* () {
          const context = yield* getSession(input.threadId);
          const appDir = context.previewAppDir ?? context.session.cwd ?? "";
          const response = yield* Effect.tryPromise({
            try: () => context.client.previewState({ appDir }),
            catch: (cause) =>
              processError(input.threadId, "engine preview/state request failed", cause),
          });
          if (response.error) {
            return yield* Effect.fail(
              processError(
                input.threadId,
                `engine preview/state failed: ${response.error.code} ${response.error.message}`,
                new Error(response.error.message),
              ),
            );
          }
          const result = PreviewStateResultSchema.safeParse(response.result);
          if (!result.success) {
            return yield* Effect.fail(
              processError(
                input.threadId,
                "engine preview/state returned malformed result",
                result.error,
              ),
            );
          }
          return {
            running: result.data.running,
            url: result.data.url,
            logs: result.data.logs,
          };
        }),

      listSessions: () =>
        Ref.get(sessions).pipe(
          Effect.map((map) => Array.from(map.values()).map((context) => context.session)),
        ),

      hasSession: (threadId) => Ref.get(sessions).pipe(Effect.map((map) => map.has(threadId))),

      readThread: (threadId) =>
        Effect.gen(function* () {
          const context = yield* getSession(threadId);
          return {
            threadId,
            turns: [],
            ...(context.session.cwd ? { cwd: context.session.cwd } : {}),
          };
        }),

      rollbackThread: (threadId) =>
        Effect.gen(function* () {
          const context = yield* getSession(threadId);
          return {
            threadId,
            turns: [],
            ...(context.session.cwd ? { cwd: context.session.cwd } : {}),
          };
        }),

      stopAll: () =>
        Effect.gen(function* () {
          const map = yield* Ref.get(sessions);
          for (const context of map.values()) {
            context.client.kill();
          }
          yield* Ref.set(sessions, new Map());
        }),

      streamEvents: Stream.fromPubSub(runtimeEventQueue),
    };

    return adapter;
  });

export const EngineAdapterLive = Layer.effect(EngineAdapter, makeEngineAdapter());

export const EngineAdapterLiveWithOptions = (options: EngineAdapterLiveOptions) =>
  Layer.effect(EngineAdapter, makeEngineAdapter(options));
