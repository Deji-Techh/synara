// FILE: transcriptMirror.ts
// Purpose: Project harness turn events (turn_start/token/turn_end) into the
// thread transcript using the exact message shape + events the legacy engine
// uses, so harness chats render user bubbles + assistant text and dismiss
// the hero. Rich harness cards (tools, todos, consent, errors) stay
// dock-only; the mirror carries user/assistant text only, avoiding duplicate
// surfaces. Best-effort throughout: mirror failures must never break turns.
//
// All thread I/O goes through injected deps so this module stays decoupled
// from the thread store (and unit-testable without it).

export interface TranscriptMirrorDeps {
  findThread: (threadId: string) => any | undefined;
  publishMessage: (threadId: string, msg: any) => void;
  save: () => void;
}

export interface TranscriptMirror {
  mirrorHarnessTurnEvent(event: any): void;
}

/** Assistant rows the mirror owns (user rows share the turnId scheme). */
export const HARNESS_ASSISTANT_MSG_PREFIX = "msg-harness-asst-";
const HARNESS_USER_MSG_PREFIX = "msg-harness-user-";

interface OpenMirrorTurn {
  threadId: string;
  turnId: string;
  assistantMsgId: string;
}

export function createTranscriptMirror(deps: TranscriptMirrorDeps): TranscriptMirror {
  const openTurns = new Map<string, OpenMirrorTurn>();
  const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function scheduleFlush(threadId: string, msg: any): void {
    // Trailing-edge throttle: streaming text publishes at most ~10/s.
    if (flushTimers.has(threadId)) return;
    flushTimers.set(
      threadId,
      setTimeout(() => {
        flushTimers.delete(threadId);
        msg.updatedAt = new Date().toISOString();
        deps.publishMessage(threadId, msg);
        deps.save();
      }, 100),
    );
  }

  function flushNow(threadId: string, msg: any): void {
    const timer = flushTimers.get(threadId);
    if (timer) {
      clearTimeout(timer);
      flushTimers.delete(threadId);
    }
    msg.updatedAt = new Date().toISOString();
    deps.publishMessage(threadId, msg);
    deps.save();
  }

  function mirrorHarnessTurnEvent(event: any): void {
    try {
      const sessionId = typeof event?.sessionId === "string" ? event.sessionId : "";
      if (!sessionId) return;
      if (event?.type === "turn_start") {
        const thread = deps.findThread(sessionId);
        if (!thread || !Array.isArray(thread.messages)) return;
        const turnId =
          typeof event.turnId === "string" && event.turnId.length > 0
            ? event.turnId
            : `turn-${Date.now().toString(36)}`;
        // Idempotent: replays/retries must not duplicate transcript rows.
        if (thread.messages.some((m: any) => m?.turnId === turnId)) return;
        const now = new Date().toISOString();
        const prompt = typeof event.prompt === "string" ? event.prompt : "";
      const userMsg = {
        id: `${HARNESS_USER_MSG_PREFIX}${turnId}`,
          role: "user",
          text: prompt,
          attachments: [],
          skills: [],
          mentions: [],
          dispatchMode: "queue",
          turnId,
          streaming: false,
          source: "native",
          createdAt: now,
          updatedAt: now,
        };
      const assistantMsg = {
        id: `${HARNESS_ASSISTANT_MSG_PREFIX}${turnId}`,
          role: "assistant",
          text: "",
          turnId,
          streaming: true,
          source: "native",
          createdAt: now,
          updatedAt: now,
        };
        thread.messages.push(userMsg, assistantMsg);
        // NOTE: no title write here on purpose. Thread titles belong to the
        // AI-naming chain (skeleton → generated → Chat N fallback), which the
        // client kicks off per first send. A raw prompt slice would look like
        // a manual rename and suppress AI naming entirely.
        thread.latestUserMessageAt = now;
        thread.updatedAt = now;
        openTurns.set(sessionId, {
          threadId: thread.id,
          turnId,
          assistantMsgId: assistantMsg.id,
        });
        deps.publishMessage(thread.id, userMsg);
        deps.publishMessage(thread.id, assistantMsg);
        deps.save();
        return;
      }
      if (event?.type === "token") {
        const open = openTurns.get(sessionId);
        if (!open) return;
        const thread = deps.findThread(open.threadId);
        const msg = thread?.messages?.find((m: any) => m?.id === open.assistantMsgId);
        if (!thread || !msg) return;
        const delta = typeof event.content === "string" ? event.content : "";
        if (!delta) return;
        msg.text = `${msg.text ?? ""}${delta}`;
        scheduleFlush(thread.id, msg);
        return;
      }
      if (event?.type === "error") {
        // Provider/turn errors surface in the main chat like legacy inline
        // errors (the dock card alone is easy to miss).
        const open = openTurns.get(sessionId);
        if (!open) return;
        const thread = deps.findThread(open.threadId);
        const msg = thread?.messages?.find((m: any) => m?.id === open.assistantMsgId);
        if (!thread || !msg) return;
        const detail = typeof event.message === "string" && event.message.trim().length > 0
          ? event.message.trim().slice(0, 500)
          : event.code;
        msg.text = `${msg.text ?? ""}\n\nError: ${detail}`;
        scheduleFlush(thread.id, msg);
        return;
      }
      if (event?.type === "turn_end") {        const open = openTurns.get(sessionId);
        openTurns.delete(sessionId);
        // Heal path: a turn_end with no open entry (missed turn_start, e.g.
        // server restart) still settles the newest streaming assistant row so
        // the composer never latches on a stale streaming flag.
        const threadId = open?.threadId ?? sessionId;
        const thread = deps.findThread(threadId);
        const msg =
          (open
            ? thread?.messages?.find((m: any) => m?.id === open.assistantMsgId)
            : [...(thread?.messages ?? [])]
                .reverse()
                .find(
                  (m: any) =>
                    typeof m?.id === "string" &&
                    m.id.startsWith(HARNESS_ASSISTANT_MSG_PREFIX) &&
                    m.streaming,
                )) ?? null;
        if (!thread || !msg) return;
        msg.streaming = false;
        thread.updatedAt = new Date().toISOString();
        flushNow(thread.id, msg);
        return;
      }
    } catch {
      // mirror is best-effort; never break turns
    }
  }

  return { mirrorHarnessTurnEvent };
}
