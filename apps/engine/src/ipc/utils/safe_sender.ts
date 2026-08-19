import type { WebContents } from "electron";
import log from "electron-log";

/**
 * Sends an IPC message to the renderer only if the provided `WebContents` is
 * still alive. This prevents `Object has been destroyed` errors that can occur
 * when asynchronous callbacks attempt to communicate after the window has
 * already been closed (e.g. during e2e test teardown).
 *
 * The Caide engine has no renderer: every WebContents is a bus-routing shim,
 * so the `send` call delivers the message to the in-process event bus exactly
 * once (which the engine entry re-emits as a `dyad.event` notification). The
 * engine intentionally does not emit here too — that would duplicate every
 * event for the JSON-RPC relay.
 */
export function safeSend(
  sender: WebContents | null | undefined,
  channel: string,
  ...args: unknown[]
): void {
  if (!sender) return;
  if (sender.isDestroyed()) return;
  // @ts-ignore – `isCrashed` exists at runtime but is not in the type defs
  if (typeof sender.isCrashed === "function" && sender.isCrashed()) return;

  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore – allow variadic args beyond `data`
    sender.send(channel, ...args);
  } catch (error) {
    log.debug(
      `safeSend: failed to send on channel "${channel}" because: ${(error as Error).message}`,
    );
  }
}
