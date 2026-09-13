// FILE: transcriptMirror.ts
// Purpose: Project harness turn events (turn_start/token/tool_call/turn_end)
// into the thread transcript using the exact message shape + events the
// legacy engine uses, so harness chats render user bubbles + assistant text
// and dismiss the hero. Tool calls project as <caide-tool> custom tags,
// which ChatMarkdown folds into inline AntigravityToolGroup cards (grouped,
// collapsible, per-item expand) — the same surface as legacy engine turns,
// durable in the thread store (survives reload, no socket needed).
// Interactive waits (questionnaires) and plan/blueprint approvals keep their
// dedicated above-composer cards and are excluded here to avoid double
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

/**
 * Tool calls with dedicated card surfaces elsewhere: interactive waits park
 * on ui_prompt cards, plan/blueprint tools park on approval cards. Mirroring
 * them as inline rows would show every prompt twice.
 */
const MIRRORED_TOOL_EXCLUDE = new Set([
  "planning_questionnaire",
  "ask_env_vars",
  "write_plan",
  "exit_plan",
  "write_app_blueprint",
]);

/** Attribute-safe: strip quotes (values are double-quoted in the tag). */
function toolAttr(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "";
  return value.replace(/"/g, "").slice(0, 220);
}

/** Pick the most informative locator attributes from tool args. */
function toolLocatorAttrs(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const a = args as Record<string, unknown>;
  const parts: string[] = [];
  const path = toolAttr(a.path ?? a.file ?? a.target);
  const command = toolAttr(a.command ?? a.cmd);
  const query = toolAttr(a.query ?? a.pattern);
  if (path) parts.push(` path="${path}"`);
  if (command) parts.push(` command="${command}"`);
  if (query) parts.push(` query="${query}"`);
  return parts.join("");
}

/**
 * Result text safe to embed inside a <caide-tool> block: truncated, and
 * close-tag sequences neutralized (a literal </caide-tool> in tool output
 * would otherwise terminate the block early and corrupt grouping).
 */
function toolResultText(result: unknown): string {
  const raw = typeof result === "string" ? result : JSON.stringify(result ?? "");
  return (raw ?? "").replace(/<\//g, "<\u200b/").slice(0, 600);
}

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
      if (event?.type === "tool_call") {
        const open = openTurns.get(sessionId);
        if (!open) return;
        const thread = deps.findThread(open.threadId);
        const msg = thread?.messages?.find((m: any) => m?.id === open.assistantMsgId);
        if (!thread || !msg) return;
        const name = typeof event.name === "string" && event.name.length > 0 ? event.name : "tool";
        if (MIRRORED_TOOL_EXCLUDE.has(name)) return;
        const callId = typeof event.id === "string" ? event.id : "";
        const openTag =
          `<caide-tool name="${toolAttr(name)}" tool-call-id="${toolAttr(callId)}"` +
          `${toolLocatorAttrs(event.args)}>`;
        if (event.status === "started") {
          // Unclosed tag renders as a running group item (complete = closing
          // tag seen). Closed on completed/failed below.
          msg.text = `${msg.text ?? ""}\n\n${openTag}`;
          scheduleFlush(thread.id, msg);
          return;
        }
        if (event.status === "completed" || event.status === "failed") {
          const status = event.status === "completed" ? "complete" : "error";
          const closedTag = `${openTag} status="${status}">\n${toolResultText(event.result)}\n</caide-tool>`;
          const text: string = msg.text ?? "";
          msg.text = text.includes(openTag)
            ? text.replace(openTag, closedTag)
            : `${text}\n\n${closedTag}`;
          scheduleFlush(thread.id, msg);
          return;
        }
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
        const detail =
          typeof event.message === "string" && event.message.trim().length > 0
            ? event.message.trim().slice(0, 500)
            : event.code;
        msg.text = `${msg.text ?? ""}\n\nError: ${detail}`;
        scheduleFlush(thread.id, msg);
        return;
      }
      if (event?.type === "turn_end") {
        const open = openTurns.get(sessionId);
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
        // Backstop: tools aborted without a completed/failed event would
        // otherwise render as running forever. Close dangling tags.
        if (typeof msg.text === "string") {
          const opens = (msg.text.match(/<caide-tool[\s>]/g) ?? []).length;
          const closes = (msg.text.match(/<\/caide-tool>/g) ?? []).length;
          for (let i = closes; i < opens; i += 1) {
            msg.text += "\n(interrupted)\n</caide-tool>";
          }
        }
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
