import type { ApiProviderKind, ProviderKind } from "@caide/contracts";
import { it, assert, vi } from "@effect/vitest";
import { assertFailure } from "@effect/vitest/utils";

import { Effect, Layer, Stream } from "effect";

import { EngineAdapter, EngineAdapterShape } from "../Services/EngineAdapter.ts";
import { OpenAiAdapter, OpenAiAdapterShape } from "../Services/OpenAiAdapter.ts";
import { AnthropicAdapter, AnthropicAdapterShape } from "../Services/AnthropicAdapter.ts";
import { GoogleAdapter, GoogleAdapterShape } from "../Services/GoogleAdapter.ts";
import { OpenRouterAdapter, OpenRouterAdapterShape } from "../Services/OpenRouterAdapter.ts";
import { OllamaAdapter, OllamaAdapterShape } from "../Services/OllamaAdapter.ts";
import { DeepseekAdapter, DeepseekAdapterShape } from "../Services/DeepseekAdapter.ts";
import { GroqAdapter, GroqAdapterShape } from "../Services/GroqAdapter.ts";
import { MistralAdapter, MistralAdapterShape } from "../Services/MistralAdapter.ts";
import { TogetherAdapter, TogetherAdapterShape } from "../Services/TogetherAdapter.ts";
import { CohereAdapter, CohereAdapterShape } from "../Services/CohereAdapter.ts";
import { XaiAdapter, XaiAdapterShape } from "../Services/XaiAdapter.ts";
import { FireworksAdapter, FireworksAdapterShape } from "../Services/FireworksAdapter.ts";
import { OpenCodeZenAdapter, OpenCodeZenAdapterShape } from "../Services/OpenCodeZenAdapter.ts";
import { OpenCodeGoAdapter, OpenCodeGoAdapterShape } from "../Services/OpenCodeGoAdapter.ts";
import { ProviderAdapterRegistry } from "../Services/ProviderAdapterRegistry.ts";
import { ProviderAdapterRegistryLive } from "./ProviderAdapterRegistry.ts";
import { ProviderUnsupportedError } from "../Errors.ts";
import * as NodeServices from "@effect/platform-node/NodeServices";

const fakeEngineAdapter: EngineAdapterShape = {
  provider: "engine",
  capabilities: { sessionModelSwitch: "in-session" },
  startSession: vi.fn(),
  sendTurn: vi.fn(),
  interruptTurn: vi.fn(),
  respondToRequest: vi.fn(),
  respondToUserInput: vi.fn(),
  stopSession: vi.fn(),
  listSessions: vi.fn(),
  hasSession: vi.fn(),
  readThread: vi.fn(),
  rollbackThread: vi.fn(),
  stopAll: vi.fn(),
  streamEvents: Stream.empty,
  startPreviewSession: vi.fn(),
  previewStart: vi.fn(),
  previewStop: vi.fn(),
  previewReload: vi.fn(),
  previewState: vi.fn(),
  previewAnalyze: vi.fn(),
  previewTest: vi.fn(),
  previewBuildStart: vi.fn(),
  previewBuildState: vi.fn(),
  previewScreenshot: vi.fn(),
  goals: {
    create: vi.fn(),
    get: vi.fn(),
    getActive: vi.fn(),
    list: vi.fn(),
    listActivity: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(),
    edit: vi.fn(),
    steer: vi.fn(),
    retry: vi.fn(),
    verify: vi.fn(),
    resolveAppId: vi.fn(),
  },
  streamGoalDomainEvents: Stream.empty,
};

const makeFakeApiAdapter = <P extends ApiProviderKind>(
  provider: P,
) => ({
  provider,
  capabilities: { sessionModelSwitch: "in-session" as const },
  startSession: vi.fn(),
  sendTurn: vi.fn(),
  interruptTurn: vi.fn(),
  respondToRequest: vi.fn(),
  respondToUserInput: vi.fn(),
  stopSession: vi.fn(),
  listSessions: vi.fn(),
  hasSession: vi.fn(),
  readThread: vi.fn(),
  rollbackThread: vi.fn(),
  stopAll: vi.fn(),
  streamEvents: Stream.empty,
});

const fakeOpenAiAdapter: OpenAiAdapterShape = makeFakeApiAdapter("openai");
const fakeAnthropicAdapter: AnthropicAdapterShape = makeFakeApiAdapter("anthropic");
const fakeGoogleAdapter: GoogleAdapterShape = makeFakeApiAdapter("google");
const fakeOpenRouterAdapter: OpenRouterAdapterShape = makeFakeApiAdapter("openrouter");
const fakeOllamaAdapter: OllamaAdapterShape = makeFakeApiAdapter("ollama");
const fakeDeepseekAdapter: DeepseekAdapterShape = makeFakeApiAdapter("deepseek");
const fakeGroqAdapter: GroqAdapterShape = makeFakeApiAdapter("groq");
const fakeMistralAdapter: MistralAdapterShape = makeFakeApiAdapter("mistral");
const fakeTogetherAdapter: TogetherAdapterShape = makeFakeApiAdapter("together");
const fakeCohereAdapter: CohereAdapterShape = makeFakeApiAdapter("cohere");
const fakeXaiAdapter: XaiAdapterShape = makeFakeApiAdapter("xai");
const fakeFireworksAdapter: FireworksAdapterShape = makeFakeApiAdapter("fireworks");
const fakeOpenCodeZenAdapter: OpenCodeZenAdapterShape = makeFakeApiAdapter("opencodeZen");
const fakeOpenCodeGoAdapter: OpenCodeGoAdapterShape = makeFakeApiAdapter("opencodeGo");

