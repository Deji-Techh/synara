/**
 * EngineAdapterLive - Flutter Builder engine provider adapter.
 *
 * Spawns apps/engine over stdio JSON-RPC (codex app-server pattern) and
 * projects engine activity into Caide's canonical provider runtime event
 * stream. M3 scope: one shared engine process per adapter; real turns over
 * the engine's dyad `chat:stream` channel (message deltas, XML preview,
 * todos, consent/user-input round trips, goals bridge), plus the M1 preview
 * and quality-gate plumbing kept verbatim.
 *
 * @module EngineAdapterLive
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  EventId,
  type CanonicalItemType,
  type ProviderKind,
  type ProviderRuntimeEvent,
  type ProviderSession,
  type ProviderTurnStartResult,
  RuntimeMode,
  ThreadId,
  TurnId,
} from "@caide/contracts";
import { EngineClient } from "@caide/engine/client";
import { CAIDE_ENGINE_DIR_ENV } from "@caide/shared/desktopIdentity";
import { getCaideAppPath } from "../../paths/caideApps";

function safeFlutterEnvironment(overrides?: Record<string, string>): NodeJS.ProcessEnv {
  const ALLOWED_KEYS = [
    "PATH",
    "HOME",
    "USER",
    "TMPDIR",
    "TMP",
    "TEMP",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "FLUTTER_SDK_DIR",
    "FLUTTER_SDK_BIN",
    "FLUTTER_ROOT",
    "DART_SDK",
    "PUB_CACHE",
    "ANDROID_HOME",
    "ANDROID_SDK_ROOT",
    "JAVA_HOME",
    "DEVELOPER_DIR",
    "CHROME_EXECUTABLE",
    "PUPPETEER_EXECUTABLE_PATH",
    "DISPLAY",
    "WAYLAND_DISPLAY",
    "XDG_RUNTIME_DIR",
    "SSH_AUTH_SOCK",
  ];
  const env: NodeJS.ProcessEnv = {};
  for (const key of ALLOWED_KEYS) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return { ...env, CI: "false", TERM: "dumb", ...overrides };
}
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
import { Effect, Fiber, Layer, PubSub, Ref, Stream } from "effect";

import {
  ProviderAdapterProcessError,
  ProviderAdapterSessionNotFoundError,
  ProviderAdapterValidationError,
  type ProviderAdapterError,
} from "../Errors.ts";
import {
  EngineAdapter,
  type EngineAdapterShape,
  type EngineActiveSubagent,
  type EngineGoalsApi,
  type EngineSubagentEvent,
  type EngineSubagentsApi,
} from "../Services/EngineAdapter.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import { ServerSecretStore } from "../../auth/Services/ServerSecretStore.ts";

/**
 * Resolve the Flutter engine entrypoint to spawn.
 *
 * The engine bundle is a Node program (better-sqlite3 native binding is not
 * supported by Bun — see apps/engine/src/spawn.test.ts), so the adapter
 * spawns `node dist/index.mjs`. If the bundle is missing (fresh checkout),
 * build it once via the engine package's tsdown script.
 */
function resolveEngineCommand(): { command: string; args: readonly string[] } {
  const candidates: ReadonlyArray<string> = [
    // Packaged desktop: the desktop main injects the unpacked engine dir
    // (process.resourcesPath/engine) which a plain `node` child can read —
    // unlike app.asar.
    process.env[CAIDE_ENGINE_DIR_ENV],
    // Repo dev, bundled server (apps/server/dist/index.mjs → apps/engine).
    fileURLToPath(new URL("../../../apps/engine", import.meta.url)),
    // Repo dev, TS source under vitest (apps/server/src/provider/Layers →
    // apps/engine).
    fileURLToPath(new URL("../../../../engine", import.meta.url)),
  ].filter(
    (candidate): candidate is string => typeof candidate === "string" && candidate.length > 0,
  );

  // Both layouts are accepted: the current packaged payload is FLAT
  // (resources/engine/dist/index.mjs) while legacy/staged payloads nest the
  // bundle under apps/engine (resources/engine/apps/engine/dist/index.mjs).
  const distVariants = (engineDir: string): string[] => [
    path.join(engineDir, "dist", "index.mjs"),
    path.join(engineDir, "apps", "engine", "dist", "index.mjs"),
  ];

  for (const engineDir of candidates) {
    for (const distEntry of distVariants(engineDir)) {
      if (existsSync(distEntry)) {
        return { command: "node", args: [distEntry] };
      }
    }
  }

  // Fresh checkout: build once via the engine package's tsdown script — but
  // ONLY for a writable repo checkout. A packaged desktop mount
  // (`resources/engine` under an AppImage `.mount_*`/`.app`) is read-only and
  // holds no tsdown build inputs; building there is futile (and slow), so
  // surface the missing-bundle error directly instead.
  const isPackagedMount = (candidate: string): boolean =>
    candidate.includes(`${path.sep}resources${path.sep}engine`) ||
    candidate.includes(`.mount_`) ||
    candidate.endsWith(".app");
  const buildCandidate = candidates.find(
    (candidate) =>
      !isPackagedMount(candidate) &&
      existsSync(path.join(candidate, "package.json")) &&
      distVariants(candidate).every((entry) => !existsSync(entry)),
  );
  if (buildCandidate) {
    const built = spawnSync("bun", ["run", "build"], {
      cwd: buildCandidate,
      stdio: "ignore",
    });
    const rebuilt = distVariants(buildCandidate).find((entry) => existsSync(entry));
    if (built.status === 0 && rebuilt) {
      return { command: "node", args: [rebuilt] };
    }
  }

  const firstCandidate = candidates[0] ?? "apps/engine";
  throw new Error(
    `engine bundle missing at ${path.join(firstCandidate, "dist", "index.mjs")}; ` +
      `expected a packaged payload at CAIDE_ENGINE_DIR (${CAIDE_ENGINE_DIR_ENV}) or a built ` +
      `apps/engine (bun run build in apps/engine)`,
  );
}

export interface EngineAdapterLiveOptions {
  readonly binaryPath?: string;
  readonly cwd?: string;
  readonly command?: string;
  readonly args?: readonly string[];
  /** Dev/test override for the engine's caide-apps base directory. */
  readonly appsDir?: string;
  /** Extra environment variables for the engine process (dev/test only). */
  readonly env?: Readonly<Record<string, string>>;
}

interface EngineChatMapping {
  readonly appId: number;
  readonly chatId: number;
}

type PendingRequestKind = "mcp-consent" | "agent-tool-consent" | "questionnaire" | "env-vars";

interface PendingEngineRequest {
  readonly kind: PendingRequestKind;
  readonly threadId: ThreadId;
  readonly chatId?: number;
}

interface EngineSessionContext {
  readonly threadId: ThreadId;
  readonly session: ProviderSession;
  readonly engineServerVersion: string;
  /** Reference to the shared engine client (all sessions share one process). */
  readonly client: EngineClient;
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
  /** Engine app/chat this thread's conversation is bound to (lazy). */
  chatMapping: EngineChatMapping | null;
}

interface SharedEngine {
  readonly client: EngineClient;
  readonly engineServerVersion: string;
}

