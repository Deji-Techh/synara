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

  const chain: SessionLogEntry[] = [];
  const visited = new Set<string>();

  while (currentEntry) {
    if (visited.has(currentEntry.id)) {
      // Loop detected, break
      break;
    }
    visited.add(currentEntry.id);
    chain.push(currentEntry);

    if (!currentEntry.parentUuid) {
      break;
    }
    currentEntry = byId.get(currentEntry.parentUuid);
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

  for (const entry of chain) {
    switch (entry.type) {
      case "user/message": {
        const text = typeof entry.data === "string" ? entry.data : String((entry.data as any)?.content ?? JSON.stringify(entry.data));
        messages.push({
          role: "user",
          content: text,
          meta: { seq: entry.seq, id: entry.id },
        });
        break;
      }

      case "assistant/message": {
        // If role is verifier, we exclude raw assistant chat reasoning that isn't final output
        const text = typeof entry.data === "string" ? entry.data : String((entry.data as any)?.content ?? JSON.stringify(entry.data));
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
              content: typeof data.result === "string" ? data.result : JSON.stringify(data.result ?? data.error ?? ""),
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
        const planText = typeof entry.data === "string" ? entry.data : JSON.stringify(entry.data, null, 2);
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
          const text = typeof entry.data === "string" ? entry.data : String((entry.data as any)?.content ?? JSON.stringify(entry.data));
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

  return messages;
}
