// FILE: src/electron-shim.ts
// Purpose: Headless stand-in for the Electron main-process API so the dyad
// backend can run inside the Caide engine (a plain Node process). Only the
// surfaces the imported backend actually touches are implemented:
//   - `ipcMain.handle`/`on`/`once` → local registries the engine dispatches
//     through (JSON-RPC `dyad.invoke` in, `dyad.event` notifications out)
//   - `app.getPath`/`getAppPath` → engine-owned data dir (CAIDE_ENGINE_DATA_DIR)
//   - `safeStorage` → reversible obfuscation (plaintext in engine session;
//     server forwards secrets at initialize in later milestones)
//   - `BrowserWindow.getAllWindows()` → a single fake window whose
//     `webContents.send` routes into the in-process event bus, which the
//     engine entry re-emits as JSON-RPC notifications
//   - `utilityProcess.fork` → real child_process.fork message bridge
// Everything else is a best-effort stub that logs instead of crashing.

import { EventEmitter } from "node:events";
import { fork as nodeFork } from "node:child_process";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";
import log from "electron-log";

import { emit as emitEventBus } from "./ipc/utils/event_bus";

const ENGINE_DATA_DIR =
  process.env.CAIDE_ENGINE_DATA_DIR ??
  path.join(process.env.HOME ?? process.cwd(), ".caide", "engine");
const ENGINE_APP_DIR =
  process.env.CAIDE_ENGINE_APP_PATH ??
  path.dirname(fileURLToPath(import.meta.url));

export interface WebContentsLike {
  readonly id: number;
  isDestroyed(): boolean;
  isCrashed?: () => boolean;
  send(channel: string, ...args: unknown[]): void;
}

export type WebContents = WebContentsLike;

export interface IpcMainInvokeEvent {
  readonly sender: WebContentsLike;
  readonly processId: number;
  readonly frameId: number;
}

let nextSenderId = 1;

class SenderShim implements WebContentsLike {
  readonly id = nextSenderId++;
  isDestroyed(): boolean {
    return false;
  }
  send(channel: string, ...args: unknown[]): void {
    if (args.length === 1) {
      emitEventBus(channel, args[0]);
    } else if (args.length > 1) {
      emitEventBus(channel, args);
    }
  }
}

const INVOKE_HANDLERS = new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>();
const EVENT_LISTENERS = new EventEmitter();
EVENT_LISTENERS.setMaxListeners(0);

export const ipcMain = {
  handle(channel: string, fn: (event: IpcMainInvokeEvent, ...args: any[]) => any): void {
    INVOKE_HANDLERS.set(channel, fn);
  },
  removeHandler(channel: string): void {
    INVOKE_HANDLERS.delete(channel);
  },
  on(channel: string, fn: (...args: any[]) => void): void {
    EVENT_LISTENERS.on(channel, fn);
  },
  once(channel: string, fn: (...args: any[]) => void): void {
    EVENT_LISTENERS.once(channel, fn);
  },
  removeListener(channel: string, fn: (...args: any[]) => void): void {
    EVENT_LISTENERS.removeListener(channel, fn);
  },
  removeAllListeners(channel: string): void {
    EVENT_LISTENERS.removeAllListeners(channel);
  },
  off(channel: string, fn: (...args: any[]) => void): void {
    EVENT_LISTENERS.off(channel, fn);
  },
  // Engine-internal: deliver a renderer→main round-trip response.
  _emit(channel: string, ...args: unknown[]): boolean {
    return EVENT_LISTENERS.emit(channel, ...args);
  },
  // Engine-internal: lookup used by the JSON-RPC dispatcher.
  _handlers: INVOKE_HANDLERS,
};

type AppQuitHandler = () => void;
const quitHandlers = new Set<AppQuitHandler>();