const makeEngineAdapter = (options?: EngineAdapterLiveOptions) =>
  Effect.gen(function* () {
    const runtimeEventQueue = yield* PubSub.unbounded<ProviderRuntimeEvent>();
    const sessions = yield* Ref.make<ReadonlyMap<ThreadId, EngineSessionContext>>(new Map());
    const sharedEngineRef = yield* Ref.make<SharedEngine | null>(null);
    const chatToThread = yield* Ref.make<ReadonlyMap<number, ThreadId>>(new Map());
    const pendingRequests = yield* Ref.make<ReadonlyMap<string, PendingEngineRequest>>(new Map());
    const settledChats = yield* Ref.make<ReadonlySet<number>>(new Set());
    const goalsEventQueue = yield* PubSub.unbounded<{
      type: "goal.updated" | "goal.run-requested" | "goal.control-requested";
      payload: unknown;
    }>();
    const subagentsEventQueue = yield* PubSub.unbounded<EngineSubagentEvent>();
    const serverSettings = yield* ServerSettingsService;
    const secretStore = yield* ServerSecretStore;

    const engineModelConfig = (): Effect.Effect<
      | {
          baseUrl: string;
          apiKey: string;
          modelId: string;
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
          // Not configured for real model-driven turns; the engine runs with
          // its own default settings.
          return undefined;
        }
        const secret = yield* secretStore
          .get("provider-engine-api-key")
          .pipe(Effect.orElseSucceed(() => null));
        const decoder = new TextDecoder("utf-8");
        const apiKey = secret ? decoder.decode(secret) : "";
        return { baseUrl, apiKey, modelId };
      });

    const binaryPath = options?.binaryPath;
    const resolvedCommand = options?.command ?? "node";
    const resolvedArgs = options?.args ?? (binaryPath ? [binaryPath] : resolveEngineCommand().args);
    const engineDir = fileURLToPath(new URL("../../../../engine", import.meta.url));
    const engineCwd = options?.cwd ?? engineDir;

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

    const publishEvent = (event: ProviderRuntimeEvent) => PubSub.publish(runtimeEventQueue, event);

    const publishTextDelta = (
      threadId: ThreadId,
      turnId: TurnId,
      delta: string,
      summaryIndex?: number,
    ) =>
      publishEvent(
        makeEvent<ProviderRuntimeEvent>(threadId, {
          type: "content.delta",
          turnId,
          payload: {
            streamKind: "assistant_text" as const,
            delta,
            ...(summaryIndex !== undefined ? { summaryIndex } : {}),
          },
        }),
      );

    const publishTurnSettled = (
      threadId: ThreadId,
      turnId: TurnId | null,
      state: "completed" | "failed" | "interrupted" | "cancelled",
      stopReason: string,
      extra?: Record<string, unknown>,
    ) =>
      publishEvent(
        makeEvent<ProviderRuntimeEvent>(threadId, {
          type: "turn.completed",
          ...(turnId !== null ? { turnId } : {}),
          payload: { state, stopReason, ...(extra ?? {}) },
        }),
      );

    /**
     * Look up the session context for a chatId (used by the notification
     * dispatcher, which receives engine chat-scoped events). Returns null for
     * preview-only sessions, which never bind chats.
     */
    const sessionForChat = (chatId: number): Effect.Effect<EngineSessionContext | null> =>
      Ref.get(chatToThread).pipe(
        Effect.flatMap((map) => {
          const threadId = map.get(chatId);
          if (!threadId) return Effect.succeed(null);
          return Ref.get(sessions).pipe(Effect.map((next) => next.get(threadId) ?? null));
        }),
      );

    // ── Engine chat turn helpers ──────────────────────────────────────────

    /**
     * Map tool_use blocks from the engine chat transcript onto Caide's
     * canonical tool item types (best-effort heuristic).
     */
    const canonicalToolItemType = (toolName: string): CanonicalItemType => {
      if (/^(bash|shell|exec|run|command|terminal|docker)/i.test(toolName)) {
        return "command_execution";
      }
      if (/^(file|write|edit|create|patch|apply_patch|delete|rename|move|chmod)/i.test(toolName)) {
        return "file_change";
      }
      return "mcp_tool_call";
    };

    /**
     * Emit the assistant's final message payload from a full `messages`
     * chunk (arrives when the engine completes a message) as a content
     * delta. Tracks emitted length per text block so repeated full-message
     * chunks never double-send.
     */
    const emitTranscriptMessages = (
      context: EngineSessionContext,
      messages: unknown,
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        const turnId = context.currentTurnIdRef.current;
        if (!turnId || !Array.isArray(messages)) return;

        // messageId -> number of chars already emitted (across text blocks).
        const emitted = new Map<string, number>();
        for (const message of messages) {
          if (typeof message !== "object" || message === null) continue;
          const raw = message as Record<string, unknown>;
          const messageId =
            typeof raw.id === "string"
              ? raw.id
              : typeof raw.messageId === "string"
                ? raw.messageId
                : null;
          if (!messageId) continue;
          if (raw.role !== "assistant" && raw.role !== "agent") continue;
          const content = raw.content;
          if (!Array.isArray(content)) continue;
          const textBlocks: string[] = [];
          const toolBlocks: Array<Record<string, unknown>> = [];
          for (const block of content) {
            if (typeof block !== "object" || block === null) continue;
            const b = block as Record<string, unknown>;
            if (b.type === "text" && typeof b.text === "string") {
              textBlocks.push(b.text);
            } else if (b.type === "tool_use" && typeof b.name === "string") {
              toolBlocks.push(b);
            }
          }
          const emittedForMessage = emitted.get(messageId) ?? 0;
          if (textBlocks.length > 0) {
            const text = textBlocks.join("\n");
            if (text.length > emittedForMessage) {
              const delta = text.slice(emittedForMessage);
              emitted.set(messageId, text.length);
              yield* publishTextDelta(context.threadId, turnId, delta);
            }
          }
          const alreadyLaunched = emitted.get(`${messageId}:tools`) ?? 0;
          if (toolBlocks.length > alreadyLaunched) {
            emitted.set(`${messageId}:tools`, toolBlocks.length);
            for (const tool of toolBlocks.slice(alreadyLaunched)) {
              const toolName = String(tool.name);
              const callId =
                typeof tool.id === "string" ? tool.id : `${toolName}:${alreadyLaunched}`;
              const itemType = canonicalToolItemType(toolName);
              yield* publishEvent(
                makeEvent<ProviderRuntimeEvent>(context.threadId, {
                  type: "item.started",
                  turnId,
                  payload: {
                    itemType,
                    title: toolName,
                    data: { toolName, callId, args: tool.input ?? {} },
                  },
                }),
              );
              yield* publishEvent(
                makeEvent<ProviderRuntimeEvent>(context.threadId, {
                  type: "item.completed",
                  turnId,
                  payload: {
                    itemType,
                    status: "completed" as const,
                    title: toolName,
                    data: { toolName, callId },
                  },
                }),
              );
            }
          }
        }
      });

    /**
     * Notification dispatcher for the shared engine connection. Routes by
     * engine channel:
     *   chat:stream:*            - turn lifecycle pieces
     *   chat:response:*          - text/tool deltas + completion
     *   agent-tool:*             - todos, consents, env var prompts
     *   mcp:tool-consent-*       - MCP tool consent life
     *   plan:*                   - plan questionnaire questions
     *   goal:*                   - forwarded to the goals domain event stream
     */
    const handleEngineNotification = (method: string, params: unknown): Effect.Effect<void> =>
      Effect.gen(function* () {
        // Renderer-bound events arrive on the bridge as `dyad/event`
        // notifications with { channel, payload }; unwrap them so the
        // dispatcher switch can address the real engine channel names.
        if (method === "dyad/event") {
          const envelope = (params ?? {}) as Record<string, unknown>;
          if (typeof envelope.channel !== "string") return;
          method = envelope.channel;
          params = envelope.payload;
        }
        const payload = (params ?? {}) as Record<string, unknown>;
        switch (method) {
          case "chat:stream:start":
          case "chat:stream:end": {
            if (typeof payload.chatId !== "number") return;
            const chatId = payload.chatId as number;
            if (method === "chat:stream:start") {
              yield* Ref.update(settledChats, (set) => {
                const next = new Set(set);
                next.delete(chatId);
                return next;
              });
            } else {
              const settled = yield* Ref.get(settledChats);
              const context = yield* sessionForChat(chatId);
              if (!settled.has(chatId) && context !== null) {
                // The engine ended the stream without a chat:response:end
                // (abort/restart mid-turn). Close the turn cleanly.
                const turnId = context.currentTurnIdRef.current;
                yield* publishEvent(
                  makeEvent<ProviderRuntimeEvent>(context.threadId, {
                    type: "turn.aborted",
                    ...(turnId !== null ? { turnId } : {}),
                    payload: { reason: "engine stream ended before response" },
                  }),
                );
                context.currentTurnIdRef.current = null;
              }
              yield* Ref.update(chatToThread, (map) => {
                const next = new Map(map);
                next.delete(chatId);
                return next;
              });
            }
            return;
          }
          case "chat:response:chunk": {
            if (typeof payload.chatId !== "number") return;
            const chatId = payload.chatId as number;
            const context = yield* sessionForChat(chatId);
            if (context === null) return;
            const turnId = context.currentTurnIdRef.current;
            if (turnId === null) return;

            // Ack-based backpressure: the engine's canned QA stream path only
            // sends the next chunk once the renderer acks (MAX_IN_FLIGHT = 1).
            // Fire-and-forget; real LLM streams omit chunkSeq and ignore acks.
            if (typeof payload.chunkSeq === "number") {
              const shared = yield* Ref.get(sharedEngineRef);
              shared?.client
                .dyadInvoke("chat:response:ack", {
                  chatId,
                  lastSeq: payload.chunkSeq,
                })
                .catch(() => undefined);
            }

            if (typeof payload.streamingPreview === "object" && payload.streamingPreview !== null) {
              const content = String(
                (payload.streamingPreview as Record<string, unknown>).content ?? "",
              );
              if (content !== "") {
                yield* publishEvent(
                  makeEvent<ProviderRuntimeEvent>(context.threadId, {
                    type: "turn.proposed.delta",
                    turnId,
                    payload: { delta: content },
                  }),
                );
              }
            }
            if (typeof payload.streamingPatch === "string" && payload.streamingPatch !== "") {
              yield* publishTextDelta(context.threadId, turnId, payload.streamingPatch);
            }
            if (payload.messages !== undefined) {
              yield* emitTranscriptMessages(context, payload.messages);
            }
            return;
          }
          case "chat:response:end": {
            if (typeof payload.chatId !== "number") return;
            const chatId = payload.chatId as number;
            const context = yield* sessionForChat(chatId);
            if (context === null) return;
            const turnId = context.currentTurnIdRef.current;
            const wasCancelled = payload.wasCancelled === true;
            // Ensure the tail of any final message was flushed.
            if (Array.isArray(payload.messages)) {
              yield* emitTranscriptMessages(context, payload.messages);
            }
            yield* publishEvent(
              makeEvent<ProviderRuntimeEvent>(context.threadId, {
                type: "item.completed",
                ...(turnId !== null ? { turnId } : {}),
                payload: { itemType: "assistant_message" as const },
              }),
            );
            yield* publishTurnSettled(
              context.threadId,
              turnId,
              wasCancelled ? "interrupted" : "completed",
              wasCancelled ? "user_cancelled" : "end_turn",
              Array.isArray(payload.updatedFiles) && payload.updatedFiles.length > 0
                ? { usage: { updatedFiles: payload.updatedFiles as unknown[] } }
                : undefined,
            );
            context.currentTurnIdRef.current = null;
            yield* Ref.update(settledChats, (set) => {
              const next = new Set(set);
              next.add(chatId);
              return next;
            });
            return;
          }
          case "chat:response:error": {
            if (typeof payload.chatId !== "number") return;
            const chatId = payload.chatId as number;
            const context = yield* sessionForChat(chatId);
            if (context === null) return;
            const turnId = context.currentTurnIdRef.current;
            const message = String(payload.error ?? "engine turn failed");
            yield* publishEvent(
              makeEvent<ProviderRuntimeEvent>(context.threadId, {
                type: "runtime.error",
                ...(turnId !== null ? { turnId } : {}),
                payload: {
                  message,
                  class: "provider_error" as const,
                },
              }),
            );
            yield* publishEvent(
              makeEvent<ProviderRuntimeEvent>(context.threadId, {
                type: "item.completed",
                ...(turnId !== null ? { turnId } : {}),
                payload: {
                  itemType: "assistant_message" as const,
                  status: "failed" as const,
                },
              }),
            );
            yield* publishTurnSettled(
              context.threadId,
              turnId,
              "failed",
              "error",
              message !== "" ? { errorMessage: message } : undefined,
            );
            context.currentTurnIdRef.current = null;
            yield* Ref.update(settledChats, (set) => {
              const next = new Set(set);
              next.add(chatId);
              return next;
            });
            return;
          }

          case "agent-tool:todos-update": {
            if (typeof payload.chatId !== "number") return;
            const context = yield* sessionForChat(payload.chatId);
            if (context === null) return;
            const turnId = context.currentTurnIdRef.current;
            if (turnId === null || !Array.isArray(payload.todos)) return;
            const tasks = payload.todos
              .map((todo) => {
                if (typeof todo !== "object" || todo === null) return null;
                const t = todo as Record<string, unknown>;
                const status =
                  t.status === "in_progress"
                    ? "inProgress"
                    : t.status === "completed"
                      ? "completed"
                      : "pending";
                return {
                  task: String(t.content ?? t.task ?? "…"),
                  status: status as "pending" | "inProgress" | "completed",
                };
              })
              .filter((task): task is NonNullable<typeof task> => task !== null);
            if (tasks.length === 0) return;
            yield* publishEvent(
              makeEvent<ProviderRuntimeEvent>(context.threadId, {
                type: "turn.tasks.updated",
                turnId,
                payload: { tasks },
              }),
            );
            return;
          }

          case "agent-tool:consent-request": {
            const requestId = String(payload.requestId ?? "");
            if (requestId === "") return;
            const chatId = typeof payload.chatId === "number" ? payload.chatId : undefined;
            const context = chatId !== undefined ? yield* sessionForChat(chatId) : null;
            if (context === null) return;
            yield* Ref.update(pendingRequests, (map) => {
              const next = new Map(map);
              next.set(requestId, {
                kind: "agent-tool-consent",
                threadId: context.threadId,
                ...(chatId !== undefined ? { chatId } : {}),
              });
              return next;
            });
            const toolName = String(payload.toolName ?? "tool");
            yield* publishEvent(
              makeEvent<ProviderRuntimeEvent>(context.threadId, {
                type: "request.opened",
                requestId: requestId as never,
                payload: {
                  requestType: "command_execution_approval" as const,
                  detail: toolName,
                  args: {
                    toolName,
                    toolDescription: payload.toolDescription ?? null,
                    inputPreview: payload.inputPreview ?? null,
                    metadata: payload.metadata ?? null,
                  },
                },
              }),
            );
            return;
          }

          case "mcp:tool-consent-request": {
            const requestId = String(payload.requestId ?? "");
            if (requestId === "") return;
            const chatId = typeof payload.chatId === "number" ? payload.chatId : undefined;
            const context = chatId !== undefined ? yield* sessionForChat(chatId) : null;
            if (context === null) return;
            yield* Ref.update(pendingRequests, (map) => {
              const next = new Map(map);
              next.set(requestId, {
                kind: "mcp-consent",
                threadId: context.threadId,
                ...(chatId !== undefined ? { chatId } : {}),
              });
              return next;
            });
            const toolName = String(payload.toolName ?? "tool");
            const serverName = payload.serverName;
            yield* publishEvent(
              makeEvent<ProviderRuntimeEvent>(context.threadId, {
                type: "request.opened",
                requestId: requestId as never,
                payload: {
                  requestType: "command_execution_approval" as const,
                  detail:
                    typeof serverName === "string" && serverName !== ""
                      ? `${toolName} via ${serverName}`
                      : toolName,
                  args: {
                    toolName,
                    ...(typeof serverName === "string" ? { serverName } : {}),
                    ...(payload.args !== undefined ? { args: payload.args } : {}),
                  },
                },
              }),
            );
            return;
          }

          case "mcp:tool-consent-resolved":
          case "mcp:tool-consent-classified": {
            const requestId = String(payload.requestId ?? "");
            if (requestId === "") return;
            const pending = yield* Ref.get(pendingRequests);
            const entry = pending.get(requestId);
            if (!entry) return;
            yield* Ref.update(pendingRequests, (map) => {
              const next = new Map(map);
              next.delete(requestId);
              return next;
            });
            yield* publishEvent(
              makeEvent<ProviderRuntimeEvent>(entry.threadId, {
                type: "request.resolved",
                requestId: requestId as never,
                payload: {
                  requestType: "command_execution_approval" as const,
                  decision: "accept",
                  resolution: { source: method },
                },
              }),
            );
            return;
          }

          case "plan:questionnaire": {
            if (typeof payload.chatId !== "number") return;
            const context = yield* sessionForChat(payload.chatId);
            if (context === null) return;
            const requestId = String(payload.requestId ?? "");
            if (requestId === "") return;
            yield* Ref.update(pendingRequests, (map) => {
              const next = new Map(map);
              next.set(requestId, {
                kind: "questionnaire",
                threadId: context.threadId,
                chatId: payload.chatId as number,
              });
              return next;
            });
            const questions = Array.isArray(payload.questions)
              ? payload.questions.map((question) => {
                  const q = (question ?? {}) as Record<string, unknown>;
                  const id = String(q.id ?? "");
                  return {
                    id: id !== "" ? id : randomUUID(),
                    header: "Question",
                    question: String(q.question ?? ""),
                    options: Array.isArray(q.options)
                      ? (q.options as unknown[]).map((option) => ({
                          label: String(option),
                          description: "",
                        }))
                      : [],
                    multiSelect: q.type === "checkbox",
                  };
                })
              : [];
            yield* publishEvent(
              makeEvent<ProviderRuntimeEvent>(context.threadId, {
                type: "user-input.requested",
                requestId: requestId as never,
                payload: { questions },
              }),
            );
            return;
          }

          case "agent-tool:prompt-env-vars": {
            if (typeof payload.chatId !== "number") return;
            const context = yield* sessionForChat(payload.chatId);
            if (context === null) return;
            const requestId = String(payload.requestId ?? "");
            if (requestId === "") return;
            yield* Ref.update(pendingRequests, (map) => {
              const next = new Map(map);
              next.set(requestId, {
                kind: "env-vars",
                threadId: context.threadId,
                chatId: payload.chatId as number,
              });
              return next;
            });
            const questions = Array.isArray(payload.vars)
              ? (payload.vars as unknown[]).map((variable) => {
                  const v = (variable ?? {}) as Record<string, unknown>;
                  const key = String(v.key ?? "");
                  return {
                    id: key,
                    header: "Environment variable",
                    question:
                      key +
                      (typeof v.description === "string" && v.description !== ""
                        ? ` — ${v.description}`
                        : ""),
                    options: [],
                    multiSelect: false,
                  };
                })
              : [];
            yield* publishEvent(
              makeEvent<ProviderRuntimeEvent>(context.threadId, {
                type: "user-input.requested",
                requestId: requestId as never,
                payload: { questions },
              }),
            );
            return;
          }

          case "goal:updated": {
            yield* PubSub.publish(goalsEventQueue, {
              type: "goal.updated",
              payload: payload.payload ?? payload,
            });
            return;
          }
          case "goal:run-requested": {
            yield* PubSub.publish(goalsEventQueue, {
              type: "goal.run-requested",
              payload: payload.payload ?? payload,
            });
            return;
          }
          case "goal:control-requested": {
            yield* PubSub.publish(goalsEventQueue, {
              type: "goal.control-requested",
              payload: payload.payload ?? payload,
            });
            return;
          }
          case "subagent:updated": {
            const p = (payload.payload ?? payload) as Record<string, unknown>;
            const status = p.status;
            if (status !== "running" && status !== "completed" && status !== "failed") return;
            yield* PubSub.publish(subagentsEventQueue, {
              ...(typeof p.appId === "number" ? { appId: p.appId } : {}),
              ...(typeof p.chatId === "number" ? { chatId: p.chatId } : {}),
              taskId: String(p.taskId ?? ""),
              role: String(p.role ?? ""),
              task: String(p.task ?? ""),
              status,
              startedAt: typeof p.startedAt === "number" ? p.startedAt : Date.now(),
            });
            return;
          }
          default:
            return;
        }
      });

    /**
     * Spawn the shared engine process once; initialize the protocol channel,
     * seed settings (model handshake), provision the custom model provider
     * when configured, and prove it alive with a ping. Subsequent calls reuse
     * the running process so apps/chats/goals share one SQLite world.
     */
    const ensureSharedEngine = (
      threadId: ThreadId,
    ): Effect.Effect<SharedEngine, ProviderAdapterError> =>
      Effect.gen(function* () {
        const existing = yield* Ref.get(sharedEngineRef);
        if (existing !== null) return existing;

        const cwd = engineCwd;
        const engineSettings = (yield* serverSettings.getSettings.pipe(
          Effect.orElseSucceed(() => undefined),
        ))?.providers?.engine;
        const flutterSdkBin =
          engineSettings?.flutterSdkBin?.trim() ||
          (typeof process.env.FLUTTER_SDK_BIN === "string"
            ? process.env.FLUTTER_SDK_BIN.trim()
            : "") ||
          "";
        const engineEnv = safeFlutterEnvironment(
          flutterSdkBin !== "" ? { FLUTTER_SDK_BIN: flutterSdkBin } : undefined,
        );
        if (options?.appsDir !== undefined) {
          engineEnv["CAIDE_DEV_APPS_DIR"] = options.appsDir;
        }
        if (options?.env !== undefined) {
          for (const [key, value] of Object.entries(options.env)) {
            engineEnv[key] = value;
          }
        }
        const client = new EngineClient({
          command: resolvedCommand,
          args: resolvedArgs,
          ...(cwd !== undefined ? { cwd } : {}),
          env: engineEnv,
          onNotification: (method, params) => {
            Effect.runFork(handleEngineNotification(method, params));
          },
        });
        yield* Effect.tryPromise({
          try: () => client.waitForSpawn(),
          catch: (cause) => processError(threadId, "engine process failed to spawn", cause),
        });

        const modelConfig = yield* engineModelConfig();
        const initializeResponse = yield* Effect.tryPromise({
          try: () =>
            client.initialize({
              clientName: "caide-server",
              protocolVersion: ENGINE_PROTOCOL_VERSION,
              ...(modelConfig
                ? {
                    settings: {
                      selectedModel: {
                        name: modelConfig.modelId,
                        provider: "caide-engine",
                      },
                      providerSettings: {
                        "caide-engine": {
                          apiKey: {
                            value: modelConfig.apiKey,
                            encryptionType: "plaintext",
                          },
                        },
                      },
                    },
                  }
                : {}),
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

        // Provision the custom provider the settings handshake references.
        // Tolerant: a pre-existing provider/model mid-air errors are fine.
        if (modelConfig !== undefined) {
          const provisionPromises = [
            client
              .dyadInvoke("create-custom-language-model-provider", {
                id: "caide-engine",
                name: "Caide Engine",
                apiBaseUrl: modelConfig.baseUrl,
              })
              .catch(() => null) as Promise<unknown>,
            client
              .dyadInvoke("create-custom-language-model", {
                apiName: modelConfig.modelId,
                displayName: modelConfig.modelId,
                providerId: "caide-engine",
              })
              .catch(() => null) as Promise<unknown>,
          ];
          yield* Effect.tryPromise({
            try: () => Promise.all(provisionPromises),
            catch: (cause) => processError(threadId, "engine model provisioning failed", cause),
          });
        }

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

        const shared: SharedEngine = {
          client,
          engineServerVersion: initialized.data.serverVersion,
        };
        yield* Ref.set(sharedEngineRef, shared);
        return shared;
      });

    /**
     * Resolve the engine app rowid backing a workspace root (app path).
     * Matches an existing app by path, else imports the folder verbatim
     * (same provisioning policy as thread chats). Returns null when the
     * path is empty.
     */
    const resolveAppIdByPath = (
      client: EngineClient,
      appPath: string | null | undefined,
      errorContext: ThreadId,
    ): Effect.Effect<number | null, ProviderAdapterError> =>
      Effect.gen(function* () {
        if (typeof appPath !== "string" || appPath === "" || appPath === ".") {
          return null;
        }
        const appListResponse = yield* Effect.tryPromise({
          try: () => client.dyadInvoke<{ apps?: Array<Record<string, unknown>> }>("list-apps"),
          catch: (cause) => processError(errorContext, "engine list-apps failed", cause),
        });
        const apps = Array.isArray(appListResponse?.apps) ? appListResponse.apps : [];
        const existing = apps.find((app) => {
          const appPathField = app.path;
          return (
            typeof appPathField === "string" &&
            (appPathField === appPath ||
              // engine resolves relative names under its apps dir; compare
              // both raw path and resolved absolute forms.
              path.resolve(appPathField) === path.resolve(appPath))
          );
        });
        if (existing !== undefined && typeof existing.id === "number") {
          return existing.id;
        }
        const importResponse = yield* Effect.tryPromise({
          try: () =>
            client.dyadInvoke<{ appId: number }>("import-app", {
              path: appPath,
              appName: path.basename(appPath),
            }),
          catch: (cause) => processError(errorContext, "engine import-app failed", cause),
        });
        return typeof importResponse?.appId === "number" ? importResponse.appId : null;
      });

    /**
     * Bind (or create) the engine app + chat backing this thread's
     * conversation. Legacy folders (thread cwd) are imported verbatim;
     * threads without a cwd get a fresh scratch app.
     */
    const ensureThreadChat = (
      context: EngineSessionContext,
    ): Effect.Effect<EngineChatMapping, ProviderAdapterError> =>
      Effect.gen(function* () {
        if (context.chatMapping !== null) return context.chatMapping;
        const { client } = yield* ensureSharedEngine(context.threadId);
        const appPath = context.session.cwd;

        let appId: number | null = null;
        let chatFromCreate: number | null = null;
        if (typeof appPath === "string" && appPath !== "" && appPath !== ".") {
          const existing = yield* resolveAppIdByPath(client, appPath, context.threadId);
          appId = existing;
          if (appId !== null) {
            const chatsResponse = yield* Effect.tryPromise({
              try: () => client.dyadInvoke<Array<Record<string, unknown>>>("get-chats", appId),
              catch: (cause) => processError(context.threadId, "engine get-chats failed", cause),
            });
            const firstChat =
              Array.isArray(chatsResponse) && chatsResponse.length > 0
                ? chatsResponse[0]
                : undefined;
            chatFromCreate =
              firstChat !== undefined && typeof firstChat.id === "number" ? firstChat.id : null;
          }
        }
        if (appId === null) {
          const name = `caide-workspace-${Date.now()}`;
          const createResponse = yield* Effect.tryPromise({
            try: () =>
              client.dyadInvoke<{ app?: { id?: number }; chatId?: number }>("create-app", {
                name,
                initialChatMode: "build",
                // Flutter-only product: never let the engine fall back to the
                // legacy web template.
                templateId: "flutter",
              }),
            catch: (cause) => processError(context.threadId, "engine create-app failed", cause),
          });
          appId = typeof createResponse?.app?.id === "number" ? createResponse.app.id : null;
          chatFromCreate =
            typeof createResponse?.chatId === "number" ? createResponse.chatId : null;
        }
        if (appId === null) {
          return yield* Effect.fail(
            processError(context.threadId, "engine app provisioning returned no appId", null),
          );
        }

        let chatId: number | null = chatFromCreate;
        if (chatId === null) {
          const chatsResponse = yield* Effect.tryPromise({
            try: () => client.dyadInvoke<Array<Record<string, unknown>>>("get-chats", appId),
            catch: (cause) => processError(context.threadId, "engine get-chats failed", cause),
          });
          chatId =
            Array.isArray(chatsResponse) &&
            chatsResponse.length > 0 &&
            typeof chatsResponse[0]?.id === "number"
              ? chatsResponse[0].id
              : null;
        }
        if (chatId === null) {
          const createChatResponse = yield* Effect.tryPromise({
            try: () => client.dyadInvoke<{ chatId: number }>("create-chat", appId, 120_000),
            catch: (cause) => processError(context.threadId, "engine create-chat failed", cause),
          });
          chatId = createChatResponse?.chatId ?? null;
        }
        if (chatId === null) {
          return yield* Effect.fail(
            processError(context.threadId, "engine chat provisioning returned no chatId", null),
          );
        }

        const mapping: EngineChatMapping = { appId, chatId };
        context.chatMapping = mapping;
        yield* Ref.update(chatToThread, (map) => {
          const next = new Map(map);
          next.set(chatId!, context.threadId);
          return next;
        });
        return mapping;
      });

    /**
     * Run one engine chat turn in the background. Completion/lifecycle is
     * driven by chat:stream notifications; this effect only guards against
     * a hard transport failure so the turn still settles.
     */
    const forkChatStream = (
      context: EngineSessionContext,
      chatId: number,
      turnId: TurnId,
      prompt: string,
      requestedChatMode: "build" | "ask" | "plan" | "local-agent",
    ): Effect.Effect<Fiber.Fiber<void, never>, never, never> =>
      Effect.gen(function* () {
        const { client } = yield* ensureSharedEngine(context.threadId);
        const response = yield* Effect.tryPromise({
          try: () =>
            client.dyadInvoke(
              "chat:stream",
              {
                chatId,
                prompt,
                requestedChatMode,
                suppressUserMessage: false,
              },
              30 * 60_000,
            ),
          catch: (cause) => processError(context.threadId, "engine chat:stream failed", cause),
        });
        void response;
      }).pipe(
        Effect.matchEffect({
          onSuccess: () => Effect.void,
          onFailure: (error) =>
            Effect.gen(function* () {
              const settled = yield* Ref.get(settledChats);
              if (settled.has(chatId)) return;
              const turn = context.currentTurnIdRef.current;
              yield* publishEvent(
                makeEvent<ProviderRuntimeEvent>(context.threadId, {
                  type: "runtime.error",
                  ...(turn !== null ? { turnId: turn } : {}),
                  payload: {
                    message: error.message,
                    class: "transport_error" as const,
                  },
                }),
              );
              yield* publishEvent(
                makeEvent<ProviderRuntimeEvent>(context.threadId, {
                  type: "item.completed",
                  ...(turn !== null ? { turnId: turn } : {}),
                  payload: {
                    itemType: "assistant_message" as const,
                    status: "failed" as const,
                  },
                }),
              );
              yield* publishTurnSettled(context.threadId, turn, "failed", "error", {
                errorMessage: error.message,
              });
              context.currentTurnIdRef.current = null;
            }),
        }),
        Effect.forkDetach,
      );

    /**
     * Start a full engine chat session for the thread, binding it to the
     * shared engine process and announcing it through the provider runtime
     * event stream so the thread's lifecycle (session.started /
     * thread.started) is wired into the projection.
     */
    const startEngineSession = (
      threadId: ThreadId,
      input: { runtimeMode: RuntimeMode; cwd?: string },
    ): Effect.Effect<EngineSessionContext, ProviderAdapterError> =>
      Effect.gen(function* () {
        const shared = yield* ensureSharedEngine(threadId);
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
          client: shared.client,
          engineServerVersion: shared.engineServerVersion,
          previewAppDir: null,
          currentTurnIdRef: { current: null },
          chatMapping: null,
        };
        yield* Ref.update(sessions, (map) => new Map(map).set(threadId, context));

        yield* publishEvent(
          makeEvent<ProviderRuntimeEvent>(threadId, {
            type: "session.started",
            payload: {
              message: `Engine ${shared.engineServerVersion} connected (protocol v${ENGINE_PROTOCOL_VERSION})`,
            },
          }),
        );
        yield* publishEvent(
          makeEvent<ProviderRuntimeEvent>(threadId, {
            type: "session.configured",
            payload: {
              config: {
                serverVersion: shared.engineServerVersion,
                capabilities: { flutter: true, preview: true },
              },
            },
          }),
        );
        yield* publishEvent(
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
        const shared = yield* ensureSharedEngine(threadId);
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
          client: shared.client,
          engineServerVersion: shared.engineServerVersion,
          previewAppDir: null,
          currentTurnIdRef: { current: null },
          chatMapping: null,
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

    // Layer teardown: kill the shared engine process so nothing outlives the
    // adapter (ProviderService also calls stopAll on shutdown, this is the
    // backstop for crash paths).
    yield* Effect.addFinalizer(() =>
      Ref.get(sharedEngineRef).pipe(
        Effect.flatMap((shared) => {
          if (shared !== null) shared.client.kill();
          return Effect.void;
        }),
        Effect.ignore,
      ),
    );

    // ── Goals bridge ──────────────────────────────────────────────────────
    // The engine owns goal state; the adapter proxies goal CRUD onto the
    // shared engine process and relays goal:updated / goal:run-requested /
    // goal:control-requested into a pub-sub stream for the WS layer (M4 web
    // consumer) and orchestration hooks (goal-driven turns).
    const goalRequest = <A = unknown>(
      threadId: ThreadId,
      channel: string,
      input: Record<string, unknown>,
    ): Effect.Effect<A, ProviderAdapterError> =>
      Effect.gen(function* () {
        const { client } = yield* ensureSharedEngine(threadId);
        return yield* Effect.tryPromise({
          try: () => client.dyadInvoke<A>(channel, input, 30_000),
          catch: (cause) => processError(threadId, `engine ${channel} failed`, cause),
        });
      });

    // M4 bridge: the engine's goal store speaks engine-native shapes (string
    // goal ids, numeric app rowids + chat rowids). Caide-side identity
    // (ProjectId/ThreadId) is translated on the WS boundary (wsRpc); this
    // layer exposes the raw engine surface plus the path↔appid helpers the
    // translation needs.
    const goalIdOf = (arg: { goalId: string }): Record<string, unknown> => ({
      goalId: String(arg.goalId),
    });

    const goalsApi: EngineGoalsApi = {
      create: (input) =>
        goalRequest(ThreadId.makeUnsafe(randomUUID()), "goal:create", {
          ...(input.appId !== undefined && input.appId !== null ? { appId: input.appId } : {}),
          ...(input.chatId !== undefined ? { chatId: input.chatId } : {}),
          ...(input.title !== undefined ? { title: input.title } : {}),
          objective: input.objective,
          ...(input.definitionOfDone !== undefined
            ? { definitionOfDone: input.definitionOfDone }
            : {}),
          ...(input.constraints !== undefined ? { constraints: input.constraints } : {}),
          ...(input.executionTarget !== undefined
            ? { executionTarget: input.executionTarget }
            : {}),
        }),
      get: (input) => goalRequest(ThreadId.makeUnsafe(randomUUID()), "goal:get", goalIdOf(input)),
      getActive: (input) =>
        goalRequest(
          ThreadId.makeUnsafe(randomUUID()),
          "goal:get-active",
          input.appId !== undefined && input.appId !== null ? { appId: input.appId } : {},
        ),
      list: (input) =>
        goalRequest(ThreadId.makeUnsafe(randomUUID()), "goal:list", {
          ...(input.appId !== undefined ? { appId: input.appId } : {}),
          ...(input.statuses !== undefined ? { statuses: input.statuses } : {}),
        }),
      listActivity: (input) =>
        goalRequest(ThreadId.makeUnsafe(randomUUID()), "goal:list-activity", {
          ...goalIdOf(input),
          limit: input.limit ?? 200,
        }),
      pause: (input) =>
        goalRequest(ThreadId.makeUnsafe(randomUUID()), "goal:pause", {
          ...goalIdOf(input),
          ...(input.reason !== undefined ? { reason: input.reason } : {}),
        }),
      resume: (input) =>
        goalRequest(ThreadId.makeUnsafe(randomUUID()), "goal:resume", goalIdOf(input)),
      cancel: (input) =>
        goalRequest(ThreadId.makeUnsafe(randomUUID()), "goal:cancel", {
          ...goalIdOf(input),
          ...(input.reason !== undefined ? { reason: input.reason } : {}),
        }),
      edit: (input) =>
        goalRequest(ThreadId.makeUnsafe(randomUUID()), "goal:edit", {
          ...goalIdOf(input),
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.objective !== undefined ? { objective: input.objective } : {}),
          ...(input.definitionOfDone !== undefined
            ? { definitionOfDone: input.definitionOfDone }
            : {}),
          ...(input.constraints !== undefined ? { constraints: input.constraints } : {}),
          ...(input.executionTarget !== undefined
            ? { executionTarget: input.executionTarget }
            : {}),
        }),
      steer: (input) =>
        goalRequest(ThreadId.makeUnsafe(randomUUID()), "goal:steer", {
          ...goalIdOf(input),
          instruction: input.instruction,
        }),
      retry: (input) =>
        goalRequest(ThreadId.makeUnsafe(randomUUID()), "goal:retry", goalIdOf(input)),
      verify: (input) =>
        goalRequest(ThreadId.makeUnsafe(randomUUID()), "goal:verify", goalIdOf(input)),

      resolveAppId: ({ workspaceRoot }) =>
        Effect.gen(function* () {
          const { client } = yield* ensureSharedEngine(ThreadId.makeUnsafe(randomUUID()));
          return yield* resolveAppIdByPath(
            client,
            workspaceRoot,
            ThreadId.makeUnsafe(randomUUID()),
          );
        }),
    };

    // ── Subagents bridge ─────────────────────────────────────────────────
    // Snapshot of engine-registered subagents (spawn_subagent tasks) plus the
    // live `subagent:updated` lifecycle stream, so the web UI can show running
    // indicators without polling the transcript.
    const subagentsApi: EngineSubagentsApi = {
      getActive: (input) =>
        goalRequest(ThreadId.makeUnsafe(randomUUID()), "sidebar:getActiveSubagents", {
          ...(input.appId !== undefined ? { appId: input.appId } : {}),
        }) as Effect.Effect<Array<EngineActiveSubagent>, ProviderAdapterError>,
    };

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
          // Bind the thread's conversation to an engine app + chat lazily.
          const mapping = yield* ensureThreadChat(context);
          const turnId = TurnId.makeUnsafe(randomUUID());
          context.currentTurnIdRef.current = turnId;
          yield* publishEvent(
            makeEvent<ProviderRuntimeEvent>(input.threadId, {
              type: "turn.started",
              turnId,
              payload: {
                ...(input.modelSelection?.model ? { model: input.modelSelection.model } : {}),
              },
            }),
          );

          // The engine accepts each of build/ask/plan/local-agent. The send
          // input's `mode` is the single source of truth (contracts decode it
          // with a "build" default). If it is still missing here the caller
          // bypassed schema decoding — degrade visibly instead of guessing.
          let requestedChatMode: "build" | "ask" | "plan" | "local-agent" = input.mode ?? "build";
          if (input.mode === undefined) {
            yield* Effect.logWarning(
              `[engine] sendTurn thread=${input.threadId}: input.mode missing (caller skipped schema decode); degrading to "${requestedChatMode}"`,
            );
          }

          yield* publishEvent(
            makeEvent<ProviderRuntimeEvent>(input.threadId, {
              type: "item.started",
              turnId,
              payload: { itemType: "assistant_message" as const },
            }),
          );

          // The chat:stream call resolves only when the engine stream ends;
          // stream events arrive as notifications and settle the turn.
          yield* forkChatStream(
            context,
            mapping.chatId,
            turnId,
            input.input ?? "",
            requestedChatMode,
          );

          const result: ProviderTurnStartResult = { threadId: input.threadId, turnId };
          return result;
        }),

      interruptTurn: (threadId) =>
        Effect.gen(function* () {
          const context = yield* getSession(threadId);
          const pending = context.chatMapping;
          if (pending !== null) {
            const { client } = yield* ensureSharedEngine(threadId);
            yield* Effect.tryPromise({
              try: () =>
                client
                  .dyadInvoke<unknown>("chat:cancel", { chatId: pending.chatId }, 10_000)
                  .catch(() => null),
              catch: () => null,
            }).pipe(Effect.ignore);
          }
          const turnId = context.currentTurnIdRef.current;
          yield* publishEvent(
            makeEvent<ProviderRuntimeEvent>(threadId, {
              type: "turn.aborted",
              ...(turnId !== null ? { turnId } : {}),
              payload: { reason: "interrupted by user" },
            }),
          );
          context.currentTurnIdRef.current = null;
        }),

      respondToRequest: (threadId, requestId, decision) =>
        Effect.gen(function* () {
          yield* getSession(threadId);
          const entry = yield* Ref.get(pendingRequests).pipe(
            Effect.map((map) => map.get(String(requestId)) ?? null),
          );
          if (entry === null) return;
          const engineDecision =
            decision === "accept"
              ? "accept-once"
              : decision === "acceptForSession"
                ? "accept-always"
                : "decline";
          const { client } = yield* ensureSharedEngine(threadId);
          if (entry.kind === "agent-tool-consent") {
            yield* Effect.tryPromise({
              try: () =>
                client.dyadInvoke("agent-tool:consent-response", {
                  requestId: String(requestId),
                  decision: engineDecision,
                }),
              catch: (cause) => processError(threadId, "engine consent-response failed", cause),
            }).pipe(Effect.ignore);
          } else {
            yield* Effect.tryPromise({
              try: () =>
                client.dyadInvoke("mcp:tool-consent-response", {
                  requestId: String(requestId),
                  decision: engineDecision,
                }),
              catch: (cause) =>
                processError(threadId, "engine tool-consent-response failed", cause),
            }).pipe(Effect.ignore);
          }
          yield* Ref.update(pendingRequests, (map) => {
            const next = new Map(map);
            next.delete(String(requestId));
            return next;
          });
          yield* publishEvent(
            makeEvent<ProviderRuntimeEvent>(entry.threadId, {
              type: "request.resolved",
              requestId: requestId as never,
              payload: {
                requestType: "command_execution_approval" as const,
                decision,
                resolution: { engineDecision },
              },
            }),
          );
        }),

      respondToUserInput: (threadId, requestId, answers) =>
        Effect.gen(function* () {
          yield* getSession(threadId);
          const entry = yield* Ref.get(pendingRequests).pipe(
            Effect.map((map) => map.get(String(requestId)) ?? null),
          );
          if (entry === null) return;
          const { client } = yield* ensureSharedEngine(threadId);
          const serialized: Record<string, string> = {};
          for (const [key, value] of Object.entries(answers ?? {})) {
            serialized[key] = Array.isArray(value)
              ? value.join(", ")
              : value === null
                ? ""
                : String(value);
          }
          if (entry.kind === "questionnaire") {
            yield* Effect.tryPromise({
              try: () =>
                client.dyadInvoke("plan:questionnaire-response", {
                  requestId: String(requestId),
                  answers: serialized,
                }),
              catch: (cause) =>
                processError(threadId, "engine questionnaire-response failed", cause),
            }).pipe(Effect.ignore);
          } else {
            yield* Effect.tryPromise({
              try: () =>
                client.dyadInvoke("agent-tool:env-var-response", {
                  requestId: String(requestId),
                  envVars: serialized,
                }),
              catch: (cause) => processError(threadId, "engine env-var-response failed", cause),
            }).pipe(Effect.ignore);
          }
          yield* Ref.update(pendingRequests, (map) => {
            const next = new Map(map);
            next.delete(String(requestId));
            return next;
          });
          yield* publishEvent(
            makeEvent<ProviderRuntimeEvent>(entry.threadId, {
              type: "user-input.resolved",
              requestId: requestId as never,
              payload: { answers: answers ?? {} },
            }),
          );
        }),

      stopSession: (threadId) =>
        Effect.gen(function* () {
          yield* getSession(threadId);
          yield* Ref.update(sessions, (map) => {
            const next = new Map(map);
            next.delete(threadId);
            return next;
          });
          yield* Ref.update(chatToThread, (map) => {
            const next = new Map(map);
            for (const [chatId, mappedThread] of next) {
              if (mappedThread === threadId) next.delete(chatId!);
            }
            return next;
          });
          yield* publishEvent(
            makeEvent<ProviderRuntimeEvent>(threadId, {
              type: "session.exited",
              payload: { reason: "stopped", recoverable: true, exitKind: "graceful" as const },
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
                ...(input.device !== undefined ? { device: input.device } : {}),
                ...(input.deviceId !== undefined ? { deviceId: input.deviceId } : {}),
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
          return { url: result.data.url, kind: result.data.kind };
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
            kind: result.data.kind,
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
                ...(input.signing !== undefined && input.signing !== null
                  ? { signing: input.signing }
                  : {}),
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
            ...(typeof (result.data as unknown as { sha256?: string }).sha256 === "string"
              ? { sha256: (result.data as unknown as { sha256: string }).sha256 }
              : {}),
            ...(typeof result.data.error === "string" ? { error: result.data.error } : {}),
            logs: result.data.logs,
          };
        }),

      previewScreenshot: (input) =>
        Effect.gen(function* () {
          const context = yield* getSession(input.threadId);
          const appDir = context.previewAppDir ?? context.session.cwd ?? "";
          const response = yield* Effect.tryPromise({
            try: () =>
              context.client.previewScreenshot({
                deviceId: input.deviceId ?? "",
                outputPath: "",
                appDir,
              }),
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
          // Engine returns both outputPath and optional image base64. A
          // missing image must fail cleanly — returning the outputPath here
          // would flow into a `data:image/png;base64,<path>` data URL and
          // produce a corrupt download.
          const data = result.data as unknown as { outputPath: string; image?: string | null };
          if (typeof data.image === "string" && data.image.length > 0) {
            return { image: data.image };
          }
          return yield* Effect.fail(
            processError(
              input.threadId,
              "engine preview/screenshot captured no image (no native device attached?)",
              new Error("empty screenshot"),
            ),
          );
        }),

      previewDevices: (input) =>
        Effect.gen(function* () {
          const context = yield* getSession(input.threadId);
          const response = yield* Effect.tryPromise({
            try: () => context.client.previewDevices(),
            catch: (cause) =>
              processError(input.threadId, "engine preview/devices request failed", cause),
          });
          if (response.error) {
            return yield* Effect.fail(
              processError(
                input.threadId,
                `engine preview/devices failed: ${response.error.code} ${response.error.message}`,
                new Error(response.error.message),
              ),
            );
          }
          const parsed = response.result as unknown as {
            devices: Array<{ id: string; name: string; isEmulator: boolean; platform?: string }>;
          };
          return { devices: Array.isArray(parsed?.devices) ? parsed.devices : [] };
        }),

      flutterToolchainStatus: (input) =>
        Effect.gen(function* () {
          const context = yield* getSession(input.threadId);
          const response = yield* Effect.tryPromise({
            try: () => context.client.flutterToolchainStatus(),
            catch: (cause) =>
              processError(input.threadId, "engine flutter/toolchain/status request failed", cause),
          });
          if (response.error) {
            return yield* Effect.fail(
              processError(
                input.threadId,
                `engine flutter/toolchain/status failed: ${response.error.code} ${response.error.message}`,
                new Error(response.error.message),
              ),
            );
          }
          return response.result as unknown as {
            supported: boolean;
            installed: boolean;
            version: string;
            root: string;
            sdkPath: string;
            flutterBin: string;
            estimatedDownloadBytes: number;
            unsupportedReason: string | null;
          };
        }),

      flutterToolchainInstall: (input) =>
        Effect.gen(function* () {
          const context = yield* getSession(input.threadId);
          const response = yield* Effect.tryPromise({
            try: () => context.client.flutterToolchainInstall(),
            catch: (cause) =>
              processError(
                input.threadId,
                "engine flutter/toolchain/install request failed",
                cause,
              ),
          });
          if (response.error) {
            return yield* Effect.fail(
              processError(
                input.threadId,
                `engine flutter/toolchain/install failed: ${response.error.code} ${response.error.message}`,
                new Error(response.error.message),
              ),
            );
          }
          const parsed = response.result as unknown as {
            status: {
              supported: boolean;
              installed: boolean;
              version: string;
              root: string;
              sdkPath: string;
              flutterBin: string;
              estimatedDownloadBytes: number;
              unsupportedReason: string | null;
            };
          };
          return { status: parsed.status };
        }),

      // ── Database integrations (Neon + Supabase) ──────────────────────
      // Relay allowlisted engine dyad-IPC channels. The WS layer enforces the
      // channel namespace allowlist; the engine validates each payload.

      databaseInvoke: ({ threadId, channel, payload }) =>
        Effect.gen(function* () {
          if (!/^(?:(?:neon|supabase):[a-z0-9:-]+|list-apps|get-app)$/.test(channel)) {
            return yield* Effect.fail(
              processError(
                threadId,
                `database channel not allowed: ${channel}`,
                new Error(channel),
              ),
            );
          }
          const context = yield* getSession(threadId);
          const value = yield* Effect.tryPromise({
            try: () => context.client.dyadInvoke<unknown>(channel, payload),
            catch: (cause) =>
              processError(threadId, `engine database channel "${channel}" failed`, cause),
          });
          return { value };
        }),

      // ── Goals ────────────────────────────────────────────────────────

      goals: goalsApi,

      streamGoalDomainEvents: Stream.fromPubSub(goalsEventQueue),

      subagents: subagentsApi,

      streamSubagentEvents: Stream.fromPubSub(subagentsEventQueue),

      createApp: ({ name }) =>
        Effect.gen(function* () {
          const errorContext = ThreadId.makeUnsafe(randomUUID());
          const { client } = yield* ensureSharedEngine(errorContext);
          const response = yield* Effect.tryPromise({
            try: () =>
              client.dyadInvoke<{
                app?: { id?: number; path?: string; resolvedPath?: string };
                chatId?: number;
              }>(
                "create-app",
                {
                  name,
                  initialChatMode: "build",
                  // The engine contract defaults to the legacy web template;
                  // this product builds Flutter apps only.
                  templateId: "flutter",
                },
                // Flutter scaffold + git init can take a while on first run.
                180_000,
              ),
            catch: (cause) => processError(errorContext, "engine create-app failed", cause),
          });
          const appId = typeof response?.app?.id === "number" ? response.app.id : null;
          const chatId = typeof response?.chatId === "number" ? response.chatId : null;
          if (appId === null || chatId === null) {
            return yield* Effect.fail(
              processError(errorContext, "engine create-app returned no app/chat identity", null),
            );
          }
          // The engine returns the absolute workspace in resolvedPath; fall
          // back to resolving the stored (relative) app path against its apps
          // root convention.
          const storedPath =
            typeof response.app?.resolvedPath === "string" && response.app.resolvedPath.length > 0
              ? response.app.resolvedPath
              : typeof response.app?.path === "string"
                ? response.app.path
                : null;
          if (storedPath === null) {
            return yield* Effect.fail(
              processError(errorContext, "engine create-app returned no app path", null),
            );
          }
          const appPath = getCaideAppPath(storedPath);
          return { appId, chatId, appPath };
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
          const shared = yield* Ref.get(sharedEngineRef);
          if (shared !== null) {
            shared.client.kill();
            yield* Ref.set(sharedEngineRef, null);
          }
          yield* Ref.set(sessions, new Map());
          yield* Ref.set(chatToThread, new Map());
          yield* Ref.set(pendingRequests, new Map());
        }),

      streamEvents: Stream.fromPubSub(runtimeEventQueue),
    };

    return adapter;
  });

export const EngineAdapterLive = Layer.effect(EngineAdapter, makeEngineAdapter());

export const EngineAdapterLiveWithOptions = (options: EngineAdapterLiveOptions) =>
  Layer.effect(EngineAdapter, makeEngineAdapter(options));
