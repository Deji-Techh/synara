// FILE: providerStatusCache.test.ts
// Purpose: Verifies cache helpers for provider readiness snapshots.
// Exports: Vitest coverage for tolerant cache reads and atomic cache writes.

import * as NodeServices from "@effect/platform-node/NodeServices";
import fs from "node:fs";
import { Effect, FileSystem, Path } from "effect";
import { describe, expect, it } from "vitest";

import {
  orderProviderStatuses,
  readProviderStatusCache,
  resolveProviderStatusCachePath,
  writeProviderStatusCache,
} from "./providerStatusCache";

const readyEngineStatus = {
  provider: "engine" as const,
  status: "ready" as const,
  available: true,
  authStatus: "authenticated" as const,
  checkedAt: "2026-04-15T10:00:00.000Z",
};

describe("providerStatusCache", () => {
  it("writes and reads provider status snapshots", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const tempDir = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "caide-provider-status-cache-",
        });
        const cachePath = resolveProviderStatusCachePath({
          stateDir: tempDir,
          provider: readyEngineStatus.provider,
        });

        yield* writeProviderStatusCache({
          filePath: cachePath,
          provider: readyEngineStatus,
        });

        return {
          cached: yield* readProviderStatusCache(cachePath),
          mode: fs.statSync(cachePath).mode & 0o777,
        };
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    expect(result.cached).toEqual(readyEngineStatus);
    if (process.platform !== "win32") expect(result.mode).toBe(0o600);
  });

  it("ignores malformed cache files", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const tempDir = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "caide-provider-status-cache-bad-",
        });
        const cachePath = resolveProviderStatusCachePath({
          stateDir: tempDir,
          provider: readyEngineStatus.provider,
        });

        yield* fileSystem.makeDirectory(path.dirname(cachePath), { recursive: true });
        yield* fileSystem.writeFileString(cachePath, "{ definitely-not-json");

        return yield* readProviderStatusCache(cachePath);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );

    expect(result).toBeUndefined();
  });

  it("keeps provider ordering stable for transport consumers", () => {
    expect(
      orderProviderStatuses([
        {
          provider: "opencodeGo",
          status: "ready",
          available: true,
          authStatus: "authenticated",
          checkedAt: "2026-04-15T10:02:00.000Z",
        },
        {
          provider: "groq",
          status: "warning",
          available: true,
          authStatus: "unknown",
          checkedAt: "2026-04-15T10:01:00.000Z",
        },
        {
          provider: "opencodeZen",
          status: "ready",
          available: true,
          authStatus: "unknown",
          checkedAt: "2026-04-15T10:03:00.000Z",
        },
        readyEngineStatus,
      ]),
    ).toEqual([
      readyEngineStatus,
      {
        provider: "groq",
        status: "warning",
        available: true,
        authStatus: "unknown",
        checkedAt: "2026-04-15T10:01:00.000Z",
      },
      {
        provider: "opencodeZen",
        status: "ready",
        available: true,
        authStatus: "unknown",
        checkedAt: "2026-04-15T10:03:00.000Z",
      },
      {
        provider: "opencodeGo",
        status: "ready",
        available: true,
        authStatus: "authenticated",
        checkedAt: "2026-04-15T10:02:00.000Z",
      },
    ]);
  });
});
