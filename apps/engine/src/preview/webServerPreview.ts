// FILE: src/preview/webServerPreview.ts
// Purpose: M3b web-server preview — the engine's fast loop for Flutter web
// apps. Spawns `flutter run -d web-server` on a fixed port, waits for the
// "is being served at" line to learn the real URL (flutter may pick a
// different port than requested), keeps a ring buffer of run output (Console
// data), and stops cleanly (`q` to flutter, then SIGKILL fallback). Rebuilt
// from dyad x caide's app_runtime_service web-server mode, without the Caide
// proxy/auth layer (M4 wires the UI; the proxy is an adapter concern).
// Layer: Engine preview service

import type { ChildProcess } from "node:child_process";

import { spawnFlutterProcess } from "../tools/flutterCommand.ts";

export interface WebServerPreviewOptions {
  /** App directory (flutter run's cwd; must contain pubspec.yaml). */
  readonly appDir: string;
  /** Requested web port; flutter may remap it (we read the served URL). */
  readonly port?: number;
  /** Host flutter binds; default 127.0.0.1. */
  readonly hostname?: string;
  /** Override binary resolution (tests pass a shim here). */
  readonly flutterBinary?: string;
  /** Max ms to wait for the "serving at" line; default 120s. */
  readonly serveTimeoutMs?: number;
  /** Called for each line of flutter run output (stdout+stderr). */
  readonly onLogLine?: (line: string) => void;
}

export interface WebServerPreview {
  /** The URL flutter actually serves, e.g. http://127.0.0.1:54321 */
  readonly url: string;
  /** Lines of flutter run output captured so far (newest last). */
  readonly logs: readonly string[];
  /** Resolves when flutter exits (0, non-zero, or killed). */
  readonly exited: Promise<number | null>;
  /** Sends `q` to flutter to stop the dev server; SIGKILL fallback. */
  stop(): Promise<void>;
}

const MAX_LOG_LINES = 500;

/**
 * Extracts the served URL from flutter run -d web-server output. Flutter
 * prints the URL on the line after "is being served at".
 */
export function extractServedUrl(lines: readonly string[]): string | null {
  let waitingForUrl = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (waitingForUrl) {
      const match = trimmed.match(/https?:\/\/[^\s]+/);
      if (match) {
        return match[0].replace(/\/+$/, "");
      }
      if (trimmed !== "") {
        waitingForUrl = false;
      }
    }
    if (trimmed.includes("is being served at")) {
      waitingForUrl = true;
    }
  }
  return null;
}

export class WebServerPreviewError extends Error {}

/**
 * Starts `flutter run -d web-server` and resolves once the served URL is
 * known. Rejects with WebServerPreviewError if flutter exits before serving,
 * the binary is missing, or serveTimeoutMs elapses.
 */
export async function startWebServerPreview(
  options: WebServerPreviewOptions,
): Promise<WebServerPreview> {
  const port = options.port ?? 0;
  const hostname = options.hostname ?? "127.0.0.1";
  const serveTimeoutMs = options.serveTimeoutMs ?? 120_000;

  let child: ChildProcess;
  try {
    child = spawnFlutterProcess(
      ["run", "-d", "web-server", "--web-port", String(port), "--web-hostname", hostname],
      options.appDir,
      { ...(options.flutterBinary !== undefined ? { binary: options.flutterBinary } : {}) },
    );
  } catch (error) {
    throw new WebServerPreviewError(error instanceof Error ? error.message : String(error));
  }

  const logs: string[] = [];
  let exited: Promise<number | null> | null = null;

  const capture = (chunk: string): void => {
    for (const rawLine of chunk.split("\n")) {
      const line = rawLine.replace(/\r$/, "");
      if (line === "") {
        continue;
      }
      if (logs.length >= MAX_LOG_LINES) {
        logs.shift();
      }
      logs.push(line);
      options.onLogLine?.(line);
    }
  };
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);

  exited = new Promise<number | null>((resolve) => {
    child.on("close", (code) => resolve(code));
    // A spawn failure (e.g. missing cwd/binary) emits "error" without "close".
    child.on("error", () => resolve(null));
  });

  const handle = {
    url: "",
    logs,
    exited,
    async stop() {
      if (child.exitCode !== null) {
        return;
      }
      if (child.stdin?.writable) {
        child.stdin.write("q\n");
      }
      await Promise.race([
        exited,
        new Promise((resolve) => setTimeout(resolve, 5_000)),
      ]);
      if (child.exitCode === null) {
        child.kill("SIGKILL");
        await exited;
      }
    },
  } satisfies WebServerPreview;

  return new Promise<WebServerPreview>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(
        new WebServerPreviewError(
          `flutter run -d web-server did not report a served URL within ${serveTimeoutMs}ms; last output:\n${logs.slice(-20).join("\n")}`,
        ),
      );
    }, serveTimeoutMs);

    const finishRejected = (message: string): void => {
      if (handle.url === "") {
        clearTimeout(timer);
        reject(new WebServerPreviewError(message));
      }
    };

    void exited.then((code) => {
      finishRejected(
        `flutter run -d web-server exited with code ${code ?? "null"} before serving:\n${logs.slice(-20).join("\n")}`,
      );
    });

    child.on("error", (error) => {
      finishRejected(`flutter run -d web-server failed to start: ${error.message}`);
    });

    const checkForUrl = (): void => {
      if (handle.url !== "") {
        return;
      }
      const url = extractServedUrl(logs);
      if (url) {
        handle.url = url;
        clearTimeout(timer);
        resolve(handle);
      }
    };

    const originalCapture = capture;
    const checkWrappedCapture = (chunk: string): void => {
      originalCapture(chunk);
      checkForUrl();
    };
    child.stdout?.off("data", capture);
    child.stderr?.off("data", capture);
    child.stdout?.on("data", checkWrappedCapture);
    child.stderr?.on("data", checkWrappedCapture);

    checkForUrl();
  });
}