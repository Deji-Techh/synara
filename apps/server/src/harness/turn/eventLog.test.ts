// FILE: eventLog.test.ts
// Purpose: E15 gate — event persistence, token buffering, tail replay
// (isolated storage, no home writes).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import type { HarnessEvent } from "@caide/contracts";
import { SessionStorage } from "../session/storage.ts";
import {
  appendHarnessEvent,
  EVENT_REPLAY_LIMIT,
  flushTurnTokens,
  readHarnessEvents,
  setEventLogStorage,
  tombstoneOrphanedPrompts,
} from "./eventLog.ts";

function isolated(): SessionStorage {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-evt-"));
  const storage = new SessionStorage({ baseDir: dir, debounceMs: 1 });
  setEventLogStorage(storage);
  return storage;
}

describe("harness event log + replay (e15)", () => {
  it("persists non-token events verbatim", async () => {
    const storage = isolated();
    const sid = `s-${Date.now()}-a`;
    await appendHarnessEvent({ type: "turn_start", sessionId: sid, turnId: "t1", prompt: "hi" });
    await appendHarnessEvent({ type: "stage", sessionId: sid, from: "idle", to: "step-0" });
    await storage.flush(sid);
    const events = await readHarnessEvents(sid);
    expect(events.map((e) => e.type)).toEqual(["turn_start", "stage"]);
    setEventLogStorage(null);
  });

  it("buffers token deltas into one transcript chunk per flush", async () => {
    const storage = isolated();
    const sid = `s-${Date.now()}-b`;
    await appendHarnessEvent({ type: "token", sessionId: sid, content: "hel" });
    await appendHarnessEvent({ type: "token", sessionId: sid, content: "lo" });
    await appendHarnessEvent({ type: "stage", sessionId: sid, from: "step-0", to: "step-1" });
    await flushTurnTokens(sid);
    await storage.flush(sid);
    const events = await readHarnessEvents(sid);
    const tokens = events.filter((e) => e.type === "token");
    expect(tokens).toHaveLength(1);
    expect((tokens[0] as { content: string }).content).toBe("hello");
    setEventLogStorage(null);
  });

  it("caps replay at the limit and reads nothing unknown", async () => {
    const storage = isolated();
    const sid = `s-${Date.now()}-c`;
    for (let i = 0; i < EVENT_REPLAY_LIMIT + 10; i++) {
      const event: HarnessEvent = { type: "stage", sessionId: sid, from: `s${i}`, to: `s${i + 1}` };
      await appendHarnessEvent(event);
    }
    await storage.flush(sid);
    const events = await readHarnessEvents(sid);
    expect(events).toHaveLength(EVENT_REPLAY_LIMIT);
    expect(events[0]).toMatchObject({ from: `s10` });
    expect(await readHarnessEvents(`missing-${Date.now()}`)).toEqual([]);
    setEventLogStorage(null);
  });

  it("boot sweep tombstones orphaned prompts but keeps settled ones", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-sweep-"));
    const storage = new SessionStorage({ baseDir: dir, debounceMs: 1 });
    setEventLogStorage(storage);
    process.env.CAIDE_SESSIONS_DIR = dir;
    try {
      const sid = `s-sweep-${Date.now()}`;
      const line = (data: unknown, seq: number) =>
        JSON.stringify({
          id: `${sid}-${seq}`,
          parentUuid: null,
          sessionId: sid,
          seq,
          time: 1000 + seq,
          type: "harness/event",
          data,
        });
      fs.writeFileSync(
        path.join(dir, `${sid}.jsonl`),
        [
          line(
            {
              type: "ui_prompt",
              sessionId: sid,
              requestId: "r-orphan",
              kind: "questionnaire",
              payload: {},
            },
            0,
          ),
          line(
            {
              type: "ui_prompt",
              sessionId: sid,
              requestId: "r-settled",
              kind: "questionnaire",
              payload: {},
            },
            1,
          ),
          line({ type: "ui_prompt_withdraw", sessionId: sid, requestId: "r-settled" }, 2),
        ].join("\n") + "\n",
      );
      const count = await tombstoneOrphanedPrompts();
      expect(count).toBe(1);
      await storage.flush(sid);
      const events = await readHarnessEvents(sid);
      const withdraws = events.filter((e) => e.type === "ui_prompt_withdraw");
      expect(withdraws.map((e) => (e as { requestId: string }).requestId).sort()).toEqual([
        "r-orphan",
        "r-settled",
      ]);
    } finally {
      delete process.env.CAIDE_SESSIONS_DIR;
      setEventLogStorage(null);
    }
  });
});
