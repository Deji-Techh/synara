/**
 * Handler-level regression guard for the M5 preview quality-gate RPCs
 * (analyze / test / buildStart / buildState). These handlers are new since
 * `wsRpc.previewRouting.test.ts` only proves group membership — a handler
 * that fails to reach the engine adapter (e.g. a wrong op name on
 * `EngineAdapterShape`) would still route, then blow up at runtime. Here we
 * drive `makeWsPreviewHandlers` with a fake registry whose engine adapter
 * returns canned results and assert the RPC layer passes inputs through and
 * surfaces adapter errors as `WsRpcError`.
 */
import { assert, describe, expect, it } from "vitest";

import { PREVIEW_WS_METHODS, ThreadId, WsRpcError } from "@caide/contracts";
import { Effect, Exit } from "effect";

import type { EngineAdapterShape } from "./Services/EngineAdapter.ts";
import type { ProviderAdapterRegistryShape } from "./Services/ProviderAdapterRegistry.ts";
import { makeWsPreviewHandlers } from "./wsPreviewHandlers.ts";

const threadId = ThreadId.makeUnsafe("t_1");

const makeRegistry = (engine: Partial<EngineAdapterShape>): ProviderAdapterRegistryShape => ({
  getByProvider: (provider) =>
    provider === "engine"
      ? Effect.succeed(engine as EngineAdapterShape)
      : Effect.fail(new Error("unsupported provider")),
  listProviders: () => Effect.succeed(["engine"]),
});

describe("makeWsPreviewHandlers quality gates (M5)", () => {
  it("routes preview.analyze through the engine adapter", async () => {
    const engine: Partial<EngineAdapterShape> = {
      previewAnalyze: () =>
        Effect.succeed({
          issues: [{ severity: "error", path: "lib/main.dart", message: "boo" }],
          clean: false,
          output: "analyzing...",
        }),
    };
    const handlers = makeWsPreviewHandlers(makeRegistry(engine));
    const exit = await Effect.runPromise(
      Effect.exit(handlers[PREVIEW_WS_METHODS.analyze]({ threadId })),
    );
    assert.isTrue(Exit.isSuccess(exit));
    if (Exit.isSuccess(exit)) {
      expect(exit.value).toMatchObject({ clean: false, issues: [{ path: "lib/main.dart" }] });
    }
  });

  it("routes preview.test, forwarding testPath when present", async () => {
    let seen: { testPath?: string } | undefined;
    const engine: Partial<EngineAdapterShape> = {
      previewTest: (input) => {
        seen = input;
        return Effect.succeed({ passed: 2, failed: 1, skipped: 0, output: "test output" });
      },
    };
    const handlers = makeWsPreviewHandlers(makeRegistry(engine));
    const exit = await Effect.runPromise(
      Effect.exit(handlers[PREVIEW_WS_METHODS.test]({ threadId, testPath: "test/foo_test.dart" })),
    );
    assert.isTrue(Exit.isSuccess(exit));
    expect(seen).toEqual({ threadId, testPath: "test/foo_test.dart" });
  });

  it("routes preview.buildStart, forwarding target and channel", async () => {
    let seen: { target?: string; channel?: string } | undefined;
    const engine: Partial<EngineAdapterShape> = {
      previewBuildStart: (input) => {
        seen = input;
        return Effect.succeed({ buildId: "b_1" });
      },
    };
    const handlers = makeWsPreviewHandlers(makeRegistry(engine));
    const exit = await Effect.runPromise(
      Effect.exit(
        handlers[PREVIEW_WS_METHODS.buildStart]({
          threadId,
          target: "apk",
          channel: "release",
        }),
      ),
    );
    assert.isTrue(Exit.isSuccess(exit));
    expect(seen).toMatchObject({ threadId, target: "apk", channel: "release" });
  });

  it("routes preview.buildState, forwarding buildId", async () => {
    let seen: { buildId?: string } | undefined;
    const engine: Partial<EngineAdapterShape> = {
      previewBuildState: (input) => {
        seen = input;
        return Effect.succeed({
          buildId: "b_1",
          status: "running",
          logs: ["building..."],
        });
      },
    };
    const handlers = makeWsPreviewHandlers(makeRegistry(engine));
    const exit = await Effect.runPromise(
      Effect.exit(handlers[PREVIEW_WS_METHODS.buildState]({ threadId, buildId: "b_1" })),
    );
    assert.isTrue(Exit.isSuccess(exit));
    expect(seen).toMatchObject({ threadId, buildId: "b_1" });
  });

  it("maps adapter failures to WsRpcError", async () => {
    const engine: Partial<EngineAdapterShape> = {
      previewAnalyze: () => Effect.fail(new Error("engine down")),
    };
    const handlers = makeWsPreviewHandlers(makeRegistry(engine));
    const exit = await Effect.runPromise(
      Effect.exit(handlers[PREVIEW_WS_METHODS.analyze]({ threadId })),
    );
    assert.isTrue(Exit.isFailure(exit));
    if (Exit.isFailure(exit)) {
      const reason = exit.cause.reasons[0];
      expect(reason?._tag).toBe("Fail");
      expect(reason?.error).toBeInstanceOf(WsRpcError);
      expect((reason?.error as WsRpcError).message).toBe("engine down");
    }
  });
});
