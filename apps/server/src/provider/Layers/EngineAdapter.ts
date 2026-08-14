/**
 * EngineAdapterLive - Flutter Builder engine provider adapter.
 *
 * Spawns apps/engine over stdio JSON-RPC (codex app-server pattern) and
 * projects engine activity into Caide's canonical provider runtime event
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
} from "@caide/contracts";
import { EngineClient } from "@caide/engine/client";
import {
  AnalyzeRunResultSchema,
  BuildStartResultSchema,
  BuildStateResultSchema,
  ENGINE_PROTOCOL_VERSION,
  InitializeResultSchema,
  PingResultSchema,
  PreviewReloadResultSchema,
  PreviewStartResultSchema,
  PreviewStateResultSchema,
  PreviewStopResultSchema,
  TestResultSchema,
  PreviewScreenshotResultSchema,
} from "@caide/engine/protocol";
import { Effect, Layer, PubSub, Ref, Stream } from "effect";

import {
  ProviderAdapterProcessError,
  ProviderAdapterSessionNotFoundError,
  ProviderAdapterValidationError,
  type ProviderAdapterError,
} from "../Errors.ts";
import { EngineAdapter, type EngineAdapterShape } from "../Services/EngineAdapter.ts";
import { PROVIDER_ADAPTER_RUNTIME_EVENT_BUFFER_CAPACITY } from "../Services/ProviderAdapter.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import { ServerSecretStore } from "../../auth/Services/ServerSecretStore.ts";

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
  /**
   * Mutable ref to the current active turn ID, used by the streaming
   * notification handler to attribute incoming text/tool deltas.
   */
  readonly currentTurnIdRef: { current: TurnId | null };
}

