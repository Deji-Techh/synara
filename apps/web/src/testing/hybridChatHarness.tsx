import { render } from "@testing-library/react";
import { setupServer } from "msw/node";
import { ws } from "msw";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { getRouter } from "../router";
import {
  WS_METHODS,
  ORCHESTRATION_WS_METHODS,
  type OrchestrationReadModel,
  type WsWelcomePayload,
  type ServerConfig,
} from "@caide/contracts";
import {
  createShellSnapshotFromReadModel,
  readEffectRpcClientMessage,
  sendEffectRpcChunk,
  flattenEffectRpcRequestPayload,
} from "../test/effectRpcWebSocketMock";

export interface TestFixture {
  snapshot: OrchestrationReadModel;
  welcome: WsWelcomePayload;
  serverConfig: ServerConfig;
}

export function setupHybridChatHarness(fixture: TestFixture) {
  const wsRequests: Array<Record<string, unknown>> = [];
  const wsLink = ws.link(/ws(s)?:\/\/.*/);

  const server = setupServer(
    wsLink.addEventListener("connection", ({ client }) => {
      client.addEventListener("message", (event) => {
        const rawData = event.data;
        if (typeof rawData !== "string") return;
        const parsed = readEffectRpcClientMessage(client, rawData);
        if (parsed.kind !== "request") return;

        const requestBody = flattenEffectRpcRequestPayload(
          parsed.request.tag,
          parsed.request.payload,
        );
        const method = requestBody._tag;
        wsRequests.push(requestBody);

        if (method === WS_METHODS.subscribeServerLifecycle) {
          sendEffectRpcChunk(client, parsed.request.id, {
            type: "welcome",
            payload: fixture.welcome,
          });
          return;
        }
        if (method === WS_METHODS.subscribeServerConfig) {
          sendEffectRpcChunk(client, parsed.request.id, {
            type: "snapshot",
            config: fixture.serverConfig,
          });
          return;
        }
        if (method === ORCHESTRATION_WS_METHODS.subscribeShell) {
          sendEffectRpcChunk(client, parsed.request.id, {
            kind: "snapshot",
            snapshot: createShellSnapshotFromReadModel(fixture.snapshot),
          });
          return;
        }
        if (method === ORCHESTRATION_WS_METHODS.subscribeThreadDetail) {
          const threadId = requestBody.threadId as string;
          const thread = fixture.snapshot.threads.find((t) => t.id === threadId);
          if (thread) {
            sendEffectRpcChunk(client, parsed.request.id, {
              kind: "snapshot",
              snapshot: thread,
            });
          }
          return;
        }
      });
    })
  );

  return {
    server,
    wsRequests,
    mount: (initialEntry = "/chat-1") => {
      const router = getRouter(
        createMemoryHistory({
          initialEntries: [initialEntry],
        })
      );
      
      const renderResult = render(<RouterProvider router={router} />);
      return { ...renderResult, router };
    }
  };
}
