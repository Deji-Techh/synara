import { SessionLogEntry, SessionStorage } from "./storage.ts";

export type HarnessRole = "planner" | "builder" | "verifier" | "fixer" | "taste" | "router";

export interface MessageContentBlock {
  type: "text" | "image" | "tool_use" | "tool_result";
  text?: string;
  [key: string]: unknown;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | MessageContentBlock[];
  meta?: Record<string, unknown>;
}

export interface BuildMessagesOptions {
  role?: HarnessRole;
  sliceIndex?: number;
  includeSystem?: boolean;
}

/**
 * Builds the chronological chain of session entries by following parentUuid references.
 * If targetLeafId is given, starts at that entry and traverses up to the root.
 * Otherwise, uses the most recent entry as the leaf.
 */
export async function buildConversationChain(
  sessionId: string,
  targetLeafId?: string,
  storage?: SessionStorage,
): Promise<SessionLogEntry[]> {
  const activeStorage = storage ?? new SessionStorage();
  const allEntries = await activeStorage.readEntries(sessionId);

  if (allEntries.length === 0) {
    return [];
  }

  const byId = new Map<string, SessionLogEntry>();
  for (const entry of allEntries) {
    byId.set(entry.id, entry);
  }

  let currentEntry: SessionLogEntry | undefined;

  if (targetLeafId) {
    currentEntry = byId.get(targetLeafId);
  } else {
    // Pick the entry with the highest sequence / latest time that has no children or is last
    currentEntry = allEntries[allEntries.length - 1];
  }

  if (!currentEntry) {
    return [];
  }

  // Durable compaction boundary: a persisted summary supersedes everything
  // it covers. Drop covered entries so future turns (and restarts) stop
  // before them; the summary entry itself survives and maps to a message.
  let boundarySeq = -1;
  for (const entry of allEntries) {
    if (entry.type !== "compaction/summary") continue;
    const covered = (entry.data as { coveredThroughSeq?: unknown })?.coveredThroughSeq;
    if (typeof covered === "number" && Number.isFinite(covered) && covered > boundarySeq) {
      boundarySeq = Math.floor(covered);
    }
  }

  const chain: SessionLogEntry[] = [];
  const visited = new Set<string>();

  // Chronological fallback is ONLY for flat logs (no entry carries a
  // parent link — the harness turn-event shape). Threaded legacy logs keep
  // exact parent-following so separate chains never bleed into each other.
  const flatLog = !allEntries.some((entry) => entry.parentUuid);
  // Index by position for the chronological fallback below (readEntries
  // returns seq order).
  const indexById = new Map<string, number>();
  allEntries.forEach((entry, index) => {
    if (!indexById.has(entry.id)) indexById.set(entry.id, index);
  });

  while (currentEntry) {
    if (visited.has(currentEntry.id)) {
      // Loop detected, break
      break;
    }
    visited.add(currentEntry.id);
    // Pre-boundary entries were summarized — skip them (the summary entry
    // itself sits past the boundary and survives).
    if (currentEntry.seq > boundarySeq) chain.push(currentEntry);

    if (currentEntry.parentUuid) {
      currentEntry = byId.get(currentEntry.parentUuid);
      continue;
    }
    if (!flatLog) break;
    const index = indexById.get(currentEntry.id) ?? -1;
    currentEntry = index > 0 ? allEntries[index - 1] : undefined;
  }

  // Reverse so the chain is strictly in chronological order (root -> leaf)
  return chain.reverse();
}

/**
 * Converts a sequence of session log entries into LLM chat messages,
 * applying role-based context isolation (e.g. Verifier never sees Builder scratch/tool calls).
 */
