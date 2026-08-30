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
      const entry = await session1.append(
        i % 2 === 0 ? "user/message" : "assistant/message",
        { text: `Message index ${i}` },
      );
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
    const branchA1 = await session.append("assistant/tool_use", { name: "writeFile", args: { path: "a.ts" } }, step1.id);
    const branchA2 = await session.append("user/tool_result", { result: "ok" }, branchA1.id);

    // Branch B (e.g. fork from step1)
    const branchB1 = await session.append("assistant/tool_use", { name: "readFile", args: { path: "b.ts" } }, step1.id);
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
    const toolUse = await session.append("assistant/tool_use", { name: "writeComponent", args: { code: "export default..." } });
    const toolResult = await session.append("user/tool_result", { result: "File written" });
    const artifact = await session.append("artifact/snapshot", { path: "src/Login.tsx", content: "<Login />" });

    await session.flush();

    const chain = await session.getChain();

    // Builder messages: contains prompt, spec, scratchpad, tool_use, tool_result, artifact
    const builderMessages = buildMessages(chain, { role: "builder" });
    expect(builderMessages.some((m) => typeof m.content === "string" && m.content.includes("Scratchpad"))).toBe(true);
    expect(builderMessages.some((m) => Array.isArray(m.content) && m.content[0].type === "tool_use")).toBe(true);
    expect(builderMessages.some((m) => Array.isArray(m.content) && m.content[0].type === "tool_result")).toBe(true);

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
    expect(verifierMessages.some((m) => typeof m.content === "string" && m.content.includes("Create a modern auth screen"))).toBe(true);
    expect(verifierMessages.some((m) => typeof m.content === "string" && m.content.includes("[Approved Specification]"))).toBe(true);
    expect(verifierMessages.some((m) => typeof m.content === "string" && m.content.includes("[Artifact src/Login.tsx]"))).toBe(true);
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
});