export const app = {
  getPath(name: string): string {
    if (name === "userData" || name === "sessionData" || name === "appData") {
      return ENGINE_DATA_DIR;
    }
    if (name === "temp") {
      return process.env.TMPDIR ?? "/tmp";
    }
    if (name === "home") {
      return process.env.HOME ?? process.cwd();
    }
    log.warn(`electron-shim: app.getPath("${name}") → engine data dir`);
    return ENGINE_DATA_DIR;
  },
  getAppPath(): string {
    return ENGINE_APP_DIR;
  },
  getName(): string {
    return "caide-engine";
  },
  getVersion(): string {
    return "0.1.0";
  },
  getLocale(): string {
    return process.env.LANG ?? "en-US";
  },
  isPackaged: false,
  isReady(): boolean {
    return true;
  },
  getAppMetrics(): Array<{
    type?: string;
    pid?: number;
    memory?: { workingSetSize?: number; peakWorkingSetSize?: number; privateBytes?: number; sharedBytes?: number };
    creationTime?: number;
    name?: string;
    serviceName?: string;
    cpu?: { percentCPUUsage?: number; idleWakeupsPerSecond?: number };
  }> {
    return [];
  },
  relaunch(): void {
    log.info("electron-shim: app.relaunch() → not spawned by engine itself; supervisor manages respawn");
  },
  quit(): void {
    log.info("electron-shim: app.quit() → exiting engine");
    process.exit(0);
  },
  exit(code = 0): void {
    process.exit(code);
  },
  once(event: string, fn: (...args: any[]) => void): void {
    if (event === "before-quit" || event === "will-quit") {
      quitHandlers.add(fn);
    }
  },
  on(event: string, fn: (...args: any[]) => void): void {
    quitHandlers.add(fn);
  },
  whenReady(): Promise<void> {
    return Promise.resolve();
  },
  async _fireQuitHandlers(): Promise<void> {
    for (const fn of quitHandlers) {
      try {
        await fn();
      } catch (error) {
        log.warn("electron-shim: quit handler failed:", error);
      }
    }
  },
};

export const dialog = {
  async showOpenDialog(
    _options?: Record<string, any>,
  ): Promise<{ canceled: boolean; filePaths: string[] }> {
    log.warn("electron-shim: dialog.showOpenDialog is unavailable in headless engine");
    return { canceled: true, filePaths: [] };
  },
  async showSaveDialog(
    _options?: Record<string, any>,
  ): Promise<{ canceled: boolean; filePath?: string }> {
    log.warn("electron-shim: dialog.showSaveDialog is unavailable in headless engine");
    return { canceled: true, filePath: undefined };
  },
  async showMessageBox(
    _options?: Record<string, any>,
  ): Promise<{ response: number; checkboxChecked: boolean }> {
    log.warn("electron-shim: dialog.showMessageBox is unavailable in headless engine");
    return { response: 1, checkboxChecked: false };
  },
  async showErrorBox(): Promise<void> {},
};

function openWithSystemDefault(target: string): void {
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  if (opener === "start") {
    // `start` is a shell builtin; best-effort via cmd
    void import("node:child_process").then(({ execFile }) => {
      execFile("cmd", ["/c", "start", "", target], () => {});
    });
    return;
  }
  void import("node:child_process").then(({ execFile }) => {
    execFile(opener, [target], () => {});
  });
}

export const shell = {
  async openExternal(url: string): Promise<void> {
    openWithSystemDefault(url);
  },
  async openPath(fullPath: string): Promise<string> {
    openWithSystemDefault(fullPath);
    return "";
  },
  async showItemInFolder(fullPath: string): Promise<void> {
    openWithSystemDefault(path.dirname(fullPath));
  },
  async trashItem(): Promise<void> {
    log.warn("electron-shim: shell.trashItem is a no-op");
  },
};

export const safeStorage = {
  isEncryptionAvailable(): boolean {
    return true;
  },
  encryptString(plaintext: string): Buffer {
    return Buffer.from(plaintext, "utf8");
  },
  decryptString(encrypted: Buffer): string {
    return encrypted.toString("utf8");
  },
};

class FakeWebContents extends SenderShim {
  on(_event: string, _listener: (...args: any[]) => void): this {
    return this;
  }
  once(_event: string, _listener: (...args: any[]) => void): this {
    return this;
  }
  isCrashed(): boolean {
    return false;
  }
  async capturePage(): Promise<{
    isEmpty(): boolean;
    toPNG(): Buffer;
    getSize(): { width: number; height: number };
  }> {
    return {
      isEmpty: () => true,
      toPNG: () => Buffer.alloc(0),
      getSize: () => ({ width: 0, height: 0 }),
    };
  }
}

class FakeBrowserWindow {
  readonly webContents = new FakeWebContents();
  isDestroyed(): boolean {
    return false;
  }
  hide(): void {}
  reload(): void {}
  on(_event: string, _listener: (...args: any[]) => void): this {
    return this;
  }
  once(_event: string, _listener: (...args: any[]) => void): this {
    return this;
  }
  close(): void {}
}

export class BrowserWindow extends FakeBrowserWindow {
  static getAllWindows(): BrowserWindow[] {
    return [new BrowserWindow()];
  }
  static getFocusedWindow(): BrowserWindow | null {
    return null;
  }
  static fromWebContents(_webContents?: any): BrowserWindow {
    return new BrowserWindow();
  }
  constructor() {
    super();
    // Created windows are discarded; all sends route through the fake one.
  }
}