export function buildMessages(
  chain: SessionLogEntry[],
  options: BuildMessagesOptions = {},
): ChatMessage[] {
  const role = options.role ?? "builder";
  const messages: ChatMessage[] = [];

  // In-progress assistant message for harness turns: consecutive assistant
  // content (text deltas, tool_use blocks) coalesces into ONE message with
  // ordered content blocks. Providers like Anthropic reject consecutive
  // same-role messages, so we never emit two assistant rows in a row.
  let openAssistant: { content: MessageContentBlock[]; metaSeq: number; metaId: string } | null =
    null;
  const flushAssistant = (): void => {
    if (!openAssistant) return;
    const hasContent = openAssistant.content.some((block) =>
      block.type === "text" ? typeof block.text === "string" && block.text.length > 0 : true,
    );
    if (hasContent) {
      messages.push({
        role: "assistant",
        content: openAssistant.content,
        meta: { seq: openAssistant.metaSeq, id: openAssistant.metaId },
      });
    }
    openAssistant = null;
  };
  const assistantText = (text: string, seq: number, id: string): void => {
    if (!text) return;
    if (!openAssistant) openAssistant = { content: [], metaSeq: seq, metaId: id };
    const last = openAssistant.content[openAssistant.content.length - 1];
    if (last && last.type === "text") {
      last.text = `${last.text ?? ""}${text}`;
    } else {
      openAssistant.content.push({ type: "text", text });
    }
  };
  const assistantToolUse = (block: MessageContentBlock, seq: number, id: string): void => {
    if (!openAssistant) openAssistant = { content: [], metaSeq: seq, metaId: id };
    openAssistant.content.push(block);
  };

  for (const entry of chain) {
    if (entry.type === "harness/event") {
      appendHarnessEventMessage(messages, flushAssistant, assistantText, assistantToolUse, entry);
      continue;
    }
    if (entry.type === "compaction/summary") {
      flushAssistant();
      const summary = (entry.data as { summary?: unknown })?.summary;
      if (typeof summary === "string" && summary.length > 0) {
        messages.push({
          role: "assistant",
          content: `[Compacted context summary]:\n${summary}`,
          meta: { seq: entry.seq, id: entry.id },
        });
      }
      continue;
    }
    switch (entry.type) {
      case "user/message": {
        const text =
          typeof entry.data === "string"
            ? entry.data
            : String((entry.data as any)?.content ?? JSON.stringify(entry.data));
        messages.push({
          role: "user",
          content: text,
          meta: { seq: entry.seq, id: entry.id },
        });
        break;
      }

      case "assistant/message": {
        // If role is verifier, we exclude raw assistant chat reasoning that isn't final output
        const text =
          typeof entry.data === "string"
            ? entry.data
            : String((entry.data as any)?.content ?? JSON.stringify(entry.data));
        messages.push({
          role: "assistant",
          content: text,
          meta: { seq: entry.seq, id: entry.id },
        });
        break;
      }

      case "assistant/tool_use": {
        // VERIFIER ISOLATION RULE: Verifier gets fresh context and NEVER sees builder tool traces
        if (role === "verifier" || role === "taste") {
          break;
        }

        const data = entry.data as { id?: string; name?: string; args?: unknown };
        messages.push({
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: data.id ?? entry.id,
              name: data.name ?? "unknown_tool",
              input: data.args ?? {},
            },
          ],
          meta: { seq: entry.seq, id: entry.id },
        });
        break;
      }

      case "user/tool_result": {
        // VERIFIER ISOLATION RULE: Verifier NEVER sees intermediate builder tool results
        if (role === "verifier" || role === "taste") {
          break;
        }

        const data = entry.data as { toolUseId?: string; result?: unknown; error?: string };
        messages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: data.toolUseId ?? entry.id,
              content:
                typeof data.result === "string"
                  ? data.result
                  : JSON.stringify(data.result ?? data.error ?? ""),
              is_error: Boolean(data.error),
            },
          ],
          meta: { seq: entry.seq, id: entry.id },
        });
        break;
      }

      case "builder/scratchpad": {
        // Internal builder scratchpad reasoning is only visible to builder
        if (role === "builder") {
          const content = typeof entry.data === "string" ? entry.data : JSON.stringify(entry.data);
          messages.push({
            role: "assistant",
            content: `[Scratchpad]: ${content}`,
            meta: { seq: entry.seq, id: entry.id },
          });
        }
        break;
      }

      case "spec/plan": {
        // Spec is visible to all roles (Planner, Builder, Verifier, Fixer, Taste)
        const planText =
          typeof entry.data === "string" ? entry.data : JSON.stringify(entry.data, null, 2);
        messages.push({
          role: "user",
          content: `[Approved Specification]:\n${planText}`,
          meta: { seq: entry.seq, id: entry.id },
        });
        break;
      }

      case "artifact/snapshot": {
        // Final artifact snapshots are visible to verifier, fixer, taste, builder
        const artifact = entry.data as { path?: string; diff?: string; content?: string };
        messages.push({
          role: "user",
          content: `[Artifact ${artifact.path ?? "file"}]:\n${artifact.diff ?? artifact.content ?? ""}`,
          meta: { seq: entry.seq, id: entry.id },
        });
        break;
      }

      case "verifier/result": {
        // Verifier results are visible to fixer and builder, but not to verifier itself
        if (role === "fixer" || role === "builder") {
          const result = entry.data as { passed: boolean; issues?: string[]; score?: number };
          messages.push({
            role: "user",
            content: `[Verifier Report (passed: ${result.passed})]:\nIssues: ${JSON.stringify(result.issues ?? [])}`,
            meta: { seq: entry.seq, id: entry.id },
          });
        }
        break;
      }

      case "system/prompt": {
        if (options.includeSystem) {
          const text =
            typeof entry.data === "string"
              ? entry.data
              : String((entry.data as any)?.content ?? JSON.stringify(entry.data));
          messages.push({
            role: "system",
            content: text,
            meta: { seq: entry.seq, id: entry.id },
          });
        }
        break;
      }

      default:
        // Other harness events (stage transitions, checkpoints, metrics) don't pollute model context
        break;
    }
  }

  flushAssistant();
  return messages;
}

