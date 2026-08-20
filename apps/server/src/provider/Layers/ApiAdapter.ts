/**
 * ApiAdapterLive - API-key provider adapter layer (OpenAI, Anthropic, Google, OpenRouter, Ollama).
 *
 * Implements the ProviderAdapter contract for direct HTTP-based LLM APIs, providing
 * streaming token events, session lifecycle management, and model catalog discovery.
 *
 * @module ApiAdapterLive
 */
import { randomUUID } from "node:crypto";

import {
  DEFAULT_MODEL_BY_PROVIDER,
  EventId,
  MODEL_OPTIONS_BY_PROVIDER,
  type ApiProviderKind,
  type ProviderKind,
  type ProviderListModelsResult,
  type ProviderRuntimeEvent,
  type ProviderSession,
  type ProviderTurnStartResult,
  ThreadId,
  TurnId,
} from "@caide/contracts";
import { Effect, Layer, PubSub, Ref, Stream } from "effect";

import {
  ProviderAdapterProcessError,
  ProviderAdapterSessionNotFoundError,
  ProviderAdapterValidationError,
  type ProviderAdapterError,
} from "../Errors.ts";
import { OpenAiAdapter, type OpenAiAdapterShape } from "../Services/OpenAiAdapter.ts";
import { AnthropicAdapter, type AnthropicAdapterShape } from "../Services/AnthropicAdapter.ts";
import { GoogleAdapter, type GoogleAdapterShape } from "../Services/GoogleAdapter.ts";
import { OpenRouterAdapter, type OpenRouterAdapterShape } from "../Services/OpenRouterAdapter.ts";
import { OllamaAdapter, type OllamaAdapterShape } from "../Services/OllamaAdapter.ts";
import { DeepseekAdapter, type DeepseekAdapterShape } from "../Services/DeepseekAdapter.ts";
import { GroqAdapter, type GroqAdapterShape } from "../Services/GroqAdapter.ts";
import { MistralAdapter, type MistralAdapterShape } from "../Services/MistralAdapter.ts";
import { TogetherAdapter, type TogetherAdapterShape } from "../Services/TogetherAdapter.ts";
import { CohereAdapter, type CohereAdapterShape } from "../Services/CohereAdapter.ts";
import { XaiAdapter, type XaiAdapterShape } from "../Services/XaiAdapter.ts";
import { FireworksAdapter, type FireworksAdapterShape } from "../Services/FireworksAdapter.ts";
import {
  OpenCodeZenAdapter,
  type OpenCodeZenAdapterShape,
} from "../Services/OpenCodeZenAdapter.ts";
import { OpenCodeGoAdapter, type OpenCodeGoAdapterShape } from "../Services/OpenCodeGoAdapter.ts";
import { type ProviderAdapterShape } from "../Services/ProviderAdapter.ts";
import { ProviderCredentials, resolveProviderApiKey } from "../../providerCredentials.ts";

interface ApiSessionContext {
  readonly threadId: ThreadId;
  readonly session: ProviderSession;
  readonly provider: ApiProviderKind;
  readonly currentModel: string;
  abortController: AbortController | null;
}

const DEFAULT_BASE_URL_BY_PROVIDER: Record<ApiProviderKind, string> = {
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
  opencodeGo: "https://opencode.ai/go/v1",
};

async function streamOpenAiCompatible(
  url: string,
  headers: Record<string, string>,
  model: string,
  prompt: string,
  signal: AbortSignal,
  onDelta: (text: string) => void,
  systemPrompt?: string,
): Promise<void> {
  const endpoint = url.replace(/\/+$/, "") + "/chat/completions";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      model,
      messages: [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        { role: "user", content: prompt },
      ],
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown network error");
    throw new Error(`HTTP ${response.status} from ${endpoint}: ${errorText.slice(0, 300)}`);
  }

  if (!response.body) {
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;
      const dataStr = trimmed.slice(5).trim();
      if (dataStr === "[DONE]") return;
      try {
        const parsed = JSON.parse(dataStr);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          onDelta(delta);
        }
      } catch {
        // Skip malformed chunk lines
      }
    }
  }
}

