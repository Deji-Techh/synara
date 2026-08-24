import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
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

  it("creates and persists distinct blank, React Native, and website projects", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "caide-framework-projects-"));
    const runtime = await startDyadEmbeddedRuntime({
      paths: { runtimeDataDir: path.join(root, "state"), appsDir: path.join(root, "apps") },
      notify: () => undefined,
      readSettings: async () => ({}), readSecret: async () => null, log: () => undefined,
      now: () => new Date(), randomId: () => "test-id",
    });
    const create = async (name: string, framework: "blank" | "react-native" | "website") => {
      const envelope = await runtime.engine.invoke<{ ok: true; value: { app: { framework: string } } }>(
        "create-app", { name, framework, initialChatMode: "build" },
      );
      expect(envelope.ok).toBe(true);
      expect(envelope.value.app.framework).toBe(framework);
    };
    try {
      await create("blank-project", "blank");
      await create("native-project", "react-native");
      await create("website-project", "website");
      await expect(stat(path.join(root, "apps", "blank-project"))).resolves.toMatchObject({});
      expect(JSON.parse(await readFile(path.join(root, "apps", "native-project", "package.json"), "utf8")).dependencies).toHaveProperty("react-native");
      expect(JSON.parse(await readFile(path.join(root, "apps", "website-project", "package.json"), "utf8")).scripts).toHaveProperty("dev");
    } finally {
      await runtime.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});