/**
 * Project one harness turn event into chat messages. Harness turns persist
 * as flat `harness/event` rows (turn_start/token/tool_call/...); without
 * this projection follow-up turns start amnesiac — none of the legacy entry
 * types are ever written on the harness path.
 */
function appendHarnessEventMessage(
  messages: ChatMessage[],
  flushAssistant: () => void,
  assistantText: (text: string, seq: number, id: string) => void,
  assistantToolUse: (block: MessageContentBlock, seq: number, id: string) => void,
  entry: SessionLogEntry,
): void {
  const data = entry.data as {
    type?: string;
    prompt?: unknown;
    content?: unknown;
    name?: unknown;
    id?: unknown;
    args?: unknown;
    status?: unknown;
    result?: unknown;
    message?: unknown;
    code?: unknown;
  };
  switch (data.type) {
    case "turn_start": {
      flushAssistant();
      if (typeof data.prompt === "string" && data.prompt.length > 0) {
        messages.push({
          role: "user",
          content: data.prompt,
          meta: { seq: entry.seq, id: entry.id },
        });
      }
      break;
    }
    case "token": {
      if (typeof data.content === "string") assistantText(data.content, entry.seq, entry.id);
      break;
    }
    case "tool_call": {
      const toolId = typeof data.id === "string" ? data.id : entry.id;
      const toolName = typeof data.name === "string" ? data.name : "unknown_tool";
      if (data.status === "started") {
        assistantToolUse(
          { type: "tool_use", id: toolId, name: toolName, input: data.args ?? {} },
          entry.seq,
          entry.id,
        );
      } else if (data.status === "completed" || data.status === "failed") {
        flushAssistant();
        const resultText =
          typeof data.result === "string" ? data.result : JSON.stringify(data.result ?? "");
        messages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: toolId,
              content: resultText,
              ...(data.status === "failed" ? { is_error: true } : {}),
            },
          ],
          meta: { seq: entry.seq, id: entry.id },
        });
      }
      break;
    }
    case "steer": {
      // User steering/approval follow-ups must survive into later turns.
      flushAssistant();
      if (typeof data.prompt === "string" && data.prompt.length > 0) {
        messages.push({
          role: "user",
          content: data.prompt,
          meta: { seq: entry.seq, id: entry.id },
        });
      }
      break;
    }
    case "error": {
      flushAssistant();
      const detail =
        typeof data.message === "string" && data.message.length > 0
          ? data.message
          : typeof data.code === "string"
            ? data.code
            : "unknown error";
      messages.push({
        role: "user",
        content: `Error: ${detail}`,
        meta: { seq: entry.seq, id: entry.id },
      });
      break;
    }
    // turn_end, stage, ui_prompt(+withdraw), plan/blueprint/todos updates,
    // reveals, versions, verifier, checkpoints, compaction, usage: terminal
    // markers or live-UI state with no durable conversational content.
    default:
      break;
  }
}
