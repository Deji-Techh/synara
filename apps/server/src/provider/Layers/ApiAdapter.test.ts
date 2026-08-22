// FILE: ApiAdapter.test.ts
// Purpose: Proves API provider adapters (groq, opencodeZen, opencodeGo) handle
// session lifecycles, static fallback without keys, and live /models discovery
// with the stored API key plus settings-driven baseUrl overrides.
// Layer: Provider adapter test

import { randomUUID } from "node:crypto";

import { ThreadId } from "@caide/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { Effect, Layer, Stream } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ServerConfig } from "../../config.ts";
import { ProviderCredentials, ProviderCredentialsLive } from "../../providerCredentials.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import { GroqAdapter } from "../Services/GroqAdapter.ts";
import { OpenCodeZenAdapter } from "../Services/OpenCodeZenAdapter.ts";
import { OpenCodeGoAdapter } from "../Services/OpenCodeGoAdapter.ts";
import { GroqAdapterLive, OpenCodeZenAdapterLive, OpenCodeGoAdapterLive } from "./ApiAdapter.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeLayers(input: {
  readonly prefix: string;
  readonly settingsOverrides?: Parameters<typeof ServerSettingsService.layerTest>[0];
}) {
  const serverConfigLayer = ServerConfig.layerTest(process.cwd(), {
    prefix: input.prefix,
  }).pipe(Layer.provide(NodeServices.layer));
  const baseLayer = Layer.merge(NodeServices.layer, serverConfigLayer);
  return Layer.mergeAll(
    baseLayer,
    ProviderCredentialsLive.pipe(Layer.provide(baseLayer)),
    ServerSettingsService.layerTest(input.settingsOverrides),
  );
}

/**
 * Merges the adapter with its dependencies so test programs can reach both the
 * adapter service and `ProviderCredentials` (to seed API keys) in one context.
 */
function withAdapter(
  live: Layer.Layer<any, never, any>,
  deps: Layer.Layer<any, any, never>,
): Layer.Layer<any, any, never> {
  return Layer.mergeAll(deps, live.pipe(Layer.provide(deps)));
}

describe("ApiAdapters", () => {
  it("GroqAdapter manages session lifecycles and serves the static catalog without a key", async () => {
    const threadId = ThreadId.makeUnsafe(randomUUID());
    const deps = makeLayers({ prefix: "caide-groq-adapter-" });
    const layer = withAdapter(GroqAdapterLive, deps);

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const adapter = yield* GroqAdapter;
        const session = yield* adapter.startSession({
          threadId,
          runtimeMode: "full-access",
        });
        const has = yield* adapter.hasSession(threadId);
        const sessions = yield* adapter.listSessions();
        const models = yield* adapter.listModels!({ provider: "groq" });
        yield* adapter.stopSession(threadId);
        const hasAfterStop = yield* adapter.hasSession(threadId);

        return { session, has, sessions, models, hasAfterStop };
      }).pipe(Effect.provide(layer)),
    );

    expect(result.session.provider).toBe("groq");
    expect(result.session.status).toBe("ready");
    expect(result.has).toBe(true);
    expect(result.sessions).toHaveLength(1);
    expect(result.models.source).toBe("static");
    expect(result.models.models.length).toBeGreaterThan(0);
    expect(result.hasAfterStop).toBe(false);
  });

  it("OpenCodeZenAdapter serves the static catalog without a key", async () => {
    const deps = makeLayers({ prefix: "caide-zen-adapter-" });
    const layer = withAdapter(OpenCodeZenAdapterLive, deps);

    const models = await Effect.runPromise(
      Effect.gen(function* () {
        const adapter = yield* OpenCodeZenAdapter;
        return yield* adapter.listModels!({ provider: "opencodeZen" });
      }).pipe(Effect.provide(layer)),
    );

    expect(models.source).toBe("static");
    expect(models.models.map((model) => model.slug)).toContain("deepseek-v4-flash-free");
  });

  it("OpenCodeGoAdapter discovers live models with the stored key and honors baseUrl overrides", async () => {
    const fetchImpl = vi.fn(async (input: Request | string | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://go.catalog.test/v1/models");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer sk-go-live-test");
      return new Response(JSON.stringify({ data: [{ id: "fresh-go-model" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchImpl);

    const deps = makeLayers({
      prefix: "caide-go-adapter-",
      settingsOverrides: {
        providers: { opencodeGo: { baseUrl: "https://go.catalog.test/v1" } },
      },
    });
    const layer = withAdapter(OpenCodeGoAdapterLive, deps);

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const credentials = yield* ProviderCredentials;
        yield* credentials.replaceApiKey("opencodeGo", "sk-go-live-test");
        const adapter = yield* OpenCodeGoAdapter;
        const first = yield* adapter.listModels!({ provider: "opencodeGo" });
        const second = yield* adapter.listModels!({ provider: "opencodeGo" });
        return { first, second };
      }).pipe(Effect.provide(layer)),
    );

    expect(result.first.source).toBe("live");
    expect(result.first.cached).toBe(false);
    expect(result.first.models.map((model) => model.slug)).toContain("fresh-go-model");
    // Static built-ins survive alongside live discovery.
    expect(result.first.models.map((model) => model.slug)).toContain("deepseek-v4-flash-free");
    expect(result.second.cached).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("falls back to the static catalog when live discovery fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("denied", { status: 401 })),
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const deps = makeLayers({ prefix: "caide-groq-fallback-" });
      const layer = withAdapter(GroqAdapterLive, deps);

      const models = await Effect.runPromise(
        Effect.gen(function* () {
          const credentials = yield* ProviderCredentials;
          yield* credentials.replaceApiKey("groq", "sk-groq-rejected");
          const adapter = yield* GroqAdapter;
          return yield* adapter.listModels!({ provider: "groq" });
        }).pipe(Effect.provide(layer)),
      );

      expect(models.source).toBe("static");
      expect(models.models.length).toBeGreaterThan(0);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("sendTurn emits valid content.delta events with streamKind and honors custom model selection", async () => {
    const threadId = ThreadId.makeUnsafe(randomUUID());
    const deps = makeLayers({ prefix: "caide-sendturn-stream-" });
    const layer = withAdapter(GroqAdapterLive, deps);

    const events = await Effect.runPromise(
      Effect.gen(function* () {
        const adapter = yield* GroqAdapter;
        yield* adapter.startSession({
          threadId,
          runtimeMode: "full-access",
          modelSelection: { provider: "groq", model: "custom-model-test" },
        });

        const collectedEvents: any[] = [];
        const streamFiber = yield* Stream.runForEach(adapter.streamEvents, (event) =>
          Effect.sync(() => {
            collectedEvents.push(event);
          }),
        ).pipe(Effect.forkChild);

        yield* adapter.sendTurn({
          threadId,
          input: "hello",
          modelSelection: { provider: "groq", model: "custom-model-test" },
        });

        return collectedEvents;
      }).pipe(Effect.provide(layer)),
    );

    const deltaEvent = events.find((e) => e.type === "content.delta");
    expect(deltaEvent).toBeDefined();
    expect(deltaEvent.payload.streamKind).toBe("assistant_text");
    expect(typeof deltaEvent.payload.delta).toBe("string");
  });
});
