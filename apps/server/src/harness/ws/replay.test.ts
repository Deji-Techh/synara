// FILE: replay.test.ts
// Purpose: E15 gate — a fresh subscriber receives the durable event tail
// after the subscribed ack (reconnect rebuild without projections).

import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import type { HarnessEvent } from "@caide/contracts";
import { SessionStorage } from "../session/storage.ts";
import { appendHarnessEvent, flushTurnTokens, setEventLogStorage } from "../turn/eventLog.ts";
import { HarnessWebSocketServer } from "./server.ts";

describe("harness subscribe replay (e15)", () => {
  let server: http.Server;
  let wsServer: HarnessWebSocketServer;
  let port: number;

  beforeEach(async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-replay-"));
    setEventLogStorage(new SessionStorage({ baseDir: dir, debounceMs: 1 }));
    server = http.createServer();
    wsServer = new HarnessWebSocketServer();
    server.on("upgrade", (req, socket, head) => wsServer.handleUpgrade(req, socket, head));
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        port = (server.address() as { port: number }).port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    setEventLogStorage(null);
    await wsServer.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("replays the event tail to a new subscriber", async () => {
    const sid = `s-replay-${Date.now()}`;
    await appendHarnessEvent({ type: "turn_start", sessionId: sid, turnId: "t1", prompt: "hi" });
    await appendHarnessEvent({ type: "token", sessionId: sid, content: "hello" });
    await flushTurnTokens(sid);

    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise<void>((resolve) => ws.on("open", () => resolve()));
    const received: HarnessEvent[] = [];
    const done = new Promise<void>((resolve) => {
      ws.on("message", (data) => {
        const parsed = JSON.parse(data.toString()) as HarnessEvent | { type: string };
        if (parsed.type === "subscribed") return;
        received.push(parsed as HarnessEvent);
        if (received.length >= 2) resolve();
      });
    });
    ws.send(JSON.stringify({ type: "subscribe", sessionId: sid }));
    await Promise.race([done, new Promise((_, reject) => setTimeout(() => reject(new Error("replay timeout")), 2000))]);
    expect(received.map((e) => e.type)).toEqual(["turn_start", "token"]);
    expect((received[1] as { content: string }).content).toBe("hello");
    ws.close();
  });
});