const layer = it.layer(
  Layer.mergeAll(
    Layer.provide(
      ProviderAdapterRegistryLive,
      Layer.mergeAll(
        Layer.succeed(EngineAdapter, fakeEngineAdapter),
        Layer.succeed(OpenAiAdapter, fakeOpenAiAdapter),
        Layer.succeed(AnthropicAdapter, fakeAnthropicAdapter),
        Layer.succeed(GoogleAdapter, fakeGoogleAdapter),
        Layer.succeed(OpenRouterAdapter, fakeOpenRouterAdapter),
        Layer.succeed(OllamaAdapter, fakeOllamaAdapter),
        Layer.succeed(DeepseekAdapter, fakeDeepseekAdapter),
        Layer.succeed(GroqAdapter, fakeGroqAdapter),
        Layer.succeed(MistralAdapter, fakeMistralAdapter),
        Layer.succeed(TogetherAdapter, fakeTogetherAdapter),
        Layer.succeed(CohereAdapter, fakeCohereAdapter),
        Layer.succeed(XaiAdapter, fakeXaiAdapter),
        Layer.succeed(FireworksAdapter, fakeFireworksAdapter),
        Layer.succeed(OpenCodeZenAdapter, fakeOpenCodeZenAdapter),
        Layer.succeed(OpenCodeGoAdapter, fakeOpenCodeGoAdapter),
      ),
    ),
    NodeServices.layer,
  ),
);

layer("ProviderAdapterRegistryLive", (it) => {
  it.effect("resolves a registered provider adapter", () =>
    Effect.gen(function* () {
      const registry = yield* ProviderAdapterRegistry;
      const engine = yield* registry.getByProvider("engine");
      const openai = yield* registry.getByProvider("openai");
      const anthropic = yield* registry.getByProvider("anthropic");
      const google = yield* registry.getByProvider("google");
      const openrouter = yield* registry.getByProvider("openrouter");
      const ollama = yield* registry.getByProvider("ollama");
      const deepseek = yield* registry.getByProvider("deepseek");
      const groq = yield* registry.getByProvider("groq");
      const mistral = yield* registry.getByProvider("mistral");
      const together = yield* registry.getByProvider("together");
      const cohere = yield* registry.getByProvider("cohere");
      const xai = yield* registry.getByProvider("xai");
      const fireworks = yield* registry.getByProvider("fireworks");
      const opencodeZen = yield* registry.getByProvider("opencodeZen");
      const opencodeGo = yield* registry.getByProvider("opencodeGo");
      assert.equal(engine, fakeEngineAdapter);
      assert.equal(openai, fakeOpenAiAdapter);
      assert.equal(anthropic, fakeAnthropicAdapter);
      assert.equal(google, fakeGoogleAdapter);
      assert.equal(openrouter, fakeOpenRouterAdapter);
      assert.equal(ollama, fakeOllamaAdapter);
      assert.equal(deepseek, fakeDeepseekAdapter);
      assert.equal(groq, fakeGroqAdapter);
      assert.equal(mistral, fakeMistralAdapter);
      assert.equal(together, fakeTogetherAdapter);
      assert.equal(cohere, fakeCohereAdapter);
      assert.equal(xai, fakeXaiAdapter);
      assert.equal(fireworks, fakeFireworksAdapter);
      assert.equal(opencodeZen, fakeOpenCodeZenAdapter);
      assert.equal(opencodeGo, fakeOpenCodeGoAdapter);

      const providers = yield* registry.listProviders();
      assert.deepEqual(providers, [
        "engine",
        "openai",
        "anthropic",
        "google",
        "openrouter",
        "ollama",
        "deepseek",
        "groq",
        "mistral",
        "together",
        "cohere",
        "xai",
        "fireworks",
        "opencodeZen",
        "opencodeGo",
      ]);
    }),
  );

  it.effect("fails with ProviderUnsupportedError for unknown providers", () =>
    Effect.gen(function* () {
      const registry = yield* ProviderAdapterRegistry;
      const adapter = yield* registry.getByProvider("unknown" as ProviderKind).pipe(Effect.result);
      assertFailure(adapter, new ProviderUnsupportedError({ provider: "unknown" }));
    }),
  );
});
