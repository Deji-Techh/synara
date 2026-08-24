import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { startDyadEmbeddedRuntime } from "./embeddedRuntime";

describe("embedded dyad runtime", () => {
  it("boots, answers ping, and shuts down without a child process", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "caide-embedded-runtime-"));
    const runtime = await startDyadEmbeddedRuntime({
      paths: { runtimeDataDir: path.join(root, "state"), appsDir: path.join(root, "apps") },
      notify: () => undefined,
      readSettings: async () => ({}),
      readSecret: async () => null,
      log: () => undefined,
      now: () => new Date(),
      randomId: () => "test-id",
    });
    try {
      await expect(runtime.engine.ping()).resolves.toMatchObject({ pong: "pong" });
      await expect(runtime.engine.invoke("does-not-exist")).rejects.toThrow("no IPC handler");
    } finally {
      await runtime.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
