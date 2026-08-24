import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createEmbeddedEngine, type EmbeddedEngine } from "@caide/engine/embedded";
import type { DyadRuntimeHost } from "./runtimeHost";

export interface DyadEmbeddedRuntime {
  readonly engine: EmbeddedEngine;
  readonly close: () => Promise<void>;
}

export async function startDyadEmbeddedRuntime(host: DyadRuntimeHost): Promise<DyadEmbeddedRuntime> {
  await mkdir(host.paths.runtimeDataDir, { recursive: true });
  await mkdir(host.paths.appsDir, { recursive: true });
  const engine = await createEmbeddedEngine({
    dataDir: path.join(host.paths.runtimeDataDir, "dyad"),
    appsDir: host.paths.appsDir,
    settings: await host.readSettings(),
  });
  const unsubscribe = engine.subscribe((notification) => host.notify(notification));
  return { engine, close: async () => { unsubscribe(); await engine.shutdown(); } };
}
