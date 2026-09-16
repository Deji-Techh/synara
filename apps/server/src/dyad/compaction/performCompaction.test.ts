// FILE: performCompaction.test.ts
// Purpose: Compaction service: floor behavior, boundary persistence, backup,
// pending flag lifecycle.

import { describe, expect, it } from "vitest";
import {
  clearCompactionPending,
  historyText,
  isCompactionPending,
  lastTurnStartSeq,
  performCompaction,
  setCompactionPending,
} from "./performCompaction.ts";
import { SessionStorage } from "../../harness/session/storage.ts";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

function memoryStorage(): SessionStorage {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-pc-"));
  return new SessionStorage({ baseDir: dir, debounceMs: 0 });
}

const LONG = `user did the thing with the widget.\n${"detail ".repeat(200)}`;

describe("performCompaction", () => {
  it("refuses short history (donor empty-clear path)", async () => {
    const storage = memoryStorage();
    const out = await performCompaction({
      sessionId: "s-short",
      storage,
      history: [{ role: "user", content: "hi" }],
      coveredThroughSeq: 4,
      summarize: async () => "SUMMARY",
    });
    expect(out).toBeNull();
  });

  it("summarizes, persists boundary + backup, and caps output", async () => {
    const storage = memoryStorage();
    const app = fs.mkdtempSync(path.join(os.tmpdir(), "caide-pc-app-"));
    const out = await performCompaction({
      sessionId: "s-full",
      appPath: app,
      storage,
      history: [
        { role: "user", content: LONG },
        { role: "assistant", content: LONG },
      ],
      coveredThroughSeq: 41,
      summarize: async () => `S${"u".repeat(9000)}`,
    });
    expect(out).not.toBeNull();
    expect(out?.summary.length).toBeLessThanOrEqual(6000);
    expect(out?.coveredThroughSeq).toBe(41);
    expect(out?.backupPath).toMatch(/compaction-.*\.md$/);
    const entries = await storage.readEntries("s-full");
    const summary = entries.find((e) => e.type === "compaction/summary");
    expect((summary?.data as { coveredThroughSeq?: number })?.coveredThroughSeq).toBe(41);
  });

  it("falls back to extractive summary without a summarizer", async () => {
    const storage = memoryStorage();
    const out = await performCompaction({
      sessionId: "s-ext",
      storage,
      history: [{ role: "user", content: LONG }],
      coveredThroughSeq: 7,
    });
    expect(out?.summary).toContain("COMPRESSED CONTEXT");
  });

  it("tracks the pending flag across reads", async () => {
    const storage = memoryStorage();
    expect(await isCompactionPending("s-p", storage)).toBe(false);
    await setCompactionPending("s-p", storage);
    expect(await isCompactionPending("s-p", storage)).toBe(true);
    await clearCompactionPending("s-p", storage);
    expect(await isCompactionPending("s-p", storage)).toBe(false);
  });

  it("renders history text with roles", () => {
    expect(historyText([{ role: "user", content: "a" }])).toBe("USER: a");
  });

  it("finds the live turn start (boundary excludes in-flight)", () => {
    const chain = [
      { seq: 0, type: "harness/event", data: { type: "turn_start", turnId: "t1" } },
      { seq: 1, type: "harness/event", data: { type: "token" } },
      { seq: 2, type: "compaction/summary", data: {} },
      { seq: 3, type: "harness/event", data: { type: "turn_start", turnId: "t2" } },
      { seq: 4, type: "harness/event", data: { type: "token" } },
    ];
    expect(lastTurnStartSeq(chain)).toBe(3);
    expect(lastTurnStartSeq(chain.slice(0, 3))).toBe(0);
    expect(lastTurnStartSeq([])).toBeNull();
    expect(lastTurnStartSeq([{ seq: 9, type: "user/message", data: "x" }])).toBeNull();
  });
});
