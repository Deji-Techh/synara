// FILE: tunnelProtocol.test.ts
// Purpose: Tunnel wire-protocol helpers (donor test parity).

import { describe, expect, it } from "vitest";
import {
  WS_FRAME_CHUNK_BYTES,
  extractSubprotocols,
  frame,
  sanitizeOriginHeaders,
  sanitizeServerHeaders,
  toBase64Chunks,
  wsControlUrl,
  wsSecondaryUrl,
} from "./tunnelProtocol.ts";

describe("tunnel protocol helpers", () => {
  it("builds the control WebSocket URL with an https base", () => {
    expect(wsControlUrl("https://caide-preview-api.onrender.com", "tok x")).toBe(
      "wss://caide-preview-api.onrender.com/v1/tunnels/ws?token=tok%20x",
    );
  });

  it("builds the secondary WebSocket URL with tunnel id, token, and stream", () => {
    expect(
      wsSecondaryUrl(
        "https://caide-preview-api.onrender.com",
        "tunnel-1",
        "secret",
        "stream-9",
      ),
    ).toBe(
      "wss://caide-preview-api.onrender.com/v1/tunnels/ws/tunnel-1?token=secret&stream=stream-9",
    );
  });

  it("drops hop-by-hop and host/content-length headers when sanitizing server headers", () => {
    const clean = sanitizeServerHeaders({
      host: "caide-preview-api.onrender.com",
      connection: "keep-alive",
      "transfer-encoding": "chunked",
      upgrade: "websocket",
      "content-length": "12",
      "user-agent": "curl/8",
      cookie: "a=1",
    });
    expect(clean).toEqual({ "user-agent": "curl/8", cookie: "a=1" });
  });

  it("keeps string-array headers and converts number-valued origin headers", () => {
    const clean = sanitizeOriginHeaders({
      connection: "close",
      "content-type": "text/html",
      "x-tag": ["a", "b"],
      "x-count": 123,
    });
    expect(clean).toEqual({
      "content-type": "text/html",
      "x-tag": ["a", "b"],
      "x-count": "123",
    });
  });

  it("drops non-string/non-array values from server headers", () => {
    const clean = sanitizeServerHeaders({ "x-weird": { nested: true } });
    expect(clean).toEqual({});
  });

  it("extracts subprotocols from a comma-separated header", () => {
    expect(extractSubprotocols({ "sec-websocket-protocol": "chat, super, chat" })).toEqual([
      "chat",
      "super",
      "chat",
    ]);
    expect(extractSubprotocols(undefined)).toEqual([]);
  });

  it("chunks a large buffer into bounded base64 frames", () => {
    const buffer = Buffer.alloc(WS_FRAME_CHUNK_BYTES + 7, 0xab);
    const chunks = toBase64Chunks(buffer);
    expect(chunks).toHaveLength(2);
    expect(Buffer.from(chunks[0], "base64")).toHaveLength(WS_FRAME_CHUNK_BYTES);
    expect(Buffer.from(chunks[1], "base64")).toHaveLength(7);
    expect(Buffer.concat(chunks.map((c) => Buffer.from(c, "base64")))).toEqual(buffer);
  });

  it("serializes a frame deterministically", () => {
    expect(frame({ type: "pong" })).toBe('{"type":"pong"}');
  });
});
