// FILE: capture.ts
// Purpose: Headless screenshot capture for preview URLs (item 1).
// Dependency-free CDP: spawns system Chrome headless, opens the URL as a
// fresh page target (/json/new), drives Page.captureScreenshot over a raw
// WebSocket, kills the browser. No Playwright/puppeteer dependency; binary
// override via CAIDE_CHROME_PATH.

import { spawn, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { WebSocket } from "ws";

export class CaptureUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaptureUnavailableError";
  }
}

export interface CapturedShot {
  base64: string;
  width: number;
  height: number;
}

function resolveChromeBinary(): string {
  const override = process.env.CAIDE_CHROME_PATH?.trim();
  if (override) return override;
  for (const candidate of [
    "/opt/google/chrome/chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ]) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // try next
    }
  }
  return "google-chrome";
}

function parsePngDimensions(png: Buffer): { width: number; height: number } | null {
  if (png.length < 33) return null;
  if (png.readUInt32BE(0) !== 0x89504e47 || png.readUInt32BE(4) !== 0x0d0a1a0a) return null;
  if (png.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function putJson(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "PUT", signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
    return (await res.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

interface PageSession {
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  onEvent(method: string, handler: () => void): void;
  close(): void;
}

function connectPageDebugger(endpoint: string, timeoutMs: number): Promise<PageSession> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(endpoint, { handshakeTimeout: timeoutMs });
    let nextId = 1;
    const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
    const listeners = new Map<string, Array<() => void>>();
    let settled = false;
    const failAll = (err: Error) => {
      if (settled) return;
      settled = true;
      for (const [, p] of pending) {
        clearTimeout(p.timer);
        p.reject(err);
      }
      pending.clear();
      try {
        ws.close();
      } catch {
        // already closed
      }
    };
    ws.on("open", () => {
      resolve({
        send: (method, params) =>
          new Promise<unknown>((res, rej) => {
            const id = nextId++;
            const timer = setTimeout(() => {
              pending.delete(id);
              rej(new Error(`CDP ${method} timed out`));
            }, timeoutMs);
            pending.set(id, { resolve: res, reject: rej, timer });
            ws.send(JSON.stringify({ id, method, params: params ?? {} }), (err) => {
              if (err) {
                clearTimeout(timer);
                pending.delete(id);
                rej(err);
              }
            });
          }),
        onEvent: (method, handler) => {
          const list = listeners.get(method) ?? [];
          list.push(handler);
          listeners.set(method, list);
        },
        close: () => {
          settled = true;
          try {
            ws.close();
          } catch {
            // already closed
          }
        },
      });
    });
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(String(data)) as { id?: number; method?: string; result?: unknown; error?: { message?: string } };
        if (typeof msg.id === "number") {
          const p = pending.get(msg.id);
          if (!p) return;
          pending.delete(msg.id);
          clearTimeout(p.timer);
          if (msg.error) p.reject(new Error(msg.error.message ?? "CDP error"));
          else p.resolve(msg.result);
          return;
        }
        if (typeof msg.method === "string") {
          for (const handler of listeners.get(msg.method) ?? []) {
            try {
              handler();
            } catch {
              // listener errors never break the session
            }
          }
        }
      } catch {
        // protocol noise — ignore
      }
    });
    ws.on("error", (err) => failAll(err instanceof Error ? err : new Error(String(err))));
    ws.on("close", () => failAll(new Error("CDP connection closed")));
  });
}

function waitFor(predicate: () => boolean, timeoutMs: number, intervalMs = 100): Promise<void> {
  const start = Date.now();
  const poll = (resolve: () => void, reject: (err: Error) => void) => {
    let done = false;
    try {
      done = predicate();
    } catch {
      done = false;
    }
    if (done) {
      resolve();
      return;
    }
    if (Date.now() - start > timeoutMs) {
      reject(new Error("Timed out waiting for condition"));
      return;
    }
    setTimeout(() => poll(resolve, reject), intervalMs);
  };
  return new Promise(poll);
}

/**
 * Capture a PNG screenshot of a URL at the given viewport. Throws
 * CaptureUnavailableError when no Chrome binary exists; other errors
 * propagate as plain Errors.
 */
export async function capturePreviewScreenshot(input: {
  url: string;
  width?: number;
  height?: number;
  timeoutMs?: number;
}): Promise<CapturedShot> {
  const width = input.width ?? 390;
  const height = input.height ?? 844;
  const timeoutMs = input.timeoutMs ?? 45_000;
  const binary = resolveChromeBinary();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-shot-"));
  let child: ChildProcess | null = null;
  try {
    const debugPort = await freePort();
    child = spawn(
      binary,
      [
        `--headless=new`,
        "--disable-gpu",
        "--no-sandbox",
        "--hide-scrollbars",
        `--window-size=${width},${height}`,
        `--remote-debugging-port=${debugPort}`,
        `--user-data-dir=${userDataDir}`,
        "about:blank",
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let spawnError: Error | null = null;
    child.on("error", (err) => {
      spawnError = err;
    });
    child.stderr?.on("data", () => {});
    // Wait for the DevTools endpoint to answer.
    const endpoint = `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(input.url)}`;
    let target: { webSocketDebuggerUrl?: string } | null = null;
    const start = Date.now();
    for (;;) {
      if (spawnError) {
        throw new CaptureUnavailableError(
          `No Chrome binary available for screenshots (${spawnError.message}). Set CAIDE_CHROME_PATH to a Chrome/Chromium executable.`,
        );
      }
      try {
        target = (await putJson(endpoint, 2000)) as { webSocketDebuggerUrl?: string };
        if (target?.webSocketDebuggerUrl) break;
      } catch {
        // not up yet
      }
      if (Date.now() - start > 15_000) {
        throw new CaptureUnavailableError(
          "Chrome DevTools endpoint never answered — set CAIDE_CHROME_PATH to a working Chrome/Chromium executable.",
        );
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    const session = await connectPageDebugger(target.webSocketDebuggerUrl as string, 15_000);
    try {
      await session.send("Page.enable");
      await session.send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 2,
        mobile: true,
      });
      let loaded = false;
      session.onEvent("Page.loadEventFired", () => {
        loaded = true;
      });
      await session.send("Page.navigate", { url: input.url });
      try {
        await waitFor(() => loaded, Math.min(timeoutMs, 20_000));
      } catch {
        // fall through — capture whatever rendered (SPA shells, slow dev servers)
      }
      await new Promise((r) => setTimeout(r, 800));
      const shot = (await session.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      })) as { data?: string };
      if (!shot.data) throw new Error("Page.captureScreenshot returned no data.");
      const bytes = Buffer.from(shot.data, "base64");
      const dims = parsePngDimensions(bytes) ?? { width: width * 2, height: height * 2 };
      return { base64: shot.data, width: dims.width, height: dims.height };
    } finally {
      session.close();
    }
  } finally {
    try {
      child?.kill("SIGKILL");
    } catch {
      // already exited
    }
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }
}
