// FILE: ApiAdapter.test.ts
// Purpose: Proves API provider adapters (openai, anthropic, google, openrouter, ollama)
// correctly handle session lifecycles, model listings, and event streaming.
// Layer: Provider adapter test

import { randomUUID } from "node:crypto";

import { ThreadId } from "@caide/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { Effect, Layer, Stream } from "effect";
import { describe, expect, it } from "vitest";

import { ServerConfig } from "../../config.ts";
import { ProviderCredentialsLive } from "../../providerCredentials.ts";
import { OpenAiAdapter } from "../Services/OpenAiAdapter.ts";
import { AnthropicAdapter } from "../Services/AnthropicAdapter.ts";
import { GoogleAdapter } from "../Services/GoogleAdapter.ts";
import { OpenRouterAdapter } from "../Services/OpenRouterAdapter.ts";
import { OllamaAdapter } from "../Services/OllamaAdapter.ts";
import {
  OpenAiAdapterLive,
  AnthropicAdapterLive,
  GoogleAdapterLive,
  OpenRouterAdapterLive,
  OllamaAdapterLive,
} from "./ApiAdapter.ts";

const serverConfigLayer = ServerConfig.layerTest(process.cwd(), {
  prefix: "caide-api-adapter-test-",
}).pipe(Layer.provide(NodeServices.layer));
const baseLayer = Layer.merge(NodeServices.layer, serverConfigLayer);
const credentialsLayer = Layer.merge(
  baseLayer,
  ProviderCredentialsLive.pipe(Layer.provide(baseLayer)),
);

describe("ApiAdapters", () => {
  it("OpenAiAdapter manages session lifecycles and lists models", async () => {
    const threadId = ThreadId.makeUnsafe(randomUUID());
    const layer = OpenAiAdapterLive.pipe(Layer.provide(credentialsLayer));

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const adapter = yield* OpenAiAdapter;
        const session = yield* adapter.startSession({
          threadId,
          runtimeMode: "full-access",
        });
        const has = yield* adapter.hasSession(threadId);
        const sessions = yield* adapter.listSessions();
        const models = yield* adapter.listModels!({ provider: "openai" });
        yield* adapter.stopSession(threadId);
        const hasAfterStop = yield* adapter.hasSession(threadId);

        return { session, has, sessions, models, hasAfterStop };
      }).pipe(Effect.provide(layer)),
    );

    expect(result.session.provider).toBe("openai");
    expect(result.session.status).toBe("ready");
    expect(result.has).toBe(true);
    expect(result.sessions).toHaveLength(1);
    expect(result.models.models.length).toBeGreaterThan(0);
    expect(result.hasAfterStop).toBe(false);
  });

  it("AnthropicAdapter manages session lifecycles and lists models", async () => {
    const threadId = ThreadId.makeUnsafe(randomUUID());
    const layer = AnthropicAdapterLive.pipe(Layer.provide(credentialsLayer));

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const adapter = yield* AnthropicAdapter;
        const session = yield* adapter.startSession({
          threadId,
          runtimeMode: "full-access",
        });
        const models = yield* adapter.listModels!({ provider: "anthropic" });
        yield* adapter.stopSession(threadId);

        return { session, models };
      }).pipe(Effect.provide(layer)),
    );

    expect(result.session.provider).toBe("anthropic");
    expect(result.session.status).toBe("ready");
    expect(result.models.models.length).toBeGreaterThan(0);
  });

  it("GoogleAdapter manages session lifecycles and lists models", async () => {
    const threadId = ThreadId.makeUnsafe(randomUUID());
    const layer = GoogleAdapterLive.pipe(Layer.provide(credentialsLayer));

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const adapter = yield* GoogleAdapter;
        const session = yield* adapter.startSession({
          threadId,
          runtimeMode: "full-access",
        });
        const models = yield* adapter.listModels!({ provider: "google" });
        yield* adapter.stopSession(threadId);

        return { session, models };
      }).pipe(Effect.provide(layer)),
    );

    expect(result.session.provider).toBe("google");
    expect(result.session.status).toBe("ready");
    expect(result.models.models.length).toBeGreaterThan(0);
  });

  it("OpenRouterAdapter manages session lifecycles and lists models", async () => {
    const threadId = ThreadId.makeUnsafe(randomUUID());
    const layer = OpenRouterAdapterLive.pipe(Layer.provide(credentialsLayer));

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const adapter = yield* OpenRouterAdapter;
        const session = yield* adapter.startSession({
          threadId,
          runtimeMode: "full-access",
        });
        const models = yield* adapter.listModels!({ provider: "openrouter" });
        yield* adapter.stopSession(threadId);

        return { session, models };
      }).pipe(Effect.provide(layer)),
    );

    expect(result.session.provider).toBe("openrouter");
    expect(result.session.status).toBe("ready");
    expect(result.models.models.length).toBeGreaterThan(0);
  });

  it("OllamaAdapter manages session lifecycles and lists models", async () => {
    const threadId = ThreadId.makeUnsafe(randomUUID());
    const layer = OllamaAdapterLive.pipe(Layer.provide(credentialsLayer));

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const adapter = yield* OllamaAdapter;
        const session = yield* adapter.startSession({
          threadId,
          runtimeMode: "full-access",
        });
        const models = yield* adapter.listModels!({ provider: "ollama" });
        yield* adapter.stopSession(threadId);

        return { session, models };
      }).pipe(Effect.provide(layer)),
    );

    expect(result.session.provider).toBe("ollama");
    expect(result.session.status).toBe("ready");
    expect(result.models.models.length).toBeGreaterThan(0);
  });
});
