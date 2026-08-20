// FILE: EngineAdapter.test.ts
// Purpose: Proves the engine adapter spawns apps/engine (node dist bundle)
// over stdio and drives the canonical Caide provider API end to end:
// startSession (initialize + ping hello-world), sendTurn (canned QA stream
// round trip), event stream, stopSession.
// Layer: Provider adapter integration test

import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { Effect, Fiber, Layer, Stream } from "effect";
import { describe, expect, it } from "vitest";

import { ThreadId } from "@caide/contracts";

import { ServerSettingsService } from "../../serverSettings";
import { ServerSecretStore } from "../../auth/Services/ServerSecretStore";
import { EngineAdapter, EngineAdapterShape } from "../Services/EngineAdapter.ts";
import { EngineAdapterLive, EngineAdapterLiveWithOptions } from "./EngineAdapter.ts";

const fakeSecretStoreLayer = Layer.succeed(ServerSecretStore, {
  get: () => Effect.succeed(null),
  set: () => Effect.void,
  getOrCreateRandom: () => Effect.succeed(new Uint8Array()),
  remove: () => Effect.void,
});

// Isolate the engine's SQLite + caide-apps dirs per run so tests never touch
// the real user state, and import a tiny fixture folder (fast) instead of
// scaffolding a fresh Flutter template per test.
function makeIsolatedFixture(): { appsDir: string; userDataDir: string; fixturePath: string } {
  const root = mkdtempSync(path.join(os.tmpdir(), "caide-engine-adapter-"));
  const appsDir = path.join(root, "apps");
  const userDataDir = path.join(root, "userData");
  mkdirSync(appsDir, { recursive: true });
  mkdirSync(userDataDir, { recursive: true });
  const fixturePath = path.join(root, "fixture");
  mkdirSync(fixturePath, { recursive: true });
  writeFileSync(path.join(fixturePath, "pubspec.yaml"), "name: fixture_app\n", "utf8");
  return { appsDir, userDataDir, fixturePath };
}

function provideAdapter<T>(effect: Effect.Effect<T, unknown, EngineAdapter>) {
  const { appsDir, userDataDir } = makeIsolatedFixture();
  return effect.pipe(
    Effect.provide(
      EngineAdapterLiveWithOptions({
        appsDir,
        env: { CAIDE_DEV_USER_DATA_DIR: userDataDir },
      }).pipe(
        Layer.provide(ServerSettingsService.layerTest()),
        Layer.provide(fakeSecretStoreLayer),
      ),
    ),
  );
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

  it("sendTurn completes a canned-stream turn and emits lifecycle events", async () => {
    const threadId = ThreadId.makeUnsafe(randomUUID());
    const { fixturePath } = makeIsolatedFixture();

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
            cwd: fixturePath,
          });
          const turnResult = yield* adapter.sendTurn({
            threadId,
            input: "[caide-qa=write]",
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
  }, 120_000);

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

  it("goals bridge is engine-native: resolveAppId + CRUD + live domain events", async () => {
    const threadId = ThreadId.makeUnsafe(randomUUID());
    const { fixturePath } = makeIsolatedFixture();

    const result = await Effect.runPromise(
      provideAdapter(
        Effect.gen(function* () {
          const adapter = yield* EngineAdapter;

          yield* adapter.startSession({
            threadId,
            runtimeMode: "full-access",
            cwd: fixturePath,
          });

          // App identity resolves to the engine's numeric rowid by path;
          // import-app provisions a fresh app for the fixture folder.
          const appId = yield* adapter.goals.resolveAppId({ workspaceRoot: fixturePath });
          expect(typeof appId).toBe("number");

          // Subscribe first so goal:updated / goal:run-requested relays are
          // captured as the engine schedules the run.
          const eventsFiber = yield* Stream.runCollect(
            Stream.take(adapter.streamGoalDomainEvents, 2),
          ).pipe(
            Effect.timeout("30 seconds"),
            Effect.map((maybe) => {
              if (maybe === undefined) throw new Error("no goal domain events");
              return maybe;
            }),
            Effect.forkChild,
          );

          const created = yield* adapter.goals.create({
            appId,
            title: "probe goal",
            objective: "say hello",
          });
          expect(created.appId).toBe(appId);
          expect(created.status).toBe("active");

          const active = yield* adapter.goals.getActive({ appId });
          expect(active?.id).toBe(created.id);
          expect(active?.appId).toBe(appId);

          const listed = yield* adapter.goals.list({ appId });
          expect(listed.some((g) => g.id === created.id)).toBe(true);

          const fetched = yield* adapter.goals.get({ goalId: created.id });
          expect(fetched.id).toBe(created.id);

          const activity = yield* adapter.goals.listActivity({ goalId: created.id });
          expect(activity.length).toBeGreaterThan(0);
          expect(activity.some((e) => e.goalId === created.id)).toBe(true);

          const events = yield* Fiber.join(eventsFiber);
          return { created, active, activity, events };
        }),
      ),
    );

    // Engine-native identity flows through the whole bridge untouched.
    expect(result.active).not.toBeNull();
    expect(result.activity[0].goalId).toBe(result.created.id);
    // Live relays: engine emits goal:updated + goal:run-requested as it
    // schedules the run; the adapter republishes them for the WS layer.
    const eventTypes = result.events.map((e) => e.type);
    expect(eventTypes).toContain("goal.updated");
    expect(eventTypes).toContain("goal.run-requested");
  }, 120_000);

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

  it("quality gates require an active session", async () => {
    const threadId = ThreadId.makeUnsafe(randomUUID());

    const gates = [
      (adapter: EngineAdapterShape) => adapter.previewAnalyze({ threadId }),
      (adapter: EngineAdapterShape) => adapter.previewTest({ threadId }),
      (adapter: EngineAdapterShape) =>
        adapter.previewBuildStart({ threadId, target: "apk", channel: "debug" }),
      (adapter: EngineAdapterShape) => adapter.previewBuildState({ threadId, buildId: "b_1" }),
    ];

    for (const gate of gates) {
      await expect(
        Effect.runPromise(
          provideAdapter(
            Effect.gen(function* () {
              const adapter = yield* EngineAdapter;
              yield* gate(adapter);
            }),
          ),
        ),
      ).rejects.toMatchObject({ _tag: "ProviderAdapterSessionNotFoundError" });
    }
  });
});
