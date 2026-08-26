import { describe, expect, it } from "vitest";
import { ThreadId, TurnId } from "@caide/contracts";
import {
  chatSettlementKey,
  isSettledForChatTurn,
  ownsPendingRequest,
  pendingInteractionKey,
  transcriptKey,
  tryRegisterPendingRequest,
} from "./EngineAdapter.ts";

describe("P0 isolation — EngineAdapter scoping", () => {
  it("pendingRequests are isolated by threadId — same requestId in two threads coexists", () => {
    const threadA = ThreadId.makeUnsafe("thread-a");
    const threadB = ThreadId.makeUnsafe("thread-b");
    const base = new Map<string, { kind: "questionnaire"; threadId: ThreadId; chatId: number }>([
      [pendingInteractionKey(threadA, "req-1"), { kind: "questionnaire", threadId: threadA, chatId: 11 }],
    ]);
    const [registered, next] = tryRegisterPendingRequest(base, "req-1", {
      kind: "questionnaire",
      threadId: threadB,
      chatId: 22,
    });
    expect(registered).toBe(true);
    expect(next.size).toBe(2);
    expect(next.get(pendingInteractionKey(threadA, "req-1"))?.chatId).toBe(11);
    expect(next.get(pendingInteractionKey(threadB, "req-1"))?.chatId).toBe(22);
  });

  it("pendingRequests duplicate in same thread is rejected", () => {
    const threadA = ThreadId.makeUnsafe("thread-a");
    const key = pendingInteractionKey(threadA, "req-1");
    const base = new Map([[key, { kind: "questionnaire" as const, threadId: threadA, chatId: 11 }]]);
    const [registered, next] = tryRegisterPendingRequest(base, "req-1", {
      kind: "questionnaire",
      threadId: threadA,
      chatId: 11,
    });
    expect(registered).toBe(false);
    expect(next).toBe(base);
  });

  it("ownsPendingRequest enforces both thread and chat ownership", () => {
    const threadA = ThreadId.makeUnsafe("thread-a");
    const threadB = ThreadId.makeUnsafe("thread-b");
    const entry = { kind: "mcp-consent" as const, threadId: threadA, chatId: 11 };
    expect(ownsPendingRequest(entry, threadA, 11)).toBe(true);
    expect(ownsPendingRequest(entry, threadA, 12)).toBe(false);
    expect(ownsPendingRequest(entry, threadB, 11)).toBe(false);
    // missing chatId on event fails when entry has chatId
    expect(ownsPendingRequest(entry, threadA, undefined)).toBe(false);
    // entry without chatId allows any chat on same thread
    const entryNoChat = { kind: "mcp-consent" as const, threadId: threadA };
    expect(ownsPendingRequest(entryNoChat, threadA, 999)).toBe(true);
    expect(ownsPendingRequest(entryNoChat, threadB, 999)).toBe(false);
  });

  it("two projects isolation — settlement keys are scoped by chat+turn", () => {
    const turnA = TurnId.makeUnsafe("turn-a");
    const turnB = TurnId.makeUnsafe("turn-b");
    const chatA = 100;
    const chatB = 200;
    // Same turnId but different chat must produce different settlement keys
    expect(chatSettlementKey(chatA, turnA)).not.toBe(chatSettlementKey(chatB, turnA));
    // Same chat different turns must produce different keys
    expect(chatSettlementKey(chatA, turnA)).not.toBe(chatSettlementKey(chatA, turnB));
    // Settlement in one project/chat does not mark other as settled
    const settled = new Set<string>([chatSettlementKey(chatA, turnA)]);
    expect(isSettledForChatTurn(settled, chatA, turnA)).toBe(true);
    expect(isSettledForChatTurn(settled, chatB, turnA)).toBe(false);
    expect(isSettledForChatTurn(settled, chatA, turnB)).toBe(false);
  });

  it("two chats in one project — transcript offsets are scoped by turn", () => {
    const turn1 = TurnId.makeUnsafe("turn-1");
    const turn2 = TurnId.makeUnsafe("turn-2");
    const msgId = "msg-42";
    // Same messageId in different turns must not collide
    expect(transcriptKey(turn1, msgId)).not.toBe(transcriptKey(turn2, msgId));
    // Different messages same turn must differ
    expect(transcriptKey(turn1, "msg-a")).not.toBe(transcriptKey(turn1, "msg-b"));
    // Tools key also scoped
    expect(transcriptKey(turn1, `${msgId}:tools`)).not.toBe(transcriptKey(turn2, `${msgId}:tools`));
  });

  it("two chats in one project — emitted offsets are per turn, not global", () => {
    // Simulate per-context emitted maps keyed by transcriptKey
    const turn1 = TurnId.makeUnsafe("turn-1");
    const turn2 = TurnId.makeUnsafe("turn-2");
    const emitted = new Map<string, number>();
    emitted.set(transcriptKey(turn1, "streaming"), 10);
    emitted.set(transcriptKey(turn2, "streaming"), 5);
    // Clearing one turn must not affect the other
    const prefix1 = `${String(turn1)}::`;
    for (const k of Array.from(emitted.keys())) if (k.startsWith(prefix1)) emitted.delete(k);
    expect(emitted.has(transcriptKey(turn1, "streaming"))).toBe(false);
    expect(emitted.get(transcriptKey(turn2, "streaming"))).toBe(5);
  });

  it("restart verification — stale chat mapping must be rejected and fresh created", () => {
    // This is a conceptual test for the restart verification logic:
    // persisted chat 99 belongs to app A, but after restart the thread resolves
    // to app B — get-chats for app B will not contain 99, so we must not reuse it.
    const appAChats = [{ id: 99 }, { id: 100 }];
    const appBChats = [{ id: 200 }];
    const persistedChatId = 99;
    const resolvedAppBId = 2;
    // Simulate verification: lookup under resolved app
    const foundInB = appBChats.find((c) => c.id === persistedChatId);
    expect(foundInB).toBeUndefined();
    // Correct behavior: create fresh chat instead of reusing
    const shouldReuse = foundInB !== undefined;
    expect(shouldReuse).toBe(false);
    // If the chat had been in the same app, reuse would be allowed
    const foundInA = appAChats.find((c) => c.id === persistedChatId);
    expect(foundInA).not.toBeUndefined();
  });

  it("chat+turn settlement prevents cross-turn replay from blocking next turn", () => {
    const chatId = 42;
    const turn1 = TurnId.makeUnsafe("turn-1");
    const turn2 = TurnId.makeUnsafe("turn-2");
    // First turn settles
    const settled = new Set<string>([chatSettlementKey(chatId, turn1)]);
    // Second turn on same chat with different turnId should still be claimable
    expect(isSettledForChatTurn(settled, chatId, turn2)).toBe(false);
    // But re-settling same turn is blocked
    expect(isSettledForChatTurn(settled, chatId, turn1)).toBe(true);
    // Clearing per-chat (as stream:start does) drops only that chat's keys
    const filtered = new Set<string>();
    for (const k of settled) if (!k.startsWith(`${chatId}::`) && k !== String(chatId)) filtered.add(k);
    expect(filtered.size).toBe(0);
  });
});
