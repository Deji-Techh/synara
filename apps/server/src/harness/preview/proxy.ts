// FILE: proxy.ts
// Purpose: Preview proxy launcher — runs the vendored zero-dep
// proxy_server worker (HTTP/WS forwarder + injected clients) in front of a
// thread's dev server so the served page carries visual-editing,
// screenshots, and log forwarding.
// Donor: dyad x caide src/ipc/utils/start_proxy_server.ts (Electron log +
// DyadError replaced with plain Errors; worker path points at the vendored
// dyad/preview/proxy_server.cjs; per-thread registry replaces the implicit
// single-app ownership).

import * as path from "node:path";
import { Worker } from "node:worker_threads";

import {
  getThreadProxyPort,
  PROXY_FALLBACK_MAX_ATTEMPTS,
  PROXY_FALLBACK_PORT_START,
} from "../../dyad/preview/ports.ts";

export class ProxyStartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProxyStartError";
  }
}

const WORKER_PATH = path.join(import.meta.dirname ?? "", "..", "..", "dyad", "preview", "proxy_server.cjs");

interface ProxyHandle {
  worker: Worker;
  proxyUrl: string;
}

const proxies = new Map<string, ProxyHandle>();

export function getProxyUrl(threadId: string): string | null {
  return proxies.get(threadId)?.proxyUrl ?? null;
}

/**
 * Donor startProxy parity: boot the worker, resolve with the bound proxy
 * URL (preferred deterministic port, fallback band on collision), reject
 * when every candidate is taken. Idempotent per thread.
 */
export async function startProxyForSession(
  threadId: string,
  targetOrigin: string,
  opts?: { port?: number; listenHost?: string; fixedHeaders?: Record<string, string> },
): Promise<string> {
  const existing = proxies.get(threadId);
  if (existing) return existing.proxyUrl;
  if (!/^https?:\/\//.test(targetOrigin)) {
    throw new ProxyStartError("startProxy: targetOrigin must be absolute http/https URL");
  }
  const port = opts?.port ?? getThreadProxyPort(threadId);
  const worker = new Worker(WORKER_PATH, {
    workerData: {
      targetOrigin,
      port,
      fallbackPortStart: PROXY_FALLBACK_PORT_START,
      maxPortAttempts: PROXY_FALLBACK_MAX_ATTEMPTS,
      fixedHeaders: opts?.fixedHeaders,
      listenHost: opts?.listenHost,
    },
  });
  const proxyUrl = await new Promise<string>((resolve, reject) => {
    const onMessage = (m: unknown) => {
      if (typeof m !== "string") return;
      if (m.startsWith("proxy-server-start url=")) {
        cleanup();
        resolve(m.substring("proxy-server-start url=".length));
      } else if (m.startsWith("proxy-server-error")) {
        cleanup();
        reject(
          new ProxyStartError(
            `Could not start the preview proxy: every candidate port is in use. Free up a port and restart the preview. (${m})`,
          ),
        );
      }
    };
    const onError = (e: Error) => {
      cleanup();
      reject(new ProxyStartError(`Preview proxy worker failed: ${e.message}`));
    };
    const cleanup = () => {
      worker.off("message", onMessage);
      worker.off("error", onError);
    };
    worker.on("message", onMessage);
    worker.on("error", onError);
  }).catch(async (err) => {
    await worker.terminate().catch(() => undefined);
    throw err;
  });
  worker.on("exit", () => {
    if (proxies.get(threadId)?.worker === worker) proxies.delete(threadId);
  });
  worker.on("error", () => {
    // late worker errors after start: drop the stale handle so the next
    // start relaunches instead of serving a dead proxy URL
    if (proxies.get(threadId)?.worker === worker) proxies.delete(threadId);
  });
  proxies.set(threadId, { worker, proxyUrl });
  return proxyUrl;
}

export async function stopProxyForSession(threadId: string): Promise<boolean> {
  const handle = proxies.get(threadId);
  if (!handle) return false;
  proxies.delete(threadId);
  await handle.worker.terminate().catch(() => undefined);
  return true;
}

/** Teardown used on preview stop / server shutdown. */
export async function stopAllProxies(): Promise<void> {
  const handles = [...proxies.values()];
  proxies.clear();
  await Promise.all(handles.map((h) => h.worker.terminate().catch(() => undefined)));
}
