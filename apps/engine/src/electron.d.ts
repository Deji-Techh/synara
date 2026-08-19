// Global type shims for the headless engine. The dyad backend references the
// `Electron` namespace and a handful of untyped modules; these declarations
// keep `tsc` honest about intent without pulling in the real electron types.

declare namespace Electron {
  export interface IpcMainInvokeEvent {
    readonly sender: any;
    readonly processId: number;
    readonly frameId: number;
  }
  export interface WebContents {
    send(channel: string, ...args: unknown[]): void;
    isDestroyed(): boolean;
  }
  export interface BrowserWindow {
    webContents: WebContents;
    isDestroyed(): boolean;
  }
  export namespace app {
    function on(event: string, listener: (...args: any[]) => void): void;
  }
}

declare module "kill-port" {
  export default function killPort(
    port: number,
    opts?: { method?: "tcp" | "udp"; host?: string },
  ): Promise<void>;
}
