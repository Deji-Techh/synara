// FILE: harnessGatewayMount.test.ts
// Purpose: Mount upgrade routing: /harness upgrades reach the WS server,
// other paths and bad tokens do not.

import * as http from "node:http";
import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { HARNESS_WS_PATH, mountHarnessGateway } from "./harnessGatewayMount.ts";

function fakeNodeServer() {
  const emitter = new EventEmitter() as EventEmitter & {
    off: (event: string, listener: (...args: never[]) => void) => void;
  };
  return emitter as unknown as http.Server;
}

describe("harness gateway mount", () => {
  it("upgrades only the harness path with a valid token", () => {
    const nodeServer = fakeNodeServer();
    const { close } = mountHarnessGateway(nodeServer, { authToken: "secret" });
    const handlers = (nodeServer as unknown as EventEmitter).listeners("upgrade");
    expect(handlers).toHaveLength(1);
    const handle = handlers[0] as (req: unknown, socket: unknown, head: unknown) => void;

    const destroyed: string[] = [];
    const socketFor = (id: string) => ({ destroy: () => destroyed.push(id) }) as never;

    // Wrong path: ignored (no destroy, no upgrade).
    handle({ url: "/other?token=secret" }, socketFor("other"), Buffer.alloc(0));
    expect(destroyed).toEqual([]);

    // Right path, wrong token: destroyed.
    handle({ url: `${HARNESS_WS_PATH}?token=nope` }, socketFor("bad"), Buffer.alloc(0));
    expect(destroyed).toEqual(["bad"]);

    close();
    expect((nodeServer as unknown as EventEmitter).listeners("upgrade")).toHaveLength(0);
  });

  it("is open without an auth token (local dev)", () => {
    const nodeServer = fakeNodeServer();
    const { close } = mountHarnessGateway(nodeServer, {});
    const handlers = (nodeServer as unknown as EventEmitter).listeners("upgrade");
    expect(handlers).toHaveLength(1);
    close();
  });
});
