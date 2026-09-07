// FILE: chatSearchIndex.test.ts
// Purpose: FTS indexing + ranked search over fixture session logs
// (isolated CAIDE_SESSIONS_DIR; index handle reset between tests).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  closeSearchIndex,
  indexSessionLines,
  searchIndexedSessions,
} from "./chatSearchIndex.ts";

let dir = "";

function writeSession(id: string, texts: string[]): void {
  const lines = texts.map((content, i) =>
    JSON.stringify({
      id: `${id}-${i}`,
      parentUuid: null,
      sessionId: id,
      seq: i,
      time: 1000 + i,
      type: "harness/event",
      data: { type: "token", sessionId: id, content },
    }),
  );
  fs.writeFileSync(path.join(dir, `${id}.jsonl`), lines.join("\n") + "\n");
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-fts-"));
  process.env.CAIDE_SESSIONS_DIR = dir;
  closeSearchIndex();
});

afterEach(() => {
  closeSearchIndex();
  delete process.env.CAIDE_SESSIONS_DIR;
});

describe("chat FTS index", () => {
  it("indexes sessions and ranks keyword hits, excluding a session", () => {
    writeSession("a", ["we chose Neon for the database layer"]);
    writeSession("b", ["unrelated weather chat"]);
    expect(indexSessionLines("a")).toBeGreaterThan(0);
    expect(indexSessionLines("b")).toBeGreaterThan(0);
    const hits = searchIndexedSessions(["a", "b"], ["neon", "database"], "current", 10);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].sessionId).toBe("a");
    expect(hits[0].excerpt.toLowerCase()).toContain("neon");
    const excluded = searchIndexedSessions(["a"], ["neon"], "a", 10);
    expect(excluded).toHaveLength(0);
  });

  it("reindexes idempotently and tolerates empty queries", () => {
    writeSession("a", ["hello world"]);
    expect(indexSessionLines("a")).toBeGreaterThan(0);
    expect(indexSessionLines("a")).toBeGreaterThan(0);
    expect(searchIndexedSessions(["a"], [], "x", 10)).toEqual([]);
    expect(searchIndexedSessions(["a"], ["!!!"], "x", 10)).toEqual([]);
    expect(searchIndexedSessions(["missing"], ["hello"], "x", 10)).toEqual([]);
  });
});
