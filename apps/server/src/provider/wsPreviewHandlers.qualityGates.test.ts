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

import { ProviderUnsupportedError, ProviderAdapterProcessError } from "./Errors.ts";
import type { EngineAdapterShape } from "./Services/EngineAdapter.ts";
import type { ProviderAdapterRegistryShape } from "./Services/ProviderAdapterRegistry.ts";
import { makeWsPreviewHandlers } from "./wsPreviewHandlers.ts";

const threadId = ThreadId.makeUnsafe("t_1");

const makeRegistry = (engine: Partial<EngineAdapterShape>): ProviderAdapterRegistryShape => ({
  getByProvider: (provider) =>
    provider === "engine"
      ? Effect.succeed(engine as EngineAdapterShape)
      : Effect.fail(new ProviderUnsupportedError({ provider })),
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

  it("uses the trusted server workspace instead of a caller-supplied preview path", async () => {
    let seen: { appDir?: string } | undefined;
    const engine: Partial<EngineAdapterShape> = {
      previewStart: (input) => {
        seen = input;
        return Effect.succeed({ url: "http://localhost:8081", kind: "browser" });
      },
    };
    const handlers = makeWsPreviewHandlers(makeRegistry(engine), {
      ensureEngineSession: () => Effect.void,
      resolveWorkspace: () => Effect.succeed("/trusted/project"),
    });
    await Effect.runPromise(
      handlers[PREVIEW_WS_METHODS.start]({
        threadId,
        appDir: "/foreign/project",
      }),
    );
    expect(seen?.appDir).toBe("/trusted/project");
  });

  it("passes the trusted server workspace to release builds", async () => {
    let seen: { appDir?: string } | undefined;
    const engine: Partial<EngineAdapterShape> = {
      previewBuildStart: (input) => {
        seen = input;
        return Effect.succeed({ buildId: "b_scoped" });
      },
    };
    const handlers = makeWsPreviewHandlers(makeRegistry(engine), {
      ensureEngineSession: () => Effect.void,
      resolveWorkspace: () => Effect.succeed("/trusted/project"),
    });
    await Effect.runPromise(handlers[PREVIEW_WS_METHODS.buildStart]({ threadId, target: "web" }));
    expect(seen?.appDir).toBe("/trusted/project");
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
      previewAnalyze: () =>
        Effect.fail(
          new ProviderAdapterProcessError({
            provider: "engine",
            threadId,
            detail: "engine down",
          }),
        ),
    };
    const handlers = makeWsPreviewHandlers(makeRegistry(engine));
    const exit = await Effect.runPromise(
      Effect.exit(handlers[PREVIEW_WS_METHODS.analyze]({ threadId })),
    );
    assert.isTrue(Exit.isFailure(exit));
    if (Exit.isFailure(exit)) {
      const reason = exit.cause.reasons[0];
      if (reason && reason._tag === "Fail") {
        expect(reason.error).toBeInstanceOf(WsRpcError);
        expect((reason.error as WsRpcError).message).toBe(
          "Provider adapter process error (engine) for thread t_1: engine down",
        );
      }
    }
  });

  it("ensures an engine session before dispatching a preview op", async () => {
    let ensured = false;
    const engine: Partial<EngineAdapterShape> = {
      previewTest: () => Effect.succeed({ passed: 1, failed: 0, skipped: 0, output: "ok" }),
    };
    const handlers = makeWsPreviewHandlers(makeRegistry(engine), {
      ensureEngineSession: (_threadId) =>
        Effect.sync(() => {
          ensured = true;
        }),
    });
    const exit = await Effect.runPromise(
      Effect.exit(handlers[PREVIEW_WS_METHODS.test]({ threadId, testPath: "test/a_test.dart" })),
    );
    assert.isTrue(Exit.isSuccess(exit));
    expect(ensured).toBe(true);
  });

  it("fails cleanly when the ensure callback itself fails", async () => {
    const engine: Partial<EngineAdapterShape> = {
      previewStart: () => Effect.succeed({ url: "http://localhost:8081" }),
    };
    const handlers = makeWsPreviewHandlers(makeRegistry(engine), {
      ensureEngineSession: () => Effect.fail(new WsRpcError({ message: "engine unavailable" })),
    });
    const exit = await Effect.runPromise(
      Effect.exit(handlers[PREVIEW_WS_METHODS.start]({ threadId })),
    );
    assert.isTrue(Exit.isFailure(exit));
    if (Exit.isFailure(exit)) {
      const reason = exit.cause.reasons[0];
      if (reason && reason._tag === "Fail") {
        expect((reason.error as WsRpcError).message).toBe("engine unavailable");
      }
    }
  });

  it("dispatches without an ensure callback (backwards compatible)", async () => {
    let seen = false;
    const engine: Partial<EngineAdapterShape> = {
      previewReload: () => {
        seen = true;
        return Effect.succeed({ reloaded: true });
      },
    };
    const handlers = makeWsPreviewHandlers(makeRegistry(engine));
    const exit = await Effect.runPromise(
      Effect.exit(handlers[PREVIEW_WS_METHODS.reload]({ threadId, hotReload: true })),
    );
    assert.isTrue(Exit.isSuccess(exit));
    expect(seen).toBe(true);
  });
});
