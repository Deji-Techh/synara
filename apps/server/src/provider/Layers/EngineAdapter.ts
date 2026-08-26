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
import fs from "node:fs";
import path from "node:path";

import {
  EventId,
  MODEL_OPTIONS_BY_PROVIDER,
  type ApiProviderKind,
  type CanonicalItemType,
  type ProviderKind,
  type ProviderListModelsInput,
  type ProviderListModelsResult,
  type ProviderRuntimeEvent,
  type ProviderSession,
  type ProviderTurnStartResult,
  RuntimeItemId,
  RuntimeMode,
  ThreadId,
  TurnId,
} from "@caide/contracts";
import { EmbeddedEngineClient } from "../../dyadRuntime/embeddedEngineClient.ts";
import { getCaideAppPath } from "../../paths/caideApps";
import { listLiveApiProviderModels } from "../apiModelCatalog.ts";

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
  BuildCompletedPayloadSchema,
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
import { Cause, Effect, Fiber, Layer, Option, PubSub, Ref, Semaphore, Stream } from "effect";

import { ArtifactRegistry } from "../../persistence/Services/ArtifactRegistry.ts";

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
import { ServerConfig } from "../../config.ts";
import { ServerSecretStore } from "../../auth/Services/ServerSecretStore.ts";
import { ProjectionThreadRepository } from "../../persistence/Services/ProjectionThreads.ts";

export interface EngineAdapterLiveOptions {
  readonly cwd?: string;
  /** Dev/test override for the engine's caide-apps base directory. */
  readonly appsDir?: string;
  /** Extra environment variables for the engine process (dev/test only). */
  readonly env?: Readonly<Record<string, string>>;
}

interface EngineChatMapping {
  readonly appId: number;
  readonly chatId: number;
}

type PendingRequestKind =
  | "mcp-consent"
  | "agent-tool-consent"
  | "questionnaire"
  | "env-vars"
  | "app-blueprint";

interface PendingEngineRequest {
  readonly kind: PendingRequestKind;
  readonly threadId: ThreadId;
  readonly chatId?: number;
}

/**
 * Register an interaction without ever rebinding an existing request ID.
 * Engine request IDs are expected to be unique, but keeping this invariant at
 * the adapter boundary prevents a malformed/replayed event from moving an
 * approval or question to another thread. The map key is now
 * `${threadId}::${requestId}` so the same requestId in two different
 * threads/chats never collides and a response is never settled against the
 * wrong thread.
 */
export function pendingInteractionKey(threadId: ThreadId, requestId: string): string {
  return `${String(threadId)}::${String(requestId)}`;
}

export function tryRegisterPendingRequest(
  map: ReadonlyMap<string, PendingEngineRequest>,
  requestId: string,
  entry: PendingEngineRequest,
): readonly [registered: boolean, next: ReadonlyMap<string, PendingEngineRequest>] {
  const key = pendingInteractionKey(entry.threadId, requestId);
  if (map.has(key)) return [false, map];
  const next = new Map(map);
  next.set(key, entry);
  return [true, next];
}

export function ownsPendingRequest(
  entry: PendingEngineRequest,
  threadId: ThreadId,
  chatId?: number,
): boolean {
  if (entry.threadId !== threadId) return false;
  return entry.chatId === undefined || entry.chatId === chatId;
}

interface EngineSessionContext {
  readonly threadId: ThreadId;
  session: ProviderSession;
  readonly engineServerVersion: string;
  /** Reference to the shared engine client (all sessions share one process). */
  readonly client: EngineClientLike;
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
  /** Tracks characters emitted per message to avoid duplicates during streaming. */
  readonly emittedTranscriptRef: { current: Map<string, number> };
  /** Engine app/chat this thread's conversation is bound to (lazy). */
  chatMapping: EngineChatMapping | null;
}

interface SharedEngine {
  readonly client: EngineClientLike;
  readonly engineServerVersion: string;
}

const ENGINE_CUSTOM_PROVIDER_ID = "custom::caide-engine";
type EngineClientLike = EmbeddedEngineClient;

