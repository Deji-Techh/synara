// FILE: EngineAdapter.test.ts
// Purpose: Proves the engine adapter spawns apps/engine over stdio and drives
// the canonical Synara provider API end to end: startSession (initialize +
// ping hello-world), sendTurn (echo hello-world), event stream, stopSession.
// Layer: Provider adapter integration test

import { randomUUID } from "node:crypto";

import { Effect, Fiber, Stream } from "effect";
import { describe, expect, it } from "vitest";

import { ThreadId } from "@synara/contracts";

import { EngineAdapter, EngineAdapterShape } from "../Services/EngineAdapter.ts";
import { EngineAdapterLive } from "./EngineAdapter.ts";

function provideAdapter<T>(effect: Effect.Effect<T, unknown, EngineAdapter>) {
  return effect.pipe(Effect.provide(EngineAdapterLive));
}

describe("EngineAdapter", () => {
  it("startSession spawns the engine and completes initialize + ping hello-world", async () => {
    const threadId = ThreadId.makeUnsafe(randomUUID());

    const result = await Effect.runPromise(
      provideAdapter(
        Effect.gen(function* () {
          const adapter = yield* EngineAdapter;
          const session = yield* adapter.startSession({
            threadId,
            runtimeMode: "full-access",
          });
          const sessions = yield* adapter.listSessions();
          return { session, sessions };
        }),
      ),
    );

    expect(result.session.provider).toBe("engine");
    expect(result.session.status).toBe("ready");
    expect(result.session.threadId).toBe(threadId);
    expect(result.sessions).toHaveLength(1);
  });

  it("sendTurn completes a hello-world echo turn and emits lifecycle events", async () => {
    const threadId = ThreadId.makeUnsafe(randomUUID());

    const result = await Effect.runPromise(
      provideAdapter(
        Effect.gen(function* () {
          const adapter = yield* EngineAdapter;
          const eventsFiber = yield* Stream.runCollect(Stream.take(adapter.streamEvents, 8)).pipe(
            Effect.forkChild,
          );
          yield* adapter.startSession({
            threadId,
            runtimeMode: "full-access",
          });
          const turnResult = yield* adapter.sendTurn({
            threadId,
            input: "build me a flutter app",
          });
          const events = yield* Fiber.join(eventsFiber);
          return { turnResult, events };
        }),
      ),
    );

    expect(result.turnResult.threadId).toBe(threadId);
    expect(result.turnResult.turnId).toBeDefined();
    const eventTypes = result.events.map((e) => e.type);
    expect(eventTypes).toContain("session.started");
    expect(eventTypes).toContain("thread.started");
    expect(eventTypes).toContain("turn.started");
    expect(eventTypes).toContain("turn.completed");
  });

  it("stopSession tears the engine process down", async () => {
    const threadId = ThreadId.makeUnsafe(randomUUID());

    await Effect.runPromise(
      provideAdapter(
        Effect.gen(function* () {
          const adapter = yield* EngineAdapter;
          yield* adapter.startSession({
            threadId,
            runtimeMode: "full-access",
          });
          yield* adapter.stopSession(threadId);
          const has = yield* adapter.hasSession(threadId);
          expect(has).toBe(false);
        }),
      ),
    );
  });

  it("rejects sessions for an unknown thread", async () => {
    const threadId = ThreadId.makeUnsafe(randomUUID());

    await expect(
      Effect.runPromise(
        provideAdapter(
          Effect.gen(function* () {
            const adapter = yield* EngineAdapter;
            yield* adapter.sendTurn({ threadId, input: "hello" });
          }),
        ),
      ),
    ).rejects.toMatchObject({ _tag: "ProviderAdapterSessionNotFoundError" });
  });
});