export interface UtilityProcessLike {
  readonly pid: number;
  on(
    event: "message" | "exit" | "spawn" | "error",
    listener: (...args: any[]) => void,
  ): void;
  postMessage(message: any): void;
  kill(): boolean;
}

export const utilityProcess = {
  fork(modulePath: string, args: string[] = [], _options?: unknown): UtilityProcessLike {
    const child = nodeFork(modulePath, args as string[], {
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      env: process.env,
    });
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0);
    child.on("message", (message) => emitter.emit("message", message));
    child.on("exit", (code, signal) => emitter.emit("exit", code, signal));
    child.on("error", (error) => emitter.emit("error", error));
    child.once("spawn", () => emitter.emit("spawn"));
    return {
      pid: child.pid ?? 0,
      on: emitter.on.bind(emitter),
      postMessage(message) {
        try {
          child.send(message);
        } catch {
          // Worker already gone — same failure surface as Electron.
        }
      },
      kill() {
        child.kill();
        return true;
      },
    };
  },
};

class ShimmerNotification {
  constructor(_options: { title?: string; body?: string } = {}) {}
  show(): void {
    log.info("electron-shim: notification shown (headless)");
  }
  close(): void {}
  static isSupported(): boolean {
    return true;
  }
}
export { ShimmerNotification as Notification };

export const Menu = {
  setApplicationMenu(_menu?: any): void {},
  buildFromTemplate(_template?: any): unknown {
    return {};
  },
};

class ShimmerTray {
  constructor(_options?: any) {}
  on(_event: string, _listener: (...args: any[]) => void): this {
    return this;
  }
  setToolTip(_toolTip?: any): void {}
  setContextMenu(_menu?: any): void {}
  destroy(): void {}
}
export { ShimmerTray as Tray };

export const clipboard = {
  writeText(): void {},
  readText(): string {
    return "";
  },
  writeImage(): void {},
  readImage(): { isEmpty(): boolean; toPNG(): Buffer; getSize(): { width: number; height: number } } {
    return { isEmpty: () => true, toPNG: () => Buffer.alloc(0), getSize: () => ({ width: 0, height: 0 }) };
  },
};

function decodeDataUrl(dataUrl: string): Buffer | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    return null;
  }
  try {
    return Buffer.from(match[2], "base64");
  } catch {
    return null;
  }
}

class ShimNativeImage {
  constructor(private readonly buffer: Buffer | null = null) {}
  isEmpty(): boolean {
    return !this.buffer || this.buffer.length === 0;
  }
  getSize(): { width: number; height: number } {
    if (!this.buffer) {
      return { width: 0, height: 0 };
    }
    // Minimal PNG header parse (IHDR width/height), defaults preserved on failure.
    const width = this.buffer.readUInt32BE(16);
    const height = this.buffer.readUInt32BE(20);
    return Number.isFinite(width) && Number.isFinite(height) && width > 0
      ? { width, height }
      : { width: 0, height: 0 };
  }
  toPNG(): Buffer {
    return this.buffer ?? Buffer.alloc(0);
  }
  resize(_options?: unknown): ShimNativeImage {
    return new ShimNativeImage(this.buffer);
  }
}

export const nativeImage = {
  createFromPath(): ShimNativeImage {
    log.warn("electron-shim: nativeImage.createFromPath is a stub");
    return new ShimNativeImage();
  },
  createFromDataURL(dataUrl: string): ShimNativeImage {
    return new ShimNativeImage(decodeDataUrl(dataUrl));
  },
  createEmpty(): ShimNativeImage {
    return new ShimNativeImage();
  },
};

interface ShimmerNetRequest extends EventEmitter {
  end(chunk?: unknown): void;
  abort(): void;
}

export const net = {
  request(url: string): ShimmerNetRequest {
    const target = new URL(url);
    const mod = target.protocol === "https:" ? https : http;
    const outer = new EventEmitter() as ShimmerNetRequest;
    const inner = mod.request(target, (response) => {
      outer.emit("response", response);
    });
    inner.on("error", (error) => {
      outer.emit("error", error);
    });
    outer.end = (chunk?: unknown) => {
      inner.end(chunk as any);
    };
    outer.abort = () => {
      inner.destroy();
    };
    return outer;
  },
};

export const session = {
  defaultSession: {
    webRequest: { onBeforeSendHeaders: () => {}, onHeadersReceived: () => {} },
  },
};

export type { UtilityProcessLike as UtilityProcess };