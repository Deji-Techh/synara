// FILE: chatHistoryTools.test.ts
// Purpose: Chat-history tools against fixture session logs
// (search ranking + current-chat exclusion, read paging/around,
// explore citations + no_match). CAIDE_SESSIONS_DIR isolates fixtures.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ALL_CHAT_HISTORY_TOOLS,
  executeExploreChatHistory,
  executeReadChat,
  executeSearchChats,
} from "./chatHistoryTools.ts";

let dir = "";

function writeSession(id: string, events: Array<Record<string, unknown>>): void {
  const lines = events.map((data, i) =>
    JSON.stringify({
      id: `${id}-${i}`,
      parentUuid: null,
      sessionId: id,
      seq: i,
      time: 1000 + i,
      type: "harness/event",
      data,
    }),
  );
  fs.writeFileSync(path.join(dir, `${id}.jsonl`), lines.join("\n") + "\n");
}

function token(content: string): Record<string, unknown> {
  return { type: "token", sessionId: "x", content };
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-chathist-"));
  process.env.CAIDE_SESSIONS_DIR = dir;
});

afterEach(() => {
  delete process.env.CAIDE_SESSIONS_DIR;
});

describe("dyad chat history tools", () => {
  it("registers search/read/explore tools", () => {
    expect(ALL_CHAT_HISTORY_TOOLS.map((t) => t.name)).toEqual([
      "search_chats",
      "read_chat",
      "explore_chat_history",
    ]);
  });

  it("searches other chats, excludes the current one", async () => {
    writeSession("current", [token("we chose Neon for the database layer")]);
    writeSession("older", [token("we chose Neon for the database layer")]);
    const out = await executeSearchChats({ query: "Neon database decision" }, "current");
    expect(out).toContain("older");
    expect(out).not.toContain("chat_id: current");
    expect(out).toMatch(/around_message_id: \d+/);
  });

  it("returns no-match guidance when nothing is found", async () => {
    writeSession("other", [token("unrelated weather chat")]);
    const out = await executeSearchChats({ query: "quantum billing webhook" }, "current");
    expect(out).toMatch(/No prior chats mention/);
  });

  it("reads chronological pages and around slices", async () => {
    const tool = {
      type: "tool_call",
      sessionId: "x",
      id: "t1",
      name: "read_file",
      args: {},
      status: "completed" as const,
    };
    writeSession("chat1", [
      token("first topic"),
      tool,
      token("second topic"),
      tool,
      token("third topic"),
    ]);
    const page = await executeReadChat({ chat_id: "chat1", offset: 0, limit: 1 }, "current");
    expect(page).toContain("first topic");
    expect(page).not.toContain("third topic");
    const around = await executeReadChat(
      { chat_id: "chat1", around_message_id: 4, limit: 3 },
      "current",
    );
    expect(around).toContain("third topic");
    expect(await executeReadChat({ chat_id: "missing" }, "current")).toMatch(/no readable history/);
  });

  it("explores with citations or no_match", async () => {
    writeSession("old", [token("we decided to use Stripe for payments")]);
    const report = await executeExploreChatHistory(
      { question: "what did we decide about payments?" },
      "now",
    );
    expect(report).toContain("old");
    expect(report).toMatch(/@\d+/);
    const miss = await executeExploreChatHistory({ question: "zebra astronaut protocol" }, "now");
    expect(miss).toMatch(/^no_match/);
  });

  it("labels current-chat passages first and other chats as different conversations", async () => {
    writeSession("mine", [token("we chose blue for the login button")]);
    writeSession("theirs", [token("we chose blue for the login button")]);
    const report = await executeExploreChatHistory(
      { question: "what color for the login button?" },
      "mine",
    );
    expect(report).toContain("## Current chat (this conversation)");
    expect(report).toContain("## Other chats (DIFFERENT conversations");
    // Current chat section precedes the other-chats section.
    expect(report.indexOf("## Current chat")).toBeLessThan(report.indexOf("## Other chats"));
  });

  it("excludes dev/test sessions from recall candidates", async () => {
    writeSession("s-scratch", [token("zebra astronaut protocol debrief")]);
    writeSession("probe-1", [token("zebra astronaut protocol debrief")]);
    const report = await executeExploreChatHistory({ question: "zebra astronaut debrief?" }, "now");
    expect(report).toMatch(/^no_match/);
  });
});
