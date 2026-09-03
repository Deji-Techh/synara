// FILE: sandboxWorker.ts
// Purpose: node:worker_threads entry for compute-heavy sandbox scripts.
// Builds read-only FS hosts inside the worker (same jail as main), runs the
// script through the shared vm runner, and posts the result back. Launched
// via new URL(import.meta.url) with main-thread fallback on any failure.

import { parentPort, workerData } from "node:worker_threads";
import { createFsHosts, runInVm } from "./vmRunner.ts";
import { clampSandboxTimeoutMs } from "./limits.ts";

interface WorkerInput {
  script: string;
  appPath: string;
}

async function main(): Promise<void> {
  const input = workerData as WorkerInput;
  try {
    const hosts = createFsHosts(input.appPath);
    const { result, logs } = await runInVm(
      input.script,
      { read_file: hosts.read_file, list_files: hosts.list_files, grep: hosts.grep },
      clampSandboxTimeoutMs(undefined),
    );
    parentPort?.postMessage({ ok: true, result, logs });
  } catch (err) {
    parentPort?.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}

void main();
