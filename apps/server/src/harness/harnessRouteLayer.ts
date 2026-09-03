// FILE: harnessRouteLayer.ts
// Purpose: Mount GET /harness on the Effect upgrade pipeline (same one as
// RPC/device-frame), driving the shared harness hub. Loopback legacy-token
// rule mirrors the device-frame socket: open when no auth token is
// configured, or when ?token= matches it.

import { Effect, Layer } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { ServerConfig } from "../config.ts";
import { sharedHarnessHub, type HarnessClientSender } from "./ws/hub.ts";

export const HARNESS_WS_PATH = "/harness";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const makeHarnessRouteLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    const router = yield* HttpRouter.HttpRouter;
    yield* router.add(
      "GET",
      HARNESS_WS_PATH,
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const config = yield* ServerConfig;
        const url = HttpServerRequest.toURL(request);
        const token = url?.searchParams.get("token");
        if (config.authToken && token !== config.authToken) {
          return HttpServerResponse.text("Forbidden", { status: 403 });
        }

        const socket = yield* request.upgrade;
        const writer = yield* socket.writer;
        const hub = sharedHarnessHub();
        let release: (() => void) | null = null;
        let closed = false;
        const sender: HarnessClientSender = {
          sendText: (text: string) => {
            if (closed) return;
            void Effect.runPromise(writer(textEncoder.encode(text))).catch(() => undefined);
          },
          isOpen: () => !closed,
        };
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            closed = true;
            release?.();
            release = null;
          }),
        );
        yield* socket.run((message) => {
          const text =
            typeof message === "string"
              ? message
              : message instanceof Uint8Array
                ? textDecoder.decode(message)
                : null;
          if (text === null) return;
          try {
            const parsed = JSON.parse(text) as { type?: string; sessionId?: string };
            if (parsed.type === "subscribe" && parsed.sessionId) {
              release?.();
              release = hub.addClient(parsed.sessionId, sender);
              return;
            }
          } catch {
            // fall through to hub dispatch (handles malformed safely)
          }
          hub.handleText(sender, text);
        });
        return HttpServerResponse.empty();
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.as(
            Effect.logDebug("harness socket closed", { cause: String(cause) }),
            HttpServerResponse.empty(),
          ),
        ),
      ),
    );
  }),
);
