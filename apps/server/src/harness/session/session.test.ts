import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Session, SessionStorage, buildConversationChain, buildMessages } from "./index.ts";

describe("Milestone M2 — JSONL Session Storage & parentUuid Chain", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-session-test-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("writes 100 events, flushes, simulates crash/resume, and verifies chain is intact and ordered", async () => {
    const storage1 = new SessionStorage({ baseDir: tempDir, debounceMs: 0 });
    const session1 = new Session("session-100", storage1);

    const createdIds: string[] = [];
    for (let i = 0; i < 100; i++) {
      const entry = await session1.append(i % 2 === 0 ? "user/message" : "assistant/message", {
        text: `Message index ${i}`,
      });
      createdIds.push(entry.id);
    }
    await session1.flush();

    // Verify raw JSONL file on disk
    const filePath = path.join(tempDir, "session-100.jsonl");
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines.length).toBe(100);

    // Simulate crash and resume: new storage and session instance reading the same directory
    const storage2 = new SessionStorage({ baseDir: tempDir, debounceMs: 0 });
    const session2 = new Session("session-100", storage2);

    const chain = await session2.getChain();
    expect(chain.length).toBe(100);

    // Verify ordering and parentUuid linkage
    for (let i = 0; i < 100; i++) {
      expect(chain[i].id).toBe(createdIds[i]);
      expect(chain[i].seq).toBe(i);
      if (i === 0) {
        expect(chain[i].parentUuid).toBeNull();
      } else {
        expect(chain[i].parentUuid).toBe(createdIds[i - 1]);
      }
    }
  });

  it("supports branching / forking where both child chains are completely independent", async () => {
    const storage = new SessionStorage({ baseDir: tempDir, debounceMs: 0 });
    const session = new Session("session-fork", storage);

    // Common root
    const root = await session.append("user/message", "Initial user prompt", null);
    const step1 = await session.append("assistant/message", "Initial response", root.id);

    // Branch A (e.g. attempt 1)
    const branchA1 = await session.append(
      "assistant/tool_use",
      { name: "writeFile", args: { path: "a.ts" } },
      step1.id,
    );
    const branchA2 = await session.append("user/tool_result", { result: "ok" }, branchA1.id);

    // Branch B (e.g. fork from step1)
    const branchB1 = await session.append(
      "assistant/tool_use",
      { name: "readFile", args: { path: "b.ts" } },
      step1.id,
    );
    const branchB2 = await session.append("user/tool_result", { result: "b content" }, branchB1.id);

    await session.flush();

    // Verify Branch A chain
    const chainA = await buildConversationChain("session-fork", branchA2.id, storage);
    expect(chainA.map((e) => e.id)).toEqual([root.id, step1.id, branchA1.id, branchA2.id]);

    // Verify Branch B chain
    const chainB = await buildConversationChain("session-fork", branchB2.id, storage);
    expect(chainB.map((e) => e.id)).toEqual([root.id, step1.id, branchB1.id, branchB2.id]);

    // Ensure neither branch contains the other's events
    expect(chainA.some((e) => e.id === branchB1.id || e.id === branchB2.id)).toBe(false);
    expect(chainB.some((e) => e.id === branchA1.id || e.id === branchA2.id)).toBe(false);
  });

  it("buildMessages() for Verifier NEVER contains Builder tool calls or scratchpad traces (Context Isolation)", async () => {
    const storage = new SessionStorage({ baseDir: tempDir, debounceMs: 0 });
    const session = new Session("session-isolation", storage);

    const userPrompt = await session.append("user/message", "Create a modern auth screen");
    const spec = await session.append("spec/plan", { name: "Auth Screen", screens: ["Login"] });
    const scratch = await session.append("builder/scratchpad", "Thinking about responsive layout");
    const toolUse = await session.append("assistant/tool_use", {
      name: "writeComponent",
      args: { code: "export default..." },
    });
    const toolResult = await session.append("user/tool_result", { result: "File written" });
    const artifact = await session.append("artifact/snapshot", {
      path: "src/Login.tsx",
      content: "<Login />",
    });

    await session.flush();

    const chain = await session.getChain();

    // Builder messages: contains prompt, spec, scratchpad, tool_use, tool_result, artifact
    const builderMessages = buildMessages(chain, { role: "builder" });
    expect(
      builderMessages.some(
        (m) => typeof m.content === "string" && m.content.includes("Scratchpad"),
      ),
    ).toBe(true);
    expect(
      builderMessages.some((m) => Array.isArray(m.content) && m.content[0].type === "tool_use"),
    ).toBe(true);
    expect(
      builderMessages.some((m) => Array.isArray(m.content) && m.content[0].type === "tool_result"),
    ).toBe(true);

    // Verifier messages: must NEVER contain builder scratchpad or tool_use / tool_result
    const verifierMessages = buildMessages(chain, { role: "verifier" });

    for (const msg of verifierMessages) {
      if (typeof msg.content === "string") {
        expect(msg.content).not.toContain("[Scratchpad]");
      }
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          expect(block.type).not.toBe("tool_use");
          expect(block.type).not.toBe("tool_result");
        }
      }
    }

    // Verifier should see the user prompt, the approved spec, and the artifact snapshot
    expect(
      verifierMessages.some(
        (m) => typeof m.content === "string" && m.content.includes("Create a modern auth screen"),
      ),
    ).toBe(true);
    expect(
      verifierMessages.some(
        (m) => typeof m.content === "string" && m.content.includes("[Approved Specification]"),
      ),
    ).toBe(true);
    expect(
      verifierMessages.some(
        (m) => typeof m.content === "string" && m.content.includes("[Artifact src/Login.tsx]"),
      ),
    ).toBe(true);
  });

  it("handles debounce queue properly and records transcripts", async () => {
    const storage = new SessionStorage({ baseDir: tempDir, debounceMs: 50 });
    const session = new Session("session-debounce", storage);

    await session.append("user/message", "Hello");
    await session.append("assistant/message", "Hi there!");
    await session.append("harness/checkpoint", { step: 1 });

    // Read immediately (in-memory queue + disk)
    const inMemory = await storage.readEntries("session-debounce");
    expect(inMemory.length).toBe(3);

    // Filter transcript
    const transcript = storage.recordTranscript(inMemory);
    expect(transcript.length).toBe(2);
    expect(transcript.map((t) => t.type)).toEqual(["user/message", "assistant/message"]);

    // Flush and check disk file
    await storage.flushAll();
    const diskContent = fs.readFileSync(path.join(tempDir, "session-debounce.jsonl"), "utf-8");
    expect(diskContent.trim().split("\n").length).toBe(3);
  });

  it("chains flat harness events chronologically (no parent links)", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-chain-"));
    const storage = new SessionStorage({ baseDir: dir, debounceMs: 1 });
    const sid = "s-chain";
    await storage.append(sid, "harness/event", {
      type: "turn_start",
      sessionId: sid,
      prompt: "build x",
    });
    await storage.append(sid, "harness/event", {
      type: "token",
      sessionId: sid,
      content: "On it. ",
    });
    await storage.append(sid, "harness/event", {
      type: "tool_call",
      sessionId: sid,
      id: "c1",
      name: "read_file",
      args: { path: "a.ts" },
      status: "started",
    });
    await storage.append(sid, "harness/event", {
      type: "tool_call",
      sessionId: sid,
      id: "c1",
      name: "read_file",
      args: { path: "a.ts" },
      status: "completed",
      result: "contents",
    });
    await storage.flushAll();
    const chain = await buildConversationChain(sid, undefined, storage);
    // All four flat entries linked (previously: single latest entry only).
    expect(chain).toHaveLength(4);
    const messages = buildMessages(chain, { role: "builder", includeSystem: false });
    const roles = messages.map((m) => m.role);
    expect(roles).toEqual(["user", "assistant", "user"]);
    // No consecutive same-role rows (Anthropic rejects those).
    for (let i = 1; i < roles.length; i += 1) expect(roles[i]).not.toBe(roles[i - 1]);
    const asst = messages[1] as { content: Array<{ type: string; name?: string }> };
    expect(asst.content[0]).toMatchObject({ type: "text" });
    expect(asst.content[1]).toMatchObject({ type: "tool_use", name: "read_file" });
    const result = messages[2] as { content: Array<{ tool_use_id?: string }> };
    expect(result.content[0]).toMatchObject({ type: "tool_result", tool_use_id: "c1" });
  });

  it("projects answers, steers, and errors into later-turn context", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-chain2-"));
    const storage = new SessionStorage({ baseDir: dir, debounceMs: 1 });
    const sid = "s-chain2";
    await storage.append(sid, "harness/event", {
      type: "turn_start",
      sessionId: sid,
      prompt: "q?",
    });
    await storage.append(sid, "harness/event", {
      type: "tool_call",
      sessionId: sid,
      id: "q1",
      name: "planning_questionnaire",
      args: {},
      status: "completed",
      result: "**Q?**\nGreat",
    });
    await storage.append(sid, "harness/event", {
      type: "turn_end",
      sessionId: sid,
      status: "completed",
    });
    await storage.append(sid, "harness/event", {
      type: "steer",
      sessionId: sid,
      prompt: "approved, build it",
    });
    await storage.flushAll();
    const messages = buildMessages(await buildConversationChain(sid, undefined, storage), {
      role: "builder",
      includeSystem: false,
    });
    const texts = messages.map((m) => JSON.stringify(m.content));
    expect(texts.some((t) => t.includes("Great"))).toBe(true);
    expect(texts.some((t) => t.includes("approved, build it"))).toBe(true);
  });

  it("honors durable compaction boundaries across turns", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "caide-chain3-"));
    const storage = new SessionStorage({ baseDir: dir, debounceMs: 1 });
    const sid = "s-chain3";
    await storage.append(sid, "harness/event", {
      type: "turn_start",
      sessionId: sid,
      prompt: "alpha task",
    });
    await storage.append(sid, "harness/event", {
      type: "token",
      sessionId: sid,
      content: "did stuff",
    });
    await storage.append(sid, "compaction/summary", {
      summary: "Beta work is done.",
      coveredThroughSeq: 1,
    });
    await storage.append(sid, "harness/event", {
      type: "turn_start",
      sessionId: sid,
      prompt: "gamma task",
    });
    await storage.flushAll();
    const messages = buildMessages(await buildConversationChain(sid, undefined, storage), {
      role: "builder",
      includeSystem: false,
    });
    const texts = messages.map((m) => JSON.stringify(m.content));
    // Pre-boundary content gone, summary + new turn present.
    expect(texts.some((t) => t.includes("alpha task"))).toBe(false);
    expect(texts.some((t) => t.includes("did stuff"))).toBe(false);
    expect(texts.some((t) => t.includes("Beta work is done."))).toBe(true);
    expect(texts.some((t) => t.includes("gamma task"))).toBe(true);
  });
});