const makeEngineAdapter = (options?: EngineAdapterLiveOptions) =>
  Effect.gen(function* () {
    const runtimeEventQueue = yield* PubSub.unbounded<ProviderRuntimeEvent>();
    const sessions = yield* Ref.make<ReadonlyMap<ThreadId, EngineSessionContext>>(new Map());
    const serverSettings = yield* ServerSettingsService;
    const secretStore = yield* ServerSecretStore;

    const engineModelConfig = (
      cwd?: string,
    ): Effect.Effect<
      | {
          baseUrl: string;
          apiKey: string;
          modelId: string;
          cwd: string;
        }
      | undefined,
      ProviderAdapterError
    > =>
      Effect.gen(function* () {
        const engineSettings = (yield* serverSettings.getSettings.pipe(
          Effect.orElseSucceed(() => undefined),
        ))?.providers?.engine;
        const baseUrl = engineSettings?.baseUrl ?? "";
        const modelId = engineSettings?.modelId ?? "";
        if (!baseUrl || !modelId) {
          // Not configured for real model-driven turns; fall back to echo.
          return undefined;
        }
        const secret = yield* secretStore
          .get("provider-engine-api-key")
          .pipe(Effect.orElseSucceed(() => null));
        const decoder = new TextDecoder("utf-8");
        const apiKey = secret ? decoder.decode(secret) : "";
        return {
          baseUrl,
          apiKey,
          modelId,
          cwd: cwd ?? options?.cwd ?? ".",
        };
      });

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

    /**
     * Spawn the engine process, initialize the protocol channel, and prove it
     * alive with a ping. Returns the live client plus handshake metadata. This
     * is the shared substrate for normal chat sessions (which additionally
     * publish lifecycle events) and preview-only sessions (which are created
     * on demand and must stay silent so an engine session.started event never
     * rewrites another provider's thread session binding).
     */
    const spawnEngineClient = (
      threadId: ThreadId,
      input: { cwd?: string; currentTurnIdRef?: { current: TurnId | null } },
    ): Effect.Effect<{ client: EngineClient; engineServerVersion: string }, ProviderAdapterError> =>
      Effect.gen(function* () {
        const cwd = options?.cwd ?? input.cwd;
        const client = new EngineClient({
          command: resolvedCommand,
          args: resolvedArgs,
          ...(cwd !== undefined ? { cwd } : {}),
          onNotification: (method, params) => {
            const turnId = input.currentTurnIdRef?.current;
            if (!turnId) return;

            if (method === "turn/textDelta") {
              const p = params as { delta: string };
              Effect.runFork(
                PubSub.publish(
                  runtimeEventQueue,
                  makeEvent<ProviderRuntimeEvent>(threadId, {
                    type: "content.delta",
                    turnId,
                    payload: { delta: p.delta },
                  }),
                ),
              );
            } else if (method === "turn/toolCall") {
              const p = params as { name: string; args: unknown };
              Effect.runFork(
                PubSub.publish(
                  runtimeEventQueue,
                  makeEvent<ProviderRuntimeEvent>(threadId, {
                    type: "tool_call.started",
                    turnId,
                    payload: { toolName: p.name, args: p.args },
                  }),
                ),
              );
            }
          },
        });
        yield* Effect.tryPromise({
          try: () => client.waitForSpawn(),
          catch: (cause) => processError(threadId, "engine process failed to spawn", cause),
        });

        const initializeResponse = yield* Effect.tryPromise({
          try: () =>
            client.initialize({
              clientName: "caide-server",
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

        return { client, engineServerVersion: initialized.data.serverVersion };
      });

    /**
     * Start a full engine chat session for the thread: spawn the engine and
     * announce it through the provider runtime event stream so the thread's
     * lifecycle (session.started / thread.started) is wired into the
     * projection. Used when the thread itself is bound to the engine provider.
     */
    const startEngineSession = (
      threadId: ThreadId,
      input: { runtimeMode: RuntimeMode; cwd?: string },
    ): Effect.Effect<EngineSessionContext, ProviderAdapterError> =>
      Effect.gen(function* () {
        const currentTurnIdRef = { current: null as TurnId | null };
        const { client, engineServerVersion } = yield* spawnEngineClient(threadId, {
          ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
          currentTurnIdRef,
        });
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
          engineServerVersion,
          previewAppDir: null,
          currentTurnIdRef,
        };
        yield* Ref.update(sessions, (map) => new Map(map).set(threadId, context));

        yield* PubSub.publish(
          runtimeEventQueue,
          makeEvent<ProviderRuntimeEvent>(threadId, {
            type: "session.started",
            payload: {
              message: `Engine ${engineServerVersion} connected (protocol v${ENGINE_PROTOCOL_VERSION})`,
            },
          }),
        );
        yield* PubSub.publish(
          runtimeEventQueue,
          makeEvent<ProviderRuntimeEvent>(threadId, {
            type: "session.configured",
            payload: {
              config: {
                serverVersion: engineServerVersion,
                capabilities: { flutter: true, preview: true },
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

    /**
     * Start a preview-only engine session for the thread. Unlike
     * `startEngineSession` this deliberately does NOT publish lifecycle events:
     * preview sessions are created on demand for threads that chat on another
     * provider (the pane must not rewrite that thread's session binding, which
     * `thread.session.set` from an engine session.started event would do).
     */
    const startPreviewOnlySession = (
      threadId: ThreadId,
      input: { cwd?: string },
    ): Effect.Effect<EngineSessionContext, ProviderAdapterError> =>
      Effect.gen(function* () {
        const { client, engineServerVersion } = yield* spawnEngineClient(threadId, {
          ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
        });
        const now = new Date().toISOString();
        const session: ProviderSession = {
          provider: "engine",
          status: "ready",
          runtimeMode: "full-access",
          ...(input.cwd ? { cwd: input.cwd } : {}),
          threadId,
          createdAt: now,
          updatedAt: now,
        };
        const context: EngineSessionContext = {
          threadId,
          session,
          client,
          engineServerVersion,
          previewAppDir: null,
        };
        yield* Ref.update(sessions, (map) => new Map(map).set(threadId, context));
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
          context.currentTurnIdRef.current = turnId;
          yield* PubSub.publish(
            runtimeEventQueue,
            makeEvent<ProviderRuntimeEvent>(input.threadId, {
              type: "turn.started",
              turnId,
              payload: { model: input.modelSelection?.model },
            }),
          );

          const modelConfig = yield* engineModelConfig(context.session.cwd);
          const mode: "build" | "plan" = input.interactionMode === "plan" ? "plan" : "build";

          yield* PubSub.publish(
            runtimeEventQueue,
            makeEvent<ProviderRuntimeEvent>(input.threadId, {
              type: "item.started",
              turnId,
              payload: { itemType: "assistant_message" },
            }),
          );

          const text = modelConfig
            ? yield* Effect.tryPromise({
                try: async () => {
                  const response = await context.client.turnRun({
                    message: input.input ?? "",
                    mode,
                    model: {
                      baseUrl: modelConfig.baseUrl,
                      apiKey: modelConfig.apiKey,
                      modelId: modelConfig.modelId,
                    },
                    ...(modelConfig.cwd !== "." ? { cwd: modelConfig.cwd } : {}),
                  });
                  if (response.error) {
                    throw new Error(response.error.message);
                  }
                  return String((response.result as { text?: string }).text ?? "");
                },
                catch: (cause) => processError(input.threadId, "engine turn/run failed", cause),
              })
            : `hello flutter: ${input.input ?? ""}`;
            
          // If we are using the fallback stub, emit it as a delta since the engine didn't run.
          if (!modelConfig) {
            yield* PubSub.publish(
              runtimeEventQueue,
              makeEvent<ProviderRuntimeEvent>(input.threadId, {
                type: "content.delta",
                turnId,
                payload: { delta: text },
              }),
            );
          }
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

      startPreviewSession: (input) =>
        startPreviewOnlySession(input.threadId, {
          ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
        }).pipe(Effect.map((context) => context.session)),

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

      // ── Quality gates (M5) ───────────────────────────────────────────
      // analyze / test / build proxy the engine's RPCs one-for-one. The first
      // appDir still wins (reuse previewAppDir), matching preview ops.

      previewAnalyze: (input) =>
        Effect.gen(function* () {
          const context = yield* getSession(input.threadId);
          const appDir = context.previewAppDir ?? context.session.cwd ?? "";
          const response = yield* Effect.tryPromise({
            try: () => context.client.analyzeRun({ appDir }),
            catch: (cause) =>
              processError(input.threadId, "engine analyze/run request failed", cause),
          });
          if (response.error) {
            return yield* Effect.fail(
              processError(
                input.threadId,
                `engine analyze/run failed: ${response.error.code} ${response.error.message}`,
                new Error(response.error.message),
              ),
            );
          }
          const result = AnalyzeRunResultSchema.safeParse(response.result);
          if (!result.success) {
            return yield* Effect.fail(
              processError(
                input.threadId,
                "engine analyze/run returned malformed result",
                result.error,
              ),
            );
          }
          return {
            issues: result.data.issues,
            clean: result.data.issues.length === 0,
            output: result.data.output,
          };
        }),

      previewTest: (input) =>
        Effect.gen(function* () {
          const context = yield* getSession(input.threadId);
          const appDir = context.previewAppDir ?? context.session.cwd ?? "";
          const response = yield* Effect.tryPromise({
            try: () =>
              context.client.testRun({
                appDir,
                ...(input.testPath !== undefined ? { testPath: input.testPath } : {}),
              }),
            catch: (cause) => processError(input.threadId, "engine test/run request failed", cause),
          });
          if (response.error) {
            return yield* Effect.fail(
              processError(
                input.threadId,
                `engine test/run failed: ${response.error.code} ${response.error.message}`,
                new Error(response.error.message),
              ),
            );
          }
          const result = TestResultSchema.safeParse(response.result);
          if (!result.success) {
            return yield* Effect.fail(
              processError(
                input.threadId,
                "engine test/run returned malformed result",
                result.error,
              ),
            );
          }
          return {
            passed: result.data.passed,
            failed: result.data.failed,
            skipped: result.data.skipped,
            output: result.data.output,
          };
        }),

      previewBuildStart: (input) =>
        Effect.gen(function* () {
          const context = yield* getSession(input.threadId);
          const appDir = context.previewAppDir ?? input.appDir ?? context.session.cwd ?? "";
          const response = yield* Effect.tryPromise({
            try: () =>
              context.client.buildStart({
                appDir,
                target: input.target,
                ...(input.channel !== undefined ? { channel: input.channel } : {}),
              }),
            catch: (cause) =>
              processError(input.threadId, "engine build/start request failed", cause),
          });
          if (response.error) {
            return yield* Effect.fail(
              processError(
                input.threadId,
                `engine build/start failed: ${response.error.code} ${response.error.message}`,
                new Error(response.error.message),
              ),
            );
          }
          const result = BuildStartResultSchema.safeParse(response.result);
          if (!result.success) {
            return yield* Effect.fail(
              processError(
                input.threadId,
                "engine build/start returned malformed result",
                result.error,
              ),
            );
          }
          context.previewAppDir = appDir;
          return { buildId: result.data.buildId };
        }),

      previewBuildState: (input) =>
        Effect.gen(function* () {
          const context = yield* getSession(input.threadId);
          const response = yield* Effect.tryPromise({
            try: () => context.client.buildState({ buildId: input.buildId }),
            catch: (cause) =>
              processError(input.threadId, "engine build/state request failed", cause),
          });
          if (response.error) {
            return yield* Effect.fail(
              processError(
                input.threadId,
                `engine build/state failed: ${response.error.code} ${response.error.message}`,
                new Error(response.error.message),
              ),
            );
          }
          const result = BuildStateResultSchema.safeParse(response.result);
          if (!result.success) {
            return yield* Effect.fail(
              processError(
                input.threadId,
                "engine build/state returned malformed result",
                result.error,
              ),
            );
          }
          return {
            buildId: result.data.buildId,
            status: result.data.status,
            ...(typeof result.data.exitCode === "number" ? { exitCode: result.data.exitCode } : {}),
            ...(typeof result.data.outputPath === "string"
              ? { outputPath: result.data.outputPath }
              : {}),
            ...(typeof result.data.error === "string" ? { error: result.data.error } : {}),
            logs: result.data.logs,
          };
        }),

      previewScreenshot: (input) =>
        Effect.gen(function* () {
          const context = yield* getSession(input.threadId);
          const response = yield* Effect.tryPromise({
            try: () => context.client.previewScreenshot(),
            catch: (cause) =>
              processError(input.threadId, "engine preview/screenshot request failed", cause),
          });
          if (response.error) {
            return yield* Effect.fail(
              processError(
                input.threadId,
                `engine preview/screenshot failed: ${response.error.code} ${response.error.message}`,
                new Error(response.error.message),
              ),
            );
          }
          const result = PreviewScreenshotResultSchema.safeParse(response.result);
          if (!result.success) {
            return yield* Effect.fail(
              processError(
                input.threadId,
                "engine preview/screenshot returned malformed result",
                result.error,
              ),
            );
          }
          return {
            image: result.data.image,
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
