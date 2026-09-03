// FILE: harnessGatewayMount.ts
// Purpose: Mount the harness WebSocket endpoint (/harness) on the raw node
// HTTP server owned by the Effect bootstrap. Same loopback legacy-token
// compatibility as the device-frame socket: open when no auth token is
// configured, or when ?token= matches it; otherwise the socket is destroyed.
// Detach on server shutdown via the returned close().

import type http from "node:http";
import type { Duplex } from "node:stream";
import { HarnessWebSocketServer } from "./ws/server.ts";
import { sharedTurnGateway } from "./turn/gateway.ts";

export const HARNESS_WS_PATH = "/harness";

export function mountHarnessGateway(
  nodeServer: http.Server,
  options: { authToken?: string | null } = {},
): { close: () => void } {
  const wsServer = new HarnessWebSocketServer();
  const gateway = sharedTurnGateway();
  gateway.attachWs(wsServer);

  const onUpgrade = (req: http.IncomingMessage, socket: Duplex, head: Buffer): void => {
    let pathname = "";
    let token: string | null = null;
    try {
      const url = new URL(req.url ?? "", "http://localhost");
      pathname = url.pathname;
      token = url.searchParams.get("token");
    } catch {
      return;
    }
    if (pathname !== HARNESS_WS_PATH) return;
    if (options.authToken && token !== options.authToken) {
      socket.destroy();
      return;
    }
    wsServer.handleUpgrade(req, socket, head);
  };

  nodeServer.on("upgrade", onUpgrade);
  return {
    close: () => {
      nodeServer.off("upgrade", onUpgrade);
      gateway.detachWs();
      void wsServer.close();
    },
  };
}
