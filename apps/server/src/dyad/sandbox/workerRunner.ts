// FILE: workerRunner.ts
// Purpose: Off-thread sandbox execution with main-thread fallback. Worker
// failures (missing dist asset, spawn errors, timeouts) fall back to the
// in-process vm runner and say so — heavy compute prefers the worker, but a
// slow answer beats none.

import { Worker } from "node:worker_threads";
import { runInVm, createFsHosts, type VmRunResult } from "./vmRunner.ts";
import { clampSandboxTimeoutMs } from "./limits.ts";

export const WORKER_WALL_TIMEOUT_MS = 55_000;

export async function runWorkerSandbox(
  script: string,
  appPath: string,
): Promise<{ ranOn: "worker" | "main"; result: VmRunResult; note?: string }> {
  try {
    const out = await new Promise<VmRunResult>((resolve, reject) => {
      let worker: Worker;
      try {
        worker = new Worker(new URL("./sandboxWorker.ts", import.meta.url), {
          workerData: { script, appPath },
        });
      } catch (err) {
        reject(err);
        return;
      }
      const timer = setTimeout(() => {
        void worker.terminate();
        reject(new Error(`Sandbox worker timed out after ${WORKER_WALL_TIMEOUT_MS}ms`));
      }, WORKER_WALL_TIMEOUT_MS);
      worker.once("message", (msg: { ok: boolean; result?: unknown; logs?: string[]; error?: string }) => {
        clearTimeout(timer);
        void worker.terminate();
        if (msg.ok) resolve({ result: msg.result, logs: msg.logs ?? [] });
        else reject(new Error(msg.error ?? "Sandbox worker failed"));
      });
      worker.once("error", (err) => {
        clearTimeout(timer);
        void worker.terminate();
        reject(err);
      });
      worker.once("exit", (code) => {
        clearTimeout(timer);
        if (code !== 0) reject(new Error(`Sandbox worker exited with code ${code}`));
      });
    });
    return { ranOn: "worker", result: out };
  } catch {
    const hosts = createFsHosts(appPath);
    const result = await runInVm(
      script,
      { read_file: hosts.read_file, list_files: hosts.list_files, grep: hosts.grep },
      clampSandboxTimeoutMs(undefined),
    );
    return { ranOn: "main", result, note: "worker thread unavailable; ran on main" };
  }
}
