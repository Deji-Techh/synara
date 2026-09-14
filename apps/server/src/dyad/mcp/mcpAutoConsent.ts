// FILE: mcpAutoConsent.ts
// Purpose: Cheap-model auto-approve classifier for MCP tool calls (donor
// parity): safe calls skip the consent card with a shown reason; everything
// else (timeout, failure, human decision) falls back to ask. Human always
// wins ties — the classifier only ever approves, never denies.

import { getContextSummarizer } from "../misc/index.ts";
import { readHarnessEvents } from "../../harness/turn/eventLog.ts";
import { buildMcpConsentSystemPrompt } from "./mcpConsentPolicy.ts";

const CLASSIFIER_TIMEOUT_MS = 8_000;
const RECENT_TURNS_LIMIT = 10;
const USER_MAX_LEN = 10_000;
const ASSISTANT_MAX_LEN = 1_000;
const ARGS_MAX_LEN = 200;

export interface McpAutoApproveVerdict {
  approved: boolean;
  reason?: string;
}

function cap(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…[truncated]` : text;
}

/** Recent turns as role/text pairs (tool outputs excluded — intent only). */
async function recentTurns(sessionId: string): Promise<Array<{ role: string; content: string }>> {
  const events = await readHarnessEvents(sessionId, 60).catch(() => []);
  const turns: Array<{ role: string; content: string }> = [];
  for (const event of events) {
    if (event.type === "turn_start" && "prompt" in event && typeof event.prompt === "string") {
      turns.push({ role: "user", content: cap(event.prompt, USER_MAX_LEN) });
    } else if (event.type === "token" && "content" in event && typeof event.content === "string") {
      const last = turns[turns.length - 1];
      if (last && last.role === "assistant") last.content += event.content;
      else turns.push({ role: "assistant", content: event.content });
    }
  }
  return turns
    .map((t) => ({
      role: t.role,
      content: t.role === "user" ? cap(t.content, USER_MAX_LEN) : cap(t.content, ASSISTANT_MAX_LEN),
    }))
    .filter((t) => t.content.trim().length > 0)
    .slice(-RECENT_TURNS_LIMIT);
}

function buildUserPayload(input: {
  serverName: string;
  toolName: string;
  toolDescription?: string | null;
  args: unknown;
  turns: Array<{ role: string; content: string }>;
}): string {
  const lines = [
    `MCP server: ${input.serverName}`,
    `Tool: ${input.toolName}`,
    `Description: ${input.toolDescription ?? "(none)"}`,
    `Arguments: ${cap(JSON.stringify(input.args ?? {}), ARGS_MAX_LEN)}`,
  ];
  if (input.turns.length > 0) {
    lines.push("", "Recent conversation (oldest first):");
    for (const turn of input.turns) lines.push(`${turn.role}: ${turn.content}`);
  } else {
    lines.push("", "(no prior messages)");
  }
  return lines.join("\n");
}

function extractDecision(text: string): { approved: boolean; reason: string } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as {
      reason?: unknown;
      decision?: unknown;
    };
    if (parsed.decision !== "allow" && parsed.decision !== "ask") return null;
    const reason =
      typeof parsed.reason === "string" && parsed.reason.trim().length > 0
        ? parsed.reason.trim()
        : "No reason provided.";
    return { approved: parsed.decision === "allow", reason };
  } catch {
    return null;
  }
}

export interface McpAutoApproveInput {
  sessionId: string;
  serverName: string;
  toolName: string;
  toolDescription?: string | null;
  args: unknown;
}

/**
 * Build the classifier closure, or undefined when it must not run (setting
 * off or no cheap model available). Fail-closed: every error path returns
 * {approved:false} so the consent card shows.
 */
export function buildMcpAutoApprove(
  input: McpAutoApproveInput,
): (() => Promise<McpAutoApproveVerdict>) | undefined {
  const summarize = getContextSummarizer();
  if (!summarize) return undefined;
  return async () => {
    try {
      const turns = await recentTurns(input.sessionId);
      const verdict = await Promise.race([
        (async () => {
          const text = await summarize({
            system: buildMcpConsentSystemPrompt(),
            prompt: buildUserPayload({ ...input, turns }),
          });
          return extractDecision(text ?? "");
        })(),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error("classifier timeout")), CLASSIFIER_TIMEOUT_MS),
        ),
      ]);
      if (!verdict)
        return { approved: false, reason: "Could not evaluate the tool call automatically." };
      return verdict;
    } catch {
      return { approved: false, reason: "Could not evaluate the tool call automatically." };
    }
  };
}
