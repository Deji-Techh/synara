import type { ApiProviderKind, ProviderKind } from "@caide/contracts";
import { it, assert, vi } from "@effect/vitest";
import { assertFailure } from "@effect/vitest/utils";

import { Effect, Layer, Stream } from "effect";

import { EngineAdapter, EngineAdapterShape } from "../Services/EngineAdapter.ts";
import { GroqAdapter, GroqAdapterShape } from "../Services/GroqAdapter.ts";
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
  previewDevices: vi.fn(),
  flutterToolchainStatus: vi.fn(),
  flutterToolchainInstall: vi.fn(),
  databaseInvoke: vi.fn(),
  createApp: vi.fn(),
  goals: {
    create: vi.fn(),
    get: vi.fn(),
    getActive: vi.fn(),
    list: vi.fn(),
    listRuns: vi.fn(),
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
  subagents: {
    getActive: vi.fn(),
  },
  streamSubagentEvents: Stream.empty,
};

const makeFakeApiAdapter = <P extends ApiProviderKind>(provider: P) => ({
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

const fakeGroqAdapter: GroqAdapterShape = makeFakeApiAdapter("groq");
const fakeOpenCodeZenAdapter: OpenCodeZenAdapterShape = makeFakeApiAdapter("opencodeZen");
const fakeOpenCodeGoAdapter: OpenCodeGoAdapterShape = makeFakeApiAdapter("opencodeGo");

const layer = it.layer(
  Layer.mergeAll(
    Layer.provide(
      ProviderAdapterRegistryLive,
      Layer.mergeAll(
        Layer.succeed(EngineAdapter, fakeEngineAdapter),
        Layer.succeed(GroqAdapter, fakeGroqAdapter),
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
      const groq = yield* registry.getByProvider("groq");
      const opencodeZen = yield* registry.getByProvider("opencodeZen");
      const opencodeGo = yield* registry.getByProvider("opencodeGo");
      assert.equal(engine, fakeEngineAdapter);
      assert.equal(groq, fakeGroqAdapter);
      assert.equal(opencodeZen, fakeOpenCodeZenAdapter);
      assert.equal(opencodeGo, fakeOpenCodeGoAdapter);

      const providers = yield* registry.listProviders();
      assert.deepEqual(providers, [
        "engine",
        "groq",
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