const makeEngineAdapter = (options?: EngineAdapterLiveOptions) =>
  Effect.gen(function* () {
    const runtimeEventQueue = yield* PubSub.unbounded<ProviderRuntimeEvent>();
    const sessions = yield* Ref.make<ReadonlyMap<ThreadId, EngineSessionContext>>(new Map());
    const sharedEngineRef = yield* Ref.make<SharedEngine | null>(null);
    // Engine startup is process-global. Serialize the check/spawn/initialize
    // sequence so concurrent sessions cannot launch duplicate children.
    const sharedEngineStartupLock = yield* Semaphore.make(1);
    const chatToThread = yield* Ref.make<ReadonlyMap<number, ThreadId>>(new Map());
    // Persistent chat→thread binding that survives chat:stream:end and session
    // restarts. Engine notifications carry only the numeric chatId; after a
    // provider session restart the transient `chatToThread` index is cleared and
    // the fresh session context has no chatMapping yet, so notifications
    // (plan:questionnaire, app-blueprint:update, consent, env-vars) must still be
    // attributable to the owning thread. Populated alongside `chatToThread` and
    // intentionally never cleared on stream-end or stop.
    const chatIdToThread = yield* Ref.make<ReadonlyMap<number, ThreadId>>(new Map());
    const pendingRequests = yield* Ref.make<ReadonlyMap<string, PendingEngineRequest>>(new Map());
    const settledChats = yield* Ref.make<ReadonlySet<number>>(new Set());
    const goalsEventQueue = yield* PubSub.unbounded<{
      type: "goal.updated" | "goal.run-requested" | "goal.control-requested";
      payload: unknown;
    }>();
    const subagentsEventQueue = yield* PubSub.unbounded<EngineSubagentEvent>();
    const serverSettings = yield* ServerSettingsService;
    const secretStore = yield* ServerSecretStore;
    const projectionThreadRepo = yield* ProjectionThreadRepository;
    // Optional: artifact registration is best-effort; tests and exotic hosts
    // may mount the adapter without the persistence graph.
    const artifactRegistry = Option.getOrUndefined(yield* Effect.serviceOption(ArtifactRegistry));
    /** buildId → threadId for attributing engine `build:completed` events. */
    const buildIdToThread = yield* Ref.make<ReadonlyMap<string, ThreadId>>(new Map());

    /**
     * Bridge server-side API credentials into the engine's own settings world.
     *
     * The engine resolves LLMs through its dyad pipeline using ITS settings DB
     * (`providerSettings[providerId].apiKey`) — it cannot see Caide's server
     * secret store. Without this bridge, agent-mode turns fail with
     * "No API keys available for any model supported by the 'auto' provider"
     * whenever the Builder custom-provider block is not configured, no matter
     * what keys the user entered in Settings > Providers.
     *
     * Only providers the engine actually supports are bridged; groq has no
     * engine-side provider and stays a direct-HTTP-only composer path.
     */
    const bridgeEngineProviderSettings = (): Effect.Effect<
      Record<string, { apiKey: { value: string; encryptionType: "plaintext" } }>,
      never
    > =>
      Effect.gen(function* () {
        const decoder = new TextDecoder("utf-8");
        const providerSettings: Record<
          string,
          { apiKey: { value: string; encryptionType: "plaintext" } }
        > = {};
        const bridgedKinds: ReadonlyArray<{
          caideKind: string;
          engineId: string;
        }> = [
          { caideKind: "opencodeZen", engineId: "opencode-zen" },
          { caideKind: "opencodeGo", engineId: "opencode-go" },
          { caideKind: "groq", engineId: "groq" },
          { caideKind: "openai", engineId: "openai" },
          { caideKind: "anthropic", engineId: "anthropic" },
          { caideKind: "google", engineId: "google" },
          { caideKind: "deepseek", engineId: "deepseek" },
          { caideKind: "openrouter", engineId: "openrouter" },
          { caideKind: "xai", engineId: "xai" },
          { caideKind: "together", engineId: "together" },
          { caideKind: "mistral", engineId: "mistral" },
        ];
        for (const { caideKind, engineId } of bridgedKinds) {
          const secret = yield* secretStore
            .get(`provider-${caideKind}-api-key`)
            .pipe(Effect.orElseSucceed(() => null));
          if (!secret || secret.byteLength === 0) continue;
          const apiKey = decoder.decode(secret);
          if (apiKey.trim().length === 0) continue;
          providerSettings[engineId] = {
            apiKey: { value: apiKey, encryptionType: "plaintext" },
          };
        }
        return providerSettings;
      });

    /** Caide composer kinds that map onto an engine builtin LLM provider. */
    const ENGINE_PROVIDER_BY_CAIDE_KIND: ReadonlyMap<string, string> = new Map([
      ["opencodeZen", "opencode-zen"],
      ["opencodeGo", "opencode-go"],
      ["groq", "groq"],
      ["openai", "openai"],
      ["anthropic", "anthropic"],
      ["google", "google"],
      ["deepseek", "deepseek"],
      ["openrouter", "openrouter"],
      ["xai", "xai"],
      ["ollama", "ollama"],
      ["together", "together"],
      ["mistral", "mistral"],
      ["engine", ENGINE_CUSTOM_PROVIDER_ID],
      ["auto", "auto"],
    ]);

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

    const processError = (threadId: ThreadId, detail: string, cause: unknown) => {
      const causeError = cause instanceof Error ? cause : new Error(String(cause));
      // The toast/UI surfaces `message` only — fold the underlying reason into
      // the detail so "engine initialize request failed" style errors actually
      // say why (timeout vs process death vs engine-side rejection).
      const causeText = causeError.message.trim();
      return new ProviderAdapterProcessError({
        provider: "engine",
        threadId,
        detail:
          causeText.length > 0 && !detail.includes(causeText) ? `${detail}: ${causeText}` : detail,
        cause: causeError,
      });
    };

    const publishEvent = (event: ProviderRuntimeEvent) => PubSub.publish(runtimeEventQueue, event);

    const publishTextDelta = (
      threadId: ThreadId,
      turnId: TurnId,
      delta: string,
      summaryIndex?: number,
      itemId?: string,
    ) =>
      publishEvent(
        makeEvent<ProviderRuntimeEvent>(threadId, {
          type: "content.delta",
          turnId,
          ...(itemId ? { itemId: RuntimeItemId.makeUnsafe(itemId) } : {}),
          payload: {
            streamKind: "assistant_text" as const,
            delta,
            ...(summaryIndex !== undefined ? { summaryIndex } : {}),
          },
        }),
      );

    const publishSnapshot = (threadId: ThreadId, turnId: TurnId, snapshot: string, itemId?: string) =>
      publishEvent(
        makeEvent<ProviderRuntimeEvent>(threadId, {
          type: "content.snapshot",
          turnId,
          ...(itemId ? { itemId: RuntimeItemId.makeUnsafe(itemId) } : {}),
          payload: {
            streamKind: "assistant_text" as const,
            snapshot,
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
      Effect.gen(function* () {
        const transient = yield* Ref.get(chatToThread);
        const persistent = yield* Ref.get(chatIdToThread);
        const live = yield* Ref.get(sessions);

        // Resolve the owning thread: transient index first (fast path), then the
        // persistent registry, then a scan of live sessions by chat binding.
        let threadId = transient.get(chatId);
        if (threadId === undefined) threadId = persistent.get(chatId);
        const directSession =
          threadId === undefined ? null : (live.get(threadId) ?? null);
        if (directSession !== null) return directSession;

        // The mapped thread's session is gone (session restart torn it down) or
        // the chat is unknown — scan live sessions by their chat binding; a
        // freshly re-created session may already have re-bound via ensureThreadChat.
        for (const context of live.values()) {
          if (context.chatMapping?.chatId === chatId) {
            return context;
          }
        }
        yield* Effect.logWarning("[engine-adapter] sessionForChat unresolvable", {
          chatId,
          mappedThreadId: threadId === undefined ? null : String(threadId),
          liveSessions: Array.from(live.keys()).map(String),
        });
        return null;
      });

    /**
     * Resolve the chatId a thread is bound to, surviving session restarts.
     * Used by the response handlers' ownership checks: after a restart the
     * fresh session context has a null chatMapping, which made
     * ownsPendingRequest fail for entries that carry a chatId (questionnaire,
     * blueprint, consent) and silently dropped the user's answer/approval.
     */
    const resolveThreadChatId = (threadId: ThreadId): Effect.Effect<number | undefined> =>
      Ref.get(chatIdToThread).pipe(
        Effect.map((persistent) => {
          for (const [chatId, mappedThread] of persistent) {
            if (mappedThread === threadId) return chatId;
          }
          return undefined;
        }),
      );

    const claimChatSettlement = (chatId: number): Effect.Effect<boolean> =>
      Ref.modify(settledChats, (set) => {
        if (set.has(chatId)) return [false, set] as const;
        const next = new Set(set);
        next.add(chatId);
        return [true, next] as const;
      });

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
     * Dyad-like idempotent transcript forwarder. The engine resends the full
     * `messages` transcript on every chunk (like dyad's `updatedChat.messages`).
     * Instead of delta bookkeeping (`emittedTranscriptRef` length tracking) we
     * publish full snapshots keyed by `messageId` — ingestion dedupes them
     * last-write-wins, so duplicate retransmits on the 2nd turn are no-ops.
     * This mirrors dyad's `next.set(chatId, updatedMessages)` full replace.
     */
    const emitTranscriptMessages = (
      context: EngineSessionContext,
      messages: unknown,
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        const turnId = context.currentTurnIdRef.current;
        if (!turnId || !Array.isArray(messages)) return;

        const emitted = context.emittedTranscriptRef.current;
        for (const message of messages) {
          if (typeof message !== "object" || message === null) continue;
          const raw = message as Record<string, unknown>;
          const messageId =
            typeof raw.id === "string" || typeof raw.id === "number"
              ? String(raw.id)
              : typeof raw.messageId === "string" || typeof raw.messageId === "number"
                ? String(raw.messageId)
                : null;
          if (!messageId) continue;
          if (raw.role !== "assistant" && raw.role !== "agent") continue;
          const content = raw.content;
          const textBlocks: string[] = [];
          const toolBlocks: Array<Record<string, unknown>> = [];
          if (typeof content === "string") {
            if (content.length > 0) {
              textBlocks.push(content);
            }
          } else if (Array.isArray(content)) {
            for (const block of content) {
              if (typeof block !== "object" || block === null) continue;
              const b = block as Record<string, unknown>;
              if (b.type === "text" && typeof b.text === "string") {
                textBlocks.push(b.text);
              } else if (b.type === "tool_use" && typeof b.name === "string") {
                toolBlocks.push(b);
              }
            }
          }
          if (textBlocks.length > 0) {
            const text = textBlocks.join("\n");
            if (text.length > 0) {
              // Full snapshot — ingestion dedupes via prefix check last-write-wins.
              yield* publishSnapshot(context.threadId, turnId, text, messageId);
            }
          }
          const alreadyLaunched = emitted.get(`${messageId}:tools`) ?? 0;
          if (toolBlocks.length > alreadyLaunched) {
            emitted.set(`${messageId}:tools`, toolBlocks.length);
            for (const tool of toolBlocks.slice(alreadyLaunched)) {
              const toolName = (String(tool.name ?? "").trim() || "tool");
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
        // DEBUG: trace interaction-channel notifications (questionnaire,
        // blueprint, consent, env-vars) so we can see whether they reach the
        // adapter and what chatId they carry.
        if (
          method === "plan:questionnaire" ||
          method === "app-blueprint:update" ||
          method === "agent-tool:consent-request" ||
          method === "agent-tool:prompt-env-vars"
        ) {
          const debugPayload = (params ?? {}) as Record<string, unknown>;
          yield* Effect.logInfo("[engine-adapter] interaction notification", {
            channel: method,
            chatId: debugPayload.chatId,
            requestId: debugPayload.requestId,
          });
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
              const context = yield* sessionForChat(chatId);
              const claimed = yield* claimChatSettlement(chatId);
              if (claimed && context !== null) {
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
                markSessionIdle(context, "interrupted");
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

            if (typeof payload.streamingPatch === "string" && payload.streamingPatch !== "") {
              const streamingMessageId =
                typeof payload.streamingMessageId === "string" ||
                typeof payload.streamingMessageId === "number"
                  ? String(payload.streamingMessageId)
                  : undefined;
              yield* publishTextDelta(
                context.threadId,
                turnId,
                payload.streamingPatch,
                undefined,
                streamingMessageId,
              );
              const messageId = streamingMessageId ?? "streaming";
              const emitted = context.emittedTranscriptRef.current;
              emitted.set(messageId, (emitted.get(messageId) ?? 0) + payload.streamingPatch.length);
            } else if (
              typeof payload.streamingPatch === "object" &&
              payload.streamingPatch !== null &&
              typeof (payload.streamingPatch as Record<string, unknown>).content === "string"
            ) {
              const patch = payload.streamingPatch as Record<string, unknown>;
              const patchText = patch.content as string;
              const patchOffset = typeof patch.offset === "number" ? patch.offset : 0;
              const messageId =
                typeof payload.streamingMessageId === "string" ||
                typeof payload.streamingMessageId === "number"
                  ? String(payload.streamingMessageId)
                  : "streaming";
              const emitted = context.emittedTranscriptRef.current;
              const emittedLength = emitted.get(messageId) ?? 0;
              if (patchText !== "" && patchOffset >= emittedLength) {
                yield* publishTextDelta(
                  context.threadId,
                  turnId,
                  patchText,
                  undefined,
                  messageId,
                );
                emitted.set(messageId, patchOffset + patchText.length);
              }
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
            if (!(yield* claimChatSettlement(chatId))) return;
            const turnId = context.currentTurnIdRef.current;
            const wasCancelled = payload.wasCancelled === true;
            // Ensure the tail of any final message was flushed.
            if (Array.isArray(payload.messages)) {
              yield* emitTranscriptMessages(context, payload.messages);
            }
            // Never treat a provider completion with no visible text, tools,
            // or plan artifact as a successful assistant turn. The engine's
            // persisted placeholder may otherwise render as "(empty response)"
            // while the orchestration layer believes the turn completed.
            const hasVisiblePayloadMessage = Array.isArray(payload.messages)
              ? payload.messages.some((message) => {
                  if (typeof message !== "object" || message === null) return false;
                  const raw = message as Record<string, unknown>;
                  if (raw.role !== "assistant" && raw.role !== "agent") return false;
                  if (typeof raw.content === "string") return raw.content.trim().length > 0;
                  if (!Array.isArray(raw.content)) return false;
                  return raw.content.some(
                    (block) =>
                      typeof block === "object" &&
                      block !== null &&
                      (block as Record<string, unknown>).type === "text" &&
                      typeof (block as Record<string, unknown>).text === "string" &&
                      ((block as Record<string, unknown>).text as string).trim().length > 0,
                  );
                })
              : false;
            const hasMessages =
              hasVisiblePayloadMessage ||
              [...context.emittedTranscriptRef.current.entries()].some(
                ([key, count]) => !key.endsWith(":tools") && count > 0,
              );
            const hasPlan =
              typeof payload.planMarkdown === "string" && payload.planMarkdown.trim() !== "";
            if (!hasMessages && !hasPlan) {
              yield* publishEvent(
                makeEvent<ProviderRuntimeEvent>(context.threadId, {
                  type: "runtime.error",
                  ...(turnId !== null ? { turnId } : {}),
                  payload: {
                    message: "Engine completed without a response.",
                    class: "provider_error" as const,
                  },
                }),
              );
              yield* publishTurnSettled(context.threadId, turnId, "failed", "empty_response", {
                errorMessage: "Engine completed without a response.",
              });
              context.currentTurnIdRef.current = null;
              markSessionIdle(context, "error");
              return;
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
            markSessionIdle(context, wasCancelled ? "interrupted" : "ready");
            return;
          }
          case "plan:update": {
            if (typeof payload.chatId !== "number") return;
            const chatId = payload.chatId as number;
            const context = yield* sessionForChat(chatId);
            if (context === null) return;
            const turnId = context.currentTurnIdRef.current;
            if (turnId === null) return;

            if (typeof payload.planMarkdown === "string" && payload.planMarkdown !== "") {
              yield* publishEvent(
                makeEvent<ProviderRuntimeEvent>(context.threadId, {
                  type: "turn.proposed.completed",
                  turnId,
                  payload: { planMarkdown: payload.planMarkdown },
                }),
              );
            }
            return;
          }
          case "chat:response:error": {
            if (typeof payload.chatId !== "number") return;
            const chatId = payload.chatId as number;
            const context = yield* sessionForChat(chatId);
            if (context === null) return;
            if (!(yield* claimChatSettlement(chatId))) return;
            const turnId = context.currentTurnIdRef.current;
            const message = (String(payload.error ?? "").trim() || "engine turn failed");
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
            markSessionIdle(context, "error");
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
                  task: (String(t.content ?? t.task ?? "").trim() || "…"),
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
            const registered = yield* Ref.modify(pendingRequests, (map) =>
              tryRegisterPendingRequest(map, requestId, {
                kind: "agent-tool-consent",
                threadId: context.threadId,
                ...(chatId !== undefined ? { chatId } : {}),
              }),
            );
            if (!registered) return;
            const toolName = (String(payload.toolName ?? "").trim() || "tool");
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
            const registered = yield* Ref.modify(pendingRequests, (map) =>
              tryRegisterPendingRequest(map, requestId, {
                kind: "mcp-consent",
                threadId: context.threadId,
                ...(chatId !== undefined ? { chatId } : {}),
              }),
            );
            if (!registered) return;
            const toolName = (String(payload.toolName ?? "").trim() || "tool");
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
            const eventChatId = typeof payload.chatId === "number" ? payload.chatId : undefined;
            let matchedKey: string | null = null;
            let entry: PendingEngineRequest | null = null;
            for (const [key, candidate] of pending.entries()) {
              if (String(candidate.requestId ?? key.split("::").pop()) !== requestId) {
                // Fallback for legacy keys stored as bare requestId: also match requestId directly
                if (key !== requestId) continue;
              }
              // Composite key format is `${threadId}::${requestId}`; extract requestId suffix for comparison
              const suffix = key.includes("::") ? key.split("::").pop()! : key;
              if (suffix !== requestId) continue;
              if (!ownsPendingRequest(candidate, candidate.threadId, eventChatId)) continue;
              // Prefer entry whose thread's chatId matches event chat when available
              if (eventChatId !== undefined && candidate.chatId !== undefined && candidate.chatId !== eventChatId) continue;
              matchedKey = key;
              entry = candidate;
              break;
            }
            if (!matchedKey || !entry) return;
            yield* Ref.update(pendingRequests, (map) => {
              const next = new Map(map);
              next.delete(matchedKey!);
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
            const registered = yield* Ref.modify(pendingRequests, (map) =>
              tryRegisterPendingRequest(map, requestId, {
                kind: "questionnaire",
                threadId: context.threadId,
                chatId: payload.chatId as number,
              }),
            );
            if (!registered) return;
            const questions = Array.isArray(payload.questions)
              ? payload.questions
                  .map((question) => {
                    const q = (question ?? {}) as Record<string, unknown>;
                    const id = String(q.id ?? "");
                    const questionText = String(q.question ?? "").trim();
                    if (questionText === "") return null;
                    const options = Array.isArray(q.options)
                      ? (q.options as unknown[])
                          .map((option) => String(option).trim())
                          .filter((option) => option !== "")
                          .map((option) => ({
                            label: option,
                            description: "",
                          }))
                      : [];
                    return {
                      id: id !== "" ? id : randomUUID(),
                      header: "Question",
                      question: questionText,
                      options,
                      multiSelect: q.type === "checkbox",
                    };
                  })
                  .filter((question) => question !== null)
              : [];
            if (questions.length === 0) {
              yield* Effect.logWarning(
                "engine questionnaire yielded no renderable questions; skipping",
                { chatId: payload.chatId, requestId },
              );
              return;
            }
            yield* publishEvent(
              makeEvent<ProviderRuntimeEvent>(context.threadId, {
                type: "user-input.requested",
                requestId: requestId as never,
                payload: { questions },
              }),
            );
            yield* Effect.logInfo("[engine-adapter] published user-input.requested", {
              chatId: payload.chatId,
              requestId,
              threadId: String(context.threadId),
              questionCount: questions.length,
            });
            return;
          }

          case "agent-tool:prompt-env-vars": {
            if (typeof payload.chatId !== "number") return;
            const context = yield* sessionForChat(payload.chatId);
            if (context === null) return;
            const requestId = String(payload.requestId ?? "");
            if (requestId === "") return;
            const registered = yield* Ref.modify(pendingRequests, (map) =>
              tryRegisterPendingRequest(map, requestId, {
                kind: "env-vars",
                threadId: context.threadId,
                chatId: payload.chatId as number,
              }),
            );
            if (!registered) return;
            const questions = Array.isArray(payload.vars)
              ? (payload.vars as unknown[])
                  .map((variable) => {
                    const v = (variable ?? {}) as Record<string, unknown>;
                    const key = String(v.key ?? "").trim();
                    if (key === "") return null;
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
                  .filter((question) => question !== null)
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
          case "app-blueprint:update": {
            // The agent wrote an app blueprint and ended its turn (consent was
            // granted earlier). Surface it to the orchestrator as an approval so
            // the web can show an editable card; approving routes back through
            // respondToRequest -> app-blueprint:approve.
            if (typeof payload.chatId !== "number") return;
            const chatId = payload.chatId as number;
            const context = yield* sessionForChat(chatId);
            if (context === null) return;
            const data = (payload.data ?? {}) as Record<string, unknown>;
            const appName = (String(data.appName ?? "App").trim() || "App");
            const requestId = `app-blueprint:${chatId}:${Date.now()}`;
            const registered = yield* Ref.modify(pendingRequests, (map) =>
              tryRegisterPendingRequest(map, requestId, {
                kind: "app-blueprint",
                threadId: context.threadId,
                chatId,
              }),
            );
            if (!registered) return;
            yield* publishEvent(
              makeEvent<ProviderRuntimeEvent>(context.threadId, {
                type: "request.opened",
                requestId: requestId as never,
                payload: {
                  requestType: "app_blueprint" as const,
                  detail: appName,
                  args: { chatId, blueprint: data },
                },
              }),
            );
            return;
          }
          case "app-blueprint:approved": {
            // The engine confirmed the blueprint approval. Kick a fresh turn so
            // the agent proceeds with implementation under the approved
            // blueprint (mirrors dyad's renderer starting the follow-up turn).
            if (typeof payload.chatId !== "number") return;
            const chatId = payload.chatId as number;
            const context = yield* sessionForChat(chatId);
            if (context === null) return;
            const turnId = context.currentTurnIdRef.current ?? TurnId.makeUnsafe(randomUUID());
            yield* forkChatStream(
              context,
              chatId,
              turnId,
              "[App blueprint approved — proceed with implementation.]",
              "local-agent",
            );
            return;
          }
          case "build:completed": {
            // The engine snapshotted a successful build into the app's stable
            // artifact store; persist it in the global registry. Attribution
            // uses the buildId→thread map captured at previewBuildStart; an
            // unknown build (e.g. started before a server restart) is skipped.
            if (artifactRegistry === undefined) return;
            const parsed = BuildCompletedPayloadSchema.safeParse(payload);
            if (!parsed.success) {
              yield* Effect.logWarning("engine build:completed payload malformed");
              return;
            }
            const threadId = (yield* Ref.get(buildIdToThread)).get(parsed.data.buildId);
            if (threadId === undefined) {
              yield* Effect.logWarning(
                `engine build:completed for unknown buildId ${parsed.data.buildId}; skipping artifact registration`,
              );
              return;
            }
            yield* Ref.update(buildIdToThread, (map) => {
              const next = new Map(map);
              next.delete(parsed.data.buildId);
              return next;
            });
            yield* artifactRegistry
              .insert({
                threadId,
                appDir: parsed.data.appDir,
                filePath: parsed.data.filePath,
                fileName: parsed.data.fileName,
                kind: parsed.data.kind,
                channel: parsed.data.channel,
                target: parsed.data.target,
                sizeBytes: parsed.data.sizeBytes,
                sha256: parsed.data.sha256,
                finishedAt: parsed.data.finishedAt,
              })
              .pipe(
                Effect.catch((error) =>
                  Effect.logWarning("artifact registry insert failed", {
                    buildId: parsed.data.buildId,
                    error: String(error),
                  }),
                ),
              );
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
    const ensureSharedEngineUnlocked = (
      threadId: ThreadId,
    ): Effect.Effect<SharedEngine, ProviderAdapterError> =>
      Effect.gen(function* () {
        const existing = yield* Ref.get(sharedEngineRef);
        if (existing !== null) return existing;

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
        // Pin the engine's data dir to a writable, profile-scoped location.
        // Without this the engine's CWD-relative `./userData` fallback lands
        // inside read-only packaged mounts (AppImage `.mount_*`), where its
        // sqlite mkdir dies with ENOENT and every engine thread fails to
        // start. Both envs must agree: paths.ts (db/sqlite) reads
        // CAIDE_USER_DATA_DIR while the electron shim (settings storage)
        // reads CAIDE_ENGINE_DATA_DIR. Optional service so test harnesses
        // can mount the adapter without a full config graph.
        const serverConfigOption = yield* Effect.serviceOption(ServerConfig);
        if (Option.isSome(serverConfigOption)) {
          const engineUserDataDir = path.join(
            serverConfigOption.value.baseDir,
            serverConfigOption.value.devUrl !== undefined ? "dev" : "userdata",
            "engine",
          );
          try {
            fs.mkdirSync(engineUserDataDir, { recursive: true });
          } catch {
            // The engine surfaces its own error if this somehow fails.
          }
          engineEnv["CAIDE_USER_DATA_DIR"] = engineUserDataDir;
          engineEnv["CAIDE_ENGINE_DATA_DIR"] = engineUserDataDir;
        }
        if (options?.appsDir !== undefined) {
          engineEnv["CAIDE_DEV_APPS_DIR"] = options.appsDir;
        }
        if (options?.env !== undefined) {
          for (const [key, value] of Object.entries(options.env)) {
            engineEnv[key] = value;
          }
        }
        const modelConfig = yield* engineModelConfig();
        const bridgedProviderSettings = yield* bridgeEngineProviderSettings();
        // Merge order: Builder custom-provider settings win over the generic
        // bridges for the same key; today their id namespaces never collide.
        const initializeProviderSettings: Record<string, unknown> = {
          ...bridgedProviderSettings,
          ...(modelConfig
            ? {
                [ENGINE_CUSTOM_PROVIDER_ID]: {
                  apiKey: { value: modelConfig.apiKey, encryptionType: "plaintext" },
                },
              }
            : {}),
        };
        const initializeSettings: {
          selectedModel?: { name: string; provider: string };
          providerSettings: Record<string, unknown>;
        } = { providerSettings: initializeProviderSettings };
        if (modelConfig) {
          initializeSettings.selectedModel = {
            name: modelConfig.modelId,
            provider: ENGINE_CUSTOM_PROVIDER_ID,
          };
        }
        const onNotification = (method: string, params: unknown) => {
          Effect.runFork(
            handleEngineNotification(method, params).pipe(
              Effect.catchCause((cause) =>
                Effect.logError("[engine-adapter] notification handler failed", {
                  method,
                  cause: Cause.pretty(cause),
                }),
              ),
            ),
          );
        };
        const client: EngineClientLike = yield* Effect.tryPromise({
          try: () =>
            EmbeddedEngineClient.create({
              dataDir:
                engineEnv.CAIDE_ENGINE_DATA_DIR ??
                path.join(process.cwd(), "userData", "engine"),
              ...(options?.appsDir !== undefined ? { appsDir: options.appsDir } : {}),
              settings: initializeSettings,
              onNotification,
            }),
          catch: (cause) =>
            processError(threadId, "embedded dyad runtime failed to start", cause),
        });
        yield* Effect.tryPromise({
          try: () => client.waitForSpawn(),
          catch: (cause) => processError(threadId, "dyad runtime failed to become ready", cause),
        });
        const initializeResponse = yield* Effect.tryPromise({
          try: () =>
            client.initialize({
              clientName: "caide-server",
              protocolVersion: ENGINE_PROTOCOL_VERSION,
              settings: initializeSettings,
            }),
          catch: (cause) => {
            const health = client.describeHealth();
            return processError(
              threadId,
              health.length > 0
                ? `engine initialize request failed (${health})`
                : "engine initialize request failed",
              cause,
            );
          },
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
        // The model depends on the provider, so these calls must be ordered.
        // Both operations are idempotent from the adapter's perspective:
        // already-existing rows are treated as success.
        if (modelConfig !== undefined) {
          yield* Effect.tryPromise({
            try: async () => {
              await client
                .dyadInvoke("create-custom-language-model-provider", {
                  id: "caide-engine",
                  name: "Caide Engine",
                  apiBaseUrl: modelConfig.baseUrl,
                })
                .catch(() => null);
              await client
                .dyadInvoke("create-custom-language-model", {
                  apiName: modelConfig.modelId,
                  displayName: modelConfig.modelId,
                  providerId: ENGINE_CUSTOM_PROVIDER_ID,
                })
                .catch(() => null);
            },
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

    const ensureSharedEngine = (
      threadId: ThreadId,
    ): Effect.Effect<SharedEngine, ProviderAdapterError> =>
      sharedEngineStartupLock.withPermits(1)(ensureSharedEngineUnlocked(threadId));

    /**
     * Resolve the engine app rowid backing a workspace root (app path).
     * Matches an existing app by path, else imports the folder verbatim
     * (same provisioning policy as thread chats). Returns null when the
     * path is empty.
     */
    const resolveAppIdByPath = (
      client: EngineClientLike,
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
          if (typeof appPathField !== "string") return false;
          if (appPathField === appPath) return true;
          // Engine stores relative names (e.g. "nebulous-otter") under
          // ~/caide-apps; compare the resolved absolute forms via
          // getCaideAppPath so relative-vs-absolute lookups match.
          try {
            return getCaideAppPath(appPathField) === getCaideAppPath(appPath);
          } catch {
            return false;
          }
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
        }
        if (appId === null) {
          const name = `caide-workspace-${Date.now()}`;
          const createResponse = yield* Effect.tryPromise({
            try: () =>
              client.dyadInvoke<{ app?: { id?: number }; chatId?: number }>("create-app", {
                name,
                initialChatMode: "local-agent",
                framework: "blank",
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

        const threadOpt = yield* projectionThreadRepo
          .getById({ threadId: context.threadId })
          .pipe(Effect.catch(() => Effect.succeed(Option.none())));
        const threadRow = Option.getOrNull(threadOpt);

        if (chatId === null && threadRow !== null && typeof threadRow.engineChatId === "number") {
          const chatsResponse = yield* Effect.tryPromise({
            try: () => client.dyadInvoke<Array<Record<string, unknown>>>("get-chats", appId),
            catch: (cause) => processError(context.threadId, "engine get-chats failed", cause),
          });
          const persistedChat =
            Array.isArray(chatsResponse) &&
            chatsResponse.find((candidate) => candidate?.id === threadRow.engineChatId);
          if (persistedChat !== undefined) {
            chatId = threadRow.engineChatId;
          }
        }

        if (chatId === null) {
          const createChatResponse = yield* Effect.tryPromise({
            try: () =>
              client.dyadInvoke<number | { chatId?: number }>("create-chat", appId, 120_000),
            catch: (cause) => processError(context.threadId, "engine create-chat failed", cause),
          });
          chatId =
            typeof createChatResponse === "number"
              ? createChatResponse
              : (createChatResponse?.chatId ?? null);

          if (chatId !== null && threadRow !== null) {
            yield* projectionThreadRepo
              .upsert({ ...threadRow, engineChatId: chatId })
              .pipe(Effect.catch(() => Effect.void));
          }
        }
        if (chatId === null) {
          return yield* Effect.fail(
            processError(context.threadId, "engine chat provisioning returned no chatId", null),
          );
        }

        const mapping: EngineChatMapping = { appId, chatId };
        const existingOwner = (yield* Ref.get(chatToThread)).get(chatId);
        if (existingOwner !== undefined && existingOwner !== context.threadId) {
          return yield* Effect.fail(
            processError(
              context.threadId,
              `engine chat ${chatId} is already owned by thread ${existingOwner}`,
              null,
            ),
          );
        }
        context.chatMapping = mapping;
        yield* Ref.update(chatToThread, (map) => {
          const next = new Map(map);
          next.set(chatId!, context.threadId);
          return next;
        });
        yield* Ref.update(chatIdToThread, (map) => {
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
      requestedChatMode: "plan" | "local-agent",
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
              if (!(yield* claimChatSettlement(chatId))) return;
              const turn = context.currentTurnIdRef.current;
              const transportMessage = (error.message.trim() || "engine chat:stream failed");
              yield* publishEvent(
                makeEvent<ProviderRuntimeEvent>(context.threadId, {
                  type: "runtime.error",
                  ...(turn !== null ? { turnId: turn } : {}),
                  payload: {
                    message: transportMessage,
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
                errorMessage: transportMessage,
              });
              context.currentTurnIdRef.current = null;
              markSessionIdle(context, "error");
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
          emittedTranscriptRef: { current: new Map() },
          chatMapping: null,
        };
        // A provider session restart between turns creates a fresh context with
        // no chat binding, but the engine keeps streaming the same chat. Restore
        // the chat→thread transient index from the persistent registry so
        // mid-turn notifications (questionnaire/blueprint/consent) stay
        // attributable to this thread until ensureThreadChat re-binds on the
        // next sendTurn.
        const persistentChats = yield* Ref.get(chatIdToThread);
        yield* Ref.update(chatToThread, (transient) => {
          const next = new Map(transient);
          for (const [chatId, mappedThread] of persistentChats) {
            if (mappedThread === threadId) next.set(chatId, threadId);
          }
          return next;
        });
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
          emittedTranscriptRef: { current: new Map() },
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

    const markSessionRunning = (context: EngineSessionContext, turnId: TurnId): void => {
      const now = new Date().toISOString();
      context.session = {
        ...context.session,
        status: "running" as const,
        activeTurnId: turnId as unknown as string,
        updatedAt: now,
      };
    };

    const markSessionIdle = (
      context: EngineSessionContext,
      status: ProviderSession["status"] = "ready",
    ): void => {
      const now = new Date().toISOString();
      context.session = {
        ...context.session,
        status,
        activeTurnId: null,
        updatedAt: now,
      };
    };

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
      listRuns: (input) =>
        goalRequest(ThreadId.makeUnsafe(randomUUID()), "goal:list-runs", {
          ...goalIdOf(input),
          limit: input.limit ?? 50,
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
          // The engine contract takes an optional number; null means "no filter".
          ...(input.appId !== undefined && input.appId !== null ? { appId: input.appId } : {}),
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
          markSessionRunning(context, turnId);
          // Keep per-message emission state across turns so the engine's
          // full-transcript `messages` payloads on the next turn don't
          // replay prior assistant messages as new deltas. Only the generic
          // streaming key (used when no messageId is supplied) is reset.
          context.emittedTranscriptRef.current.delete("streaming");
          yield* publishEvent(
            makeEvent<ProviderRuntimeEvent>(input.threadId, {
              type: "turn.started",
              turnId,
              payload: {
                ...(input.modelSelection?.model ? { model: input.modelSelection.model } : {}),
              },
            }),
          );

          // The engine accepts plan and local-agent (agent). Build/ask were removed
          // and route through local-agent. The send input's `mode` is the single
          // source of truth (contracts decode it with a "local-agent" default).
          // If it is still missing here the caller bypassed schema decoding —
          // degrade visibly instead of guessing.
          let requestedChatMode: "plan" | "local-agent" = input.mode ?? "local-agent";
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
          // Push the composer's picked model into the engine first: the
          // engine's dyad pipeline resolves its LLM from its own
          // `selectedModel` setting, so without this every agent turn would
          // run on whatever model was last written instead of the user's
          // pick. Best-effort — a settings hiccup must not kill the turn.
          const selectedEngineModel =
            input.modelSelection === undefined
              ? null
              : (() => {
                  const engineProviderId =
                    ENGINE_PROVIDER_BY_CAIDE_KIND.get(input.modelSelection.provider) ??
                    input.modelSelection.provider;
                  const modelId = input.modelSelection.model.trim();
                  return modelId !== "" ? { name: modelId, provider: engineProviderId } : null;
                })();
          if (selectedEngineModel !== null) {
            const shared = yield* ensureSharedEngine(input.threadId);
            yield* Effect.tryPromise({
              try: () =>
                shared.client.dyadInvoke(
                  "set-user-settings",
                  { selectedModel: selectedEngineModel },
                  10_000,
                ),
              catch: (cause) =>
                processError(
                  input.threadId,
                  `engine set-user-settings (selectedModel) failed`,
                  cause,
                ),
            }).pipe(
              Effect.catch((error) =>
                Effect.logWarning("engine selectedModel bridge failed; using engine default", {
                  threadId: input.threadId,
                  error: String(error),
                }),
              ),
              Effect.asVoid,
            );
          }

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
          const shouldSettle =
            pending === null
              ? context.currentTurnIdRef.current !== null
              : yield* claimChatSettlement(pending.chatId);
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
          if (!shouldSettle) return;
          const turnId = context.currentTurnIdRef.current;
          yield* publishEvent(
            makeEvent<ProviderRuntimeEvent>(threadId, {
              type: "turn.aborted",
              ...(turnId !== null ? { turnId } : {}),
              payload: { reason: "interrupted by user" },
            }),
          );
          context.currentTurnIdRef.current = null;
          markSessionIdle(context, "interrupted");
        }),

      respondToRequest: (threadId, requestId, decision, blueprintEdits) =>
        Effect.gen(function* () {
          const context = yield* getSession(threadId);
          const key = pendingInteractionKey(threadId, String(requestId));
          const entry = yield* Ref.get(pendingRequests).pipe(
            Effect.map((map) => map.get(key) ?? null),
          );
          if (entry === null) return;
          const chatId =
            context.chatMapping?.chatId ?? (yield* resolveThreadChatId(threadId));
          if (!ownsPendingRequest(entry, threadId, chatId)) return;
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
          } else if (entry.kind === "app-blueprint") {
            if (entry.chatId !== undefined && decision !== "decline") {
              const blueprintChatId = entry.chatId;
              // Apply any user edits before approving so the engine builds from
              // the edited blueprint, not the original draft.
              if (blueprintEdits !== undefined) {
                for (const [field, value] of Object.entries(blueprintEdits)) {
                  if (typeof value !== "string" || value === "") continue;
                  yield* Effect.tryPromise({
                    try: () =>
                      client.dyadInvoke("app-blueprint:edit-field", {
                        chatId: blueprintChatId,
                        field,
                        value,
                      }),
                    catch: (cause) =>
                      processError(threadId, "engine app-blueprint edit-field failed", cause),
                  }).pipe(Effect.ignore);
                }
              }
              yield* Effect.tryPromise({
                try: () =>
                  client.dyadInvoke("app-blueprint:approve", { chatId: blueprintChatId }),
                catch: (cause) => processError(threadId, "engine app-blueprint approve failed", cause),
              }).pipe(Effect.ignore);
            }
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
            next.delete(key);
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
          const context = yield* getSession(threadId);
          const key = pendingInteractionKey(threadId, String(requestId));
          const entry = yield* Ref.get(pendingRequests).pipe(
            Effect.map((map) => map.get(key) ?? null),
          );
          if (entry === null) return;
          const chatId =
            context.chatMapping?.chatId ?? (yield* resolveThreadChatId(threadId));
          if (!ownsPendingRequest(entry, threadId, chatId)) return;
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
            next.delete(key);
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
          yield* Ref.update(buildIdToThread, (map) => {
            const next = new Map(map);
            next.set(result.data.buildId, input.threadId);
            return next;
          });
          return { buildId: result.data.buildId };
        }),

      previewBuildState: (input) =>
        Effect.gen(function* () {
          const context = yield* getSession(input.threadId);
          const buildOwner = (yield* Ref.get(buildIdToThread)).get(input.buildId);
          if (buildOwner !== input.threadId) {
            return yield* Effect.fail(
              processError(
                input.threadId,
                `engine build ${input.buildId} does not belong to this thread`,
                null,
              ),
            );
          }
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
            devices: Array<{
              id: string;
              name: string;
              isEmulator: boolean;
              platform?: "android" | "web" | "ios";
            }>;
          };
          return {
            devices: Array.isArray(parsed?.devices)
              ? parsed.devices.map((device) => ({
                  id: device.id,
                  name: device.name,
                  isEmulator: Boolean(device.isEmulator),
                  ...(device.platform === "android" ||
                  device.platform === "web" ||
                  device.platform === "ios"
                    ? { platform: device.platform }
                    : {}),
                }))
              : [],
          };
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
          return parsed.status;
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

      createApp: ({ name, framework = "blank" }) =>
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
                  initialChatMode: "local-agent",
                  framework,
                  templateId: framework === "flutter" ? "flutter" : undefined,
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

      listModels: (input?: ProviderListModelsInput) =>
        Effect.gen(function* () {
          const provider = (input?.provider ?? "engine") as ProviderKind;
          const builtInModels = (MODEL_OPTIONS_BY_PROVIDER[provider] ?? []).map((opt) => ({
            slug: opt.slug,
            name: opt.name,
            description: opt.slug,
          }));
          if (provider === "engine") {
            return { models: builtInModels, source: "static", cached: false };
          }
          const secret = yield* secretStore
            .get(`provider-${provider}-api-key`)
            .pipe(Effect.orElseSucceed(() => null));
          const textDecoder = new TextDecoder();
          const apiKey = secret && secret.byteLength > 0 ? textDecoder.decode(secret).trim() : "";
          if (!apiKey) {
            return { models: builtInModels, source: "static", cached: false };
          }
          const settings = yield* serverSettings.getSettings.pipe(Effect.orElseSucceed(() => null));
          const configuredBaseUrl = (settings?.providers[provider]?.baseUrl ?? "").trim();
          const defaultBaseUrlMap: Partial<Record<ApiProviderKind, string>> = {
            openai: "https://api.openai.com/v1",
            anthropic: "https://api.anthropic.com/v1",
            google: "https://generativelanguage.googleapis.com/v1beta",
            openrouter: "https://openrouter.ai/api/v1",
            ollama: "http://127.0.0.1:11434/v1",
            deepseek: "https://api.deepseek.com/v1",
            groq: "https://api.groq.com/openai/v1",
            mistral: "https://api.mistral.ai/v1",
            together: "https://api.together.xyz/v1",
            cohere: "https://api.cohere.com/compatibility/v1",
            xai: "https://api.x.ai/v1",
            fireworks: "https://api.fireworks.ai/inference/v1",
            opencodeZen: "https://opencode.ai/zen/v1",
            opencodeGo: "https://opencode.ai/zen/go/v1",
          };
          const baseUrl =
            configuredBaseUrl.length > 0
              ? configuredBaseUrl
              : defaultBaseUrlMap[provider as ApiProviderKind];
          if (!baseUrl) {
            return { models: builtInModels, source: "static", cached: false };
          }
          return yield* Effect.promise(() =>
            listLiveApiProviderModels({
              provider: provider as ApiProviderKind,
              baseUrl,
              apiKey,
              builtInModels,
            }),
          );
        }),

      streamEvents: Stream.fromPubSub(runtimeEventQueue),
    };

    return adapter;
  });

export const EngineAdapterLive = Layer.effect(EngineAdapter, makeEngineAdapter());

export const EngineAdapterLiveWithOptions = (options: EngineAdapterLiveOptions) =>
  Layer.effect(EngineAdapter, makeEngineAdapter(options));
