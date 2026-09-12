// FILE: harnessWs.test.ts
// Purpose: Lock in the harness socket contract the send path depends on:
// turn_start sent before OPEN is silently dropped (no queue), so hooks must
// gate diversion on real open state — never on handle existence. Regression
// test for the "message echoes, no reply, no error" dead-send.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectHarnessWs } from "./harnessWs";
import { harnessStore } from "./harnessStore";

const sockets: MockSocket[] = [];

class MockSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = MockSocket.CONNECTING;
  readonly sent: string[] = [];
  onopen: ((event?: unknown) => void) | null = null;
  onmessage: ((event?: { data?: unknown }) => void) | null = null;
  onclose: ((event?: unknown) => void) | null = null;
  onerror: ((event?: unknown) => void) | null = null;

  constructor(readonly url: string) {
    sockets.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockSocket.CLOSED;
    this.onclose?.({});
  }

  open() {
    this.readyState = MockSocket.OPEN;
    this.onopen?.({});
  }

  receive(data: string) {
    this.onmessage?.({ data });
  }
}

const originalWebSocket = globalThis.WebSocket;

beforeEach(() => {
  sockets.length = 0;
  globalThis.WebSocket = MockSocket as unknown as typeof WebSocket;
});

afterEach(() => {
  globalThis.WebSocket = originalWebSocket;
  vi.useRealTimers();
});

describe("harness socket send contract", () => {
  it("subscribes and fires onOpen when the socket opens", () => {
    const onOpen = vi.fn();
    connectHarnessWs({ url: "ws://127.0.0.1:1/harness", sessionId: "s-1", onOpen });
    expect(sockets).toHaveLength(1);
    expect(onOpen).not.toHaveBeenCalled();
    sockets[0]!.open();
    expect(onOpen).toHaveBeenCalledTimes(1);
    const frames = sockets[0]!.sent.map((s) => JSON.parse(s) as { type: string });
    expect(frames[0]).toMatchObject({ type: "subscribe", sessionId: "s-1" });
  });

  it("drops sends while connecting — no queue, no throw", () => {
    const handle = connectHarnessWs({ url: "ws://127.0.0.1:1/harness", sessionId: "s-1" });
    handle.send({ type: "turn_start", sessionId: "s-1", turn: { prompt: "hey" } });
    // Still CONNECTING: nothing hits the wire, and nothing throws.
    expect(sockets[0]!.sent).toHaveLength(0);
    sockets[0]!.open();
    // The pre-open message is gone for good — it is NOT flushed on open.
    const types = sockets[0]!.sent.map((s) => (JSON.parse(s) as { type: string }).type);
    expect(types).not.toContain("turn_start");
    handle.disconnect();
  });

  it("delivers sends while open and fires onClose on close", () => {
    const onClose = vi.fn();
    const handle = connectHarnessWs({
      url: "ws://127.0.0.1:1/harness",
      sessionId: "s-1",
      onClose,
    });
    sockets[0]!.open();
    handle.send({ type: "turn_start", sessionId: "s-1", turn: { prompt: "hey" } });
    const types = sockets[0]!.sent.map((s) => (JSON.parse(s) as { type: string }).type);
    expect(types).toContain("turn_start");
    expect(onClose).not.toHaveBeenCalled();
    sockets[0]!.close();
    expect(onClose).toHaveBeenCalledTimes(1);
    handle.disconnect();
  });

  it("feeds server events into the harness store", async () => {
    connectHarnessWs({ url: "ws://127.0.0.1:1/harness", sessionId: "s-evt" });
    sockets[0]!.open();
    sockets[0]!.receive(
      JSON.stringify({ type: "token", sessionId: "s-evt", content: "hello" }),
    );
    await new Promise((r) => setTimeout(r, 0));
    const tokens = harnessStore.getState().sessions["s-evt"]?.tokens ?? [];
    expect(tokens.join("")).toContain("hello");
  });

  it("decodes binary frames (Blob/ArrayBuffer) instead of dropping them", async () => {
    connectHarnessWs({ url: "ws://127.0.0.1:1/harness", sessionId: "s-bin" });
    sockets[0]!.open();
    const payload = JSON.stringify({ type: "token", sessionId: "s-bin", content: "from-binary" });
    // Browsers deliver binary frames as Blob; some stacks as ArrayBuffer.
    sockets[0]!.onmessage?.({ data: new Blob([payload]) });
    await new Promise((r) => setTimeout(r, 20));
    sockets[0]!.onmessage?.({ data: new TextEncoder().encode(payload).buffer as ArrayBuffer });
    await new Promise((r) => setTimeout(r, 20));
    const tokens = harnessStore.getState().sessions["s-bin"]?.tokens ?? [];
    expect(tokens.join(" ")).toContain("from-binary");
  });
});
