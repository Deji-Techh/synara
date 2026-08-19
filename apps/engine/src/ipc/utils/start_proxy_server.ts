// startProxy.js – helper to launch proxy.js as a worker

import { Worker } from "worker_threads";
import path from "path";
import log from "electron-log";
import { CaideError, CaideErrorKind } from "@/errors/caide_error";
import {
  PROXY_FALLBACK_MAX_ATTEMPTS,
  getProxyFallbackPortStart,
} from "../../../shared/ports";

const logger = log.scope("start_proxy_server");

export async function startProxy(
  targetOrigin: string,
  opts: {
    port: number;
    onStarted?: (proxyUrl: string) => void;
    onError?: (error: CaideError) => void;
    onWorkerError?: (error: Error) => void;
    onExit?: (exitCode: number) => void;
    fixedHeaders?: Record<string, string>;
    listenHost?: string;
  },
) {
  if (!/^https?:\/\//.test(targetOrigin))
    throw new CaideError(
      "startProxy: targetOrigin must be absolute http/https URL",
      CaideErrorKind.Validation,
    );
  const {
    port,
    onStarted,
    onError,
    onWorkerError,
    onExit,
    fixedHeaders,
    listenHost,
  } = opts;
  const fallbackPortStart = getProxyFallbackPortStart();
  logger.info("Starting proxy on port", port);

  const worker = new Worker(
    path.resolve(__dirname, "..", "..", "worker", "proxy_server.js"),
    {
      workerData: {
        targetOrigin,
        port,
        fallbackPortStart,
        maxPortAttempts: PROXY_FALLBACK_MAX_ATTEMPTS,
        fixedHeaders,
        listenHost,
      },
    },
  );

  worker.on("message", (m) => {
    logger.info("[proxy]", m);
    if (typeof m === "string" && m.startsWith("proxy-server-start url=")) {
      const url = m.substring("proxy-server-start url=".length);
      onStarted?.(url);
    } else if (typeof m === "string" && m.startsWith("proxy-server-error")) {
      logger.error("[proxy] failed to bind:", m);
      onError?.(
        new CaideError(
          `Could not start the preview proxy: every port from ${port} to ${fallbackPortStart + PROXY_FALLBACK_MAX_ATTEMPTS - 1} is in use. Free up a port and restart the app.`,
          CaideErrorKind.Conflict,
        ),
      );
    }
  });
  worker.on("error", (e) => {
    logger.error("[proxy] error:", e);
    onWorkerError?.(e);
  });
  worker.on("exit", (c) => {
    logger.info("[proxy] exit", c);
    onExit?.(c);
  });

  return worker; // let the caller keep a handle if desired
}