async function streamAnthropic(
  url: string,
  apiKey: string,
  model: string,
  prompt: string,
  signal: AbortSignal,
  onDelta: (text: string) => void,
  systemPrompt?: string,
): Promise<void> {
  const endpoint = url.replace(/\/+$/, "") + "/messages";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: [{ role: "user", content: prompt }],
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown network error");
    throw new Error(`HTTP ${response.status} from ${endpoint}: ${errorText.slice(0, 300)}`);
  }

  if (!response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const dataStr = trimmed.slice(5).trim();
      if (dataStr === "[DONE]") return;
      try {
        const parsed = JSON.parse(dataStr);
        if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
          const text = parsed.delta.text;
          if (typeof text === "string" && text.length > 0) {
            onDelta(text);
          }
        }
      } catch {
        // Skip malformed JSON lines
      }
    }
  }
}

async function streamGoogle(
  url: string,
  apiKey: string,
  model: string,
  prompt: string,
  signal: AbortSignal,
  onDelta: (text: string) => void,
  systemPrompt?: string,
): Promise<void> {
  const cleanModel = model.replace(/^models\//, "");
  const endpoint = `${url.replace(/\/+$/, "")}/models/${cleanModel}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown network error");
    throw new Error(`HTTP ${response.status} from Gemini: ${errorText.slice(0, 300)}`);
  }

  if (!response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const dataStr = trimmed.slice(5).trim();
      try {
        const parsed = JSON.parse(dataStr);
        const parts = parsed.candidates?.[0]?.content?.parts;
        if (Array.isArray(parts)) {
          for (const part of parts) {
            if (typeof part.text === "string" && part.text.length > 0) {
              onDelta(part.text);
            }
          }
        }
      } catch {
        // Skip malformed chunk
      }
    }
  }
}

export const makeApiAdapter = (provider: ApiProviderKind) =>
  Effect.gen(function* () {
    const credentials = yield* ProviderCredentials;
    const runtimeEventQueue = yield* PubSub.unbounded<ProviderRuntimeEvent>();
    const sessions = yield* Ref.make<ReadonlyMap<ThreadId, ApiSessionContext>>(new Map());

    const makeEvent = <T extends { type: string; payload: unknown }>(
      threadId: ThreadId,
      event: Omit<T, "eventId" | "provider" | "threadId" | "createdAt"> & {
        eventId?: string;
        createdAt?: string;
      },
    ): T =>
      ({
        eventId: EventId.makeUnsafe(randomUUID()),
        provider: provider as ProviderKind,
        threadId,
        createdAt: new Date().toISOString(),
        ...event,
      }) as unknown as T;

    const getSession = (
      threadId: ThreadId,
    ): Effect.Effect<ApiSessionContext, ProviderAdapterSessionNotFoundError> =>
      Ref.get(sessions).pipe(
        Effect.flatMap((map) => {
          const context = map.get(threadId);
          if (!context) {
            return Effect.fail(new ProviderAdapterSessionNotFoundError({ provider, threadId }));
          }
          return Effect.succeed(context);
        }),
      );

    const listModels = (
      _input?: unknown,
    ): Effect.Effect<ProviderListModelsResult, ProviderAdapterError> =>
      Effect.sync(() => {
        const options = MODEL_OPTIONS_BY_PROVIDER[provider] ?? [];
        if (options.length > 0) {
          return {
            models: options.map((opt) => ({
              slug: opt.slug,
              name: opt.name,
              description: opt.slug,
            })),
          };
        }
        // Standard providers advertise a static picker catalog. Providers
        // without a static catalog (e.g. Ollama's local models) fall back to a
        // sensible single default rather than a shared generic list.
        const defaultModel = DEFAULT_MODEL_BY_PROVIDER[provider] ?? "default";
        const fallbacks =
          provider === "ollama" ? ["llama3.3", "qwen2.5-coder", "deepseek-r1"] : [defaultModel];
        return {
          models: fallbacks.map((slug) => ({
            slug,
            name: slug,
            description: `${provider} model: ${slug}`,
          })),
        };
      });

    const adapter: ProviderAdapterShape<ProviderAdapterError> = {
      provider,
      capabilities: {
        sessionModelSwitch: "in-session",
        supportsSkillMentions: false,
        supportsSkillDiscovery: false,
        supportsNativeSlashCommandDiscovery: false,
        supportsPluginMentions: false,
        supportsPluginDiscovery: false,
        supportsRuntimeModelList: true,
        supportsTurnSteering: false,
      },

      streamEvents: Stream.fromPubSub(runtimeEventQueue),

      startSession: (input) =>
        Effect.gen(function* () {
          if (input.provider !== undefined && input.provider !== provider) {
            return yield* Effect.fail(
              new ProviderAdapterValidationError({
                provider,
                operation: "startSession",
                issue: `expected provider "${provider}", got ${input.provider}`,
              }),
            );
          }
          const defaultModel = DEFAULT_MODEL_BY_PROVIDER[provider] ?? "default";
          const now = new Date().toISOString();
          const session: ProviderSession = {
            provider,
            status: "ready",
            runtimeMode: input.runtimeMode ?? "full-access",
            ...(input.cwd ? { cwd: input.cwd } : {}),
            threadId: input.threadId,
            createdAt: now,
            updatedAt: now,
          };
          const context: ApiSessionContext = {
            threadId: input.threadId,
            session,
            provider,
            currentModel: defaultModel,
            abortController: null,
          };
          yield* Ref.update(sessions, (map) => new Map(map).set(input.threadId, context));

          yield* PubSub.publish(
            runtimeEventQueue,
            makeEvent<ProviderRuntimeEvent>(input.threadId, {
              type: "session.started",
              payload: {
                message: `${provider} session initialized`,
              },
            }),
          );
          yield* PubSub.publish(
            runtimeEventQueue,
            makeEvent<ProviderRuntimeEvent>(input.threadId, {
              type: "thread.started",
              payload: {},
            }),
          );

          return session;
        }),

      sendTurn: (input) =>
        Effect.gen(function* () {
          const context = yield* getSession(input.threadId);
          const turnId = TurnId.makeUnsafe(randomUUID());
          const model = input.modelSelection?.model ?? context.currentModel;
          const abortController = new AbortController();
          context.abortController = abortController;

          yield* PubSub.publish(
            runtimeEventQueue,
            makeEvent<ProviderRuntimeEvent>(input.threadId, {
              type: "turn.started",
              turnId,
              payload: { model },
            }),
          );

          const apiKey =
            (yield* resolveProviderApiKey(provider).pipe(
              Effect.provideService(ProviderCredentials, credentials),
            )) ?? process.env[`${provider.toUpperCase()}_API_KEY`];
          const userPrompt = input.input ?? "";

          yield* PubSub.publish(
            runtimeEventQueue,
            makeEvent<ProviderRuntimeEvent>(input.threadId, {
              type: "item.started",
              turnId,
              payload: { itemType: "assistant_message" },
            }),
          );

          if (!apiKey && provider !== "ollama") {
            const warningMessage = `No API key configured for ${provider}. Please configure your API key in Settings > Providers to enable live LLM generation.`;
            yield* PubSub.publish(
              runtimeEventQueue,
              makeEvent<ProviderRuntimeEvent>(input.threadId, {
                type: "content.delta",
                turnId,
                payload: { delta: warningMessage },
              }),
            );
          } else {
            const baseUrl = DEFAULT_BASE_URL_BY_PROVIDER[provider];
            const onDelta = (deltaText: string) => {
              PubSub.publish(
                runtimeEventQueue,
                makeEvent<ProviderRuntimeEvent>(input.threadId, {
                  type: "content.delta",
                  turnId,
                  payload: { delta: deltaText },
                }),
              ).pipe(Effect.runSync);
            };

            try {
              if (provider === "anthropic") {
                yield* Effect.promise(() =>
                  streamAnthropic(
                    baseUrl,
                    apiKey ?? "",
                    model,
                    userPrompt,
                    abortController.signal,
                    onDelta,
                    input.systemPrompt,
                  ),
                );
              } else if (provider === "google") {
                yield* Effect.promise(() =>
                  streamGoogle(
                    baseUrl,
                    apiKey ?? "",
                    model,
                    userPrompt,
                    abortController.signal,
                    onDelta,
                    input.systemPrompt,
                  ),
                );
              } else if (provider === "openrouter") {
                yield* Effect.promise(() =>
                  streamOpenAiCompatible(
                    baseUrl,
                    {
                      Authorization: `Bearer ${apiKey ?? ""}`,
                      "HTTP-Referer": "https://caide.dev",
                      "X-Title": "Caide",
                    },
                    model,
                    userPrompt,
                    abortController.signal,
                    onDelta,
                    input.systemPrompt,
                  ),
                );
              } else if (provider === "ollama") {
                yield* Effect.promise(() =>
                  streamOpenAiCompatible(
                    baseUrl,
                    apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
                    model,
                    userPrompt,
                    abortController.signal,
                    onDelta,
                    input.systemPrompt,
                  ),
                );
              } else {
                // OpenAI
                yield* Effect.promise(() =>
                  streamOpenAiCompatible(
                    baseUrl,
                    { Authorization: `Bearer ${apiKey ?? ""}` },
                    model,
                    userPrompt,
                    abortController.signal,
                    onDelta,
                    input.systemPrompt,
                  ),
                );
              }
            } catch (err: unknown) {
              const errorMessage = err instanceof Error ? err.message : String(err);
              if (abortController.signal.aborted) {
                yield* PubSub.publish(
                  runtimeEventQueue,
                  makeEvent<ProviderRuntimeEvent>(input.threadId, {
                    type: "turn.aborted",
                    turnId,
                    payload: { state: "interrupted" },
                  }),
                );
              } else {
                yield* PubSub.publish(
                  runtimeEventQueue,
                  makeEvent<ProviderRuntimeEvent>(input.threadId, {
                    type: "content.delta",
                    turnId,
                    payload: { delta: `\n\n[API Error]: ${errorMessage}` },
                  }),
                );
              }
            }
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

          context.abortController = null;
          const result: ProviderTurnStartResult = { threadId: input.threadId, turnId };
          return result;
        }),

      interruptTurn: (threadId) =>
        Effect.gen(function* () {
          const context = yield* getSession(threadId);
          if (context.abortController) {
            context.abortController.abort();
            context.abortController = null;
          }
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
          if (context.abortController) {
            context.abortController.abort();
          }
          yield* Ref.update(sessions, (map) => {
            const next = new Map(map);
            next.delete(threadId);
            return next;
          });
          yield* PubSub.publish(
            runtimeEventQueue,
            makeEvent<ProviderRuntimeEvent>(threadId, {
              type: "thread.state.changed",
              payload: { status: "closed" },
            }),
          );
          yield* PubSub.publish(
            runtimeEventQueue,
            makeEvent<ProviderRuntimeEvent>(threadId, {
              type: "session.exited",
              payload: {},
            }),
          );
        }),

      stopAll: () =>
        Effect.gen(function* () {
          const map = yield* Ref.get(sessions);
          for (const [threadId, ctx] of map.entries()) {
            if (ctx.abortController) {
              ctx.abortController.abort();
            }
          }
          yield* Ref.set(sessions, new Map());
        }),

      hasSession: (threadId) => Ref.get(sessions).pipe(Effect.map((map) => map.has(threadId))),

      listSessions: () =>
        Ref.get(sessions).pipe(
          Effect.map((map) => Array.from(map.values()).map((ctx) => ctx.session)),
        ),

      readThread: (threadId) =>
        Effect.gen(function* () {
          const context = yield* getSession(threadId);
          return {
            threadId,
            provider,
            runtimeMode: context.session.runtimeMode,
            model: context.currentModel,
            turns: [],
          };
        }),

      rollbackThread: (threadId) =>
        Effect.gen(function* () {
          const context = yield* getSession(threadId);
          return {
            threadId,
            provider,
            runtimeMode: context.session.runtimeMode,
            model: context.currentModel,
            turns: [],
          };
        }),

      listModels,
    };

    return adapter;
  });

export const OpenAiAdapterLive = Layer.effect(
  OpenAiAdapter,
  makeApiAdapter("openai") as unknown as Effect.Effect<
    OpenAiAdapterShape,
    never,
    ProviderCredentials
  >,
);

export const AnthropicAdapterLive = Layer.effect(
  AnthropicAdapter,
  makeApiAdapter("anthropic") as unknown as Effect.Effect<
    AnthropicAdapterShape,
    never,
    ProviderCredentials
  >,
);

export const GoogleAdapterLive = Layer.effect(
  GoogleAdapter,
  makeApiAdapter("google") as unknown as Effect.Effect<
    GoogleAdapterShape,
    never,
    ProviderCredentials
  >,
);

export const OpenRouterAdapterLive = Layer.effect(
  OpenRouterAdapter,
  makeApiAdapter("openrouter") as unknown as Effect.Effect<
    OpenRouterAdapterShape,
    never,
    ProviderCredentials
  >,
);

export const OllamaAdapterLive = Layer.effect(
  OllamaAdapter,
  makeApiAdapter("ollama") as unknown as Effect.Effect<
    OllamaAdapterShape,
    never,
    ProviderCredentials
  >,
);

export const DeepseekAdapterLive = Layer.effect(
  DeepseekAdapter,
  makeApiAdapter("deepseek") as unknown as Effect.Effect<
    DeepseekAdapterShape,
    never,
    ProviderCredentials
  >,
);

export const GroqAdapterLive = Layer.effect(
  GroqAdapter,
  makeApiAdapter("groq") as unknown as Effect.Effect<GroqAdapterShape, never, ProviderCredentials>,
);

export const MistralAdapterLive = Layer.effect(
  MistralAdapter,
  makeApiAdapter("mistral") as unknown as Effect.Effect<
    MistralAdapterShape,
    never,
    ProviderCredentials
  >,
);

export const TogetherAdapterLive = Layer.effect(
  TogetherAdapter,
  makeApiAdapter("together") as unknown as Effect.Effect<
    TogetherAdapterShape,
    never,
    ProviderCredentials
  >,
);

export const CohereAdapterLive = Layer.effect(
  CohereAdapter,
  makeApiAdapter("cohere") as unknown as Effect.Effect<
    CohereAdapterShape,
    never,
    ProviderCredentials
  >,
);

export const XaiAdapterLive = Layer.effect(
  XaiAdapter,
  makeApiAdapter("xai") as unknown as Effect.Effect<XaiAdapterShape, never, ProviderCredentials>,
);

export const FireworksAdapterLive = Layer.effect(
  FireworksAdapter,
  makeApiAdapter("fireworks") as unknown as Effect.Effect<
    FireworksAdapterShape,
    never,
    ProviderCredentials
  >,
);

export const OpenCodeZenAdapterLive = Layer.effect(
  OpenCodeZenAdapter,
  makeApiAdapter("opencodeZen") as unknown as Effect.Effect<
    OpenCodeZenAdapterShape,
    never,
    ProviderCredentials
  >,
);

export const OpenCodeGoAdapterLive = Layer.effect(
  OpenCodeGoAdapter,
  makeApiAdapter("opencodeGo") as unknown as Effect.Effect<
    OpenCodeGoAdapterShape,
    never,
    ProviderCredentials
  >,
);
