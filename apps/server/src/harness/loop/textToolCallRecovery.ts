// FILE: textToolCallRecovery.ts
// Purpose: Recover tool calls that weak models serialize as TEXT instead of
// native function calls — e.g. `<function=write_file><parameter=...>` blocks
// or `<dyad-write>` tags. Without this, the raw markup lands in the
// transcript, nothing executes, and the turn ends with no visible work.
// Recovery maps text blocks onto registry tools so they execute through the
// normal path (consent gating, timeouts, tool_call events) and feed next steps.
// Only names present in the turn's tool map are recovered — unknown names
// stay visible as text so the failure is debuggable, never silently dropped.

import {
  getCaideWriteTags,
  parseFunctionTagCalls,
  stripCaideTags,
  stripFunctionTagCalls,
} from "../utils/caideTagParser.ts";

export interface RecoveredToolCall {
  id: string;
  name: string;
  args: unknown;
}

interface RawToolCandidate {
  name: string;
  args: unknown;
  id?: string;
  rawSpan: string;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Scan text for balanced JSON arrays `[...]` or objects `{...}` that represent
 * text-serialized tool calls from models (Anthropic `tool_use`, OpenAI function calls).
 */
function extractJsonToolCandidates(text: string): RawToolCandidate[] {
  const candidates: RawToolCandidate[] = [];

  // First check code blocks: ```json ... ``` or ``` ... ```
  let textWithoutBlocks = text;
  const codeBlockRe = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = codeBlockRe.exec(text)) !== null) {
    const blockContent = blockMatch[1]?.trim();
    if (!blockContent) continue;
    const parsed = tryParseJson(blockContent);
    if (parsed) {
      const extracted = parseToolCallsFromParsedJson(parsed, blockMatch[0]);
      if (extracted.length > 0) {
        candidates.push(...extracted);
        textWithoutBlocks = textWithoutBlocks.replace(blockMatch[0], "");
      }
    }
  }

  // Next scan raw text for top-level JSON arrays or objects containing tool_use/function calls
  let i = 0;
  while (i < textWithoutBlocks.length) {
    const char = textWithoutBlocks[i];
    if (char === "[" || char === "{") {
      const start = i;
      const stack: string[] = [char];
      let inString = false;
      let escaped = false;
      i += 1;

      while (i < textWithoutBlocks.length && stack.length > 0) {
        const c = textWithoutBlocks[i];
        if (escaped) {
          escaped = false;
        } else if (c === "\\") {
          escaped = true;
        } else if (c === '"') {
          inString = !inString;
        } else if (!inString) {
          if (c === "[" || c === "{") {
            stack.push(c);
          } else if (c === "]") {
            if (stack[stack.length - 1] === "[") stack.pop();
            else break;
          } else if (c === "}") {
            if (stack[stack.length - 1] === "{") stack.pop();
            else break;
          }
        }
        i += 1;
      }

      if (stack.length === 0) {
        const raw = textWithoutBlocks.slice(start, i);
        // Only attempt parsing if it mentions tool-like tokens to avoid expensive parsing of arbitrary text
        if (raw.includes('"tool_use"') || raw.includes('"name"') || raw.includes('"function"')) {
          const parsed = tryParseJson(raw);
          if (parsed) {
            const extracted = parseToolCallsFromParsedJson(parsed, raw);
            candidates.push(...extracted);
          }
        }
      }
    } else {
      i += 1;
    }
  }

  return candidates;
}

function parseToolCallsFromParsedJson(parsed: unknown, rawSpan: string): RawToolCandidate[] {
  const result: RawToolCandidate[] = [];

  const inspectItem = (item: any) => {
    if (!item || typeof item !== "object") return;

    // 1. Anthropic format: {"type": "tool_use", "id": "...", "name": "...", "input": {...}}
    if (item.type === "tool_use" && typeof item.name === "string" && item.name.trim()) {
      let args = item.input ?? {};
      if (typeof args === "string") {
        const p = tryParseJson(args);
        if (p && typeof p === "object") args = p;
      }
      result.push({
        name: item.name.trim(),
        args,
        id: typeof item.id === "string" ? item.id.trim() : undefined,
        rawSpan,
      });
      return;
    }

    // 2. OpenAI format: {"type": "function", "function": {"name": "...", "arguments": ...}}
    if (
      item.type === "function" &&
      item.function &&
      typeof item.function.name === "string" &&
      item.function.name.trim()
    ) {
      let args = item.function.arguments ?? {};
      if (typeof args === "string") {
        const p = tryParseJson(args);
        if (p && typeof p === "object") args = p;
      }
      result.push({
        name: item.function.name.trim(),
        args,
        id: typeof item.id === "string" ? item.id.trim() : undefined,
        rawSpan,
      });
      return;
    }

    // 3. Generic format: {"name": "...", "input" | "arguments": ...}
    if (
      typeof item.name === "string" &&
      item.name.trim() &&
      (item.arguments !== undefined || item.input !== undefined)
    ) {
      let args = item.input !== undefined ? item.input : (item.arguments ?? {});
      if (typeof args === "string") {
        const p = tryParseJson(args);
        if (p && typeof p === "object") args = p;
      }
      result.push({
        name: item.name.trim(),
        args,
        id: typeof item.id === "string" ? item.id.trim() : undefined,
        rawSpan,
      });
    }
  };

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      inspectItem(item);
    }
  } else {
    inspectItem(parsed);
  }

  return result;
}

/**
 * Scan step text for text-serialized tool calls and map them onto known
 * tools. Runs only when a step produced zero native calls (the failure
 * mode) — native calls always win to avoid double-execution.
 */
export function recoverTextToolCalls(
  stepText: string,
  isKnownTool: (name: string) => boolean,
  idPrefix = "text-recovery",
): RecoveredToolCall[] {
  const recovered: RecoveredToolCall[] = [];
  const seenIds = new Set<string>();
  let index = 0;

  const getUniqueId = (candidateId?: string): string => {
    if (candidateId && !seenIds.has(candidateId)) {
      seenIds.add(candidateId);
      return candidateId;
    }
    const id = candidateId ? `${candidateId}-${index++}` : `${idPrefix}-${index++}`;
    seenIds.add(id);
    return id;
  };

  // 1. Tag-based calls: <function=write_file><parameter=...>
  for (const call of parseFunctionTagCalls(stepText)) {
    if (!isKnownTool(call.name)) continue;
    recovered.push({ id: getUniqueId(), name: call.name, args: { ...call.args } });
  }

  // 2. dyad-write/caide-write tags in Agent (native) mode: the tag parser is
  // otherwise only consulted on the legacy build path.
  if (isKnownTool("write_file")) {
    for (const tag of getCaideWriteTags(stepText)) {
      // write_file schema is strict {path, content} — drop description.
      if (!tag.path || !tag.content) continue;
      recovered.push({
        id: getUniqueId(),
        name: "write_file",
        args: { path: tag.path, content: tag.content },
      });
    }
  }

  // 3. JSON-serialized tool calls (Anthropic tool_use array/object, OpenAI calls, markdown codeblocks)
  const jsonCandidates = extractJsonToolCandidates(stepText);
  for (const candidate of jsonCandidates) {
    if (!isKnownTool(candidate.name)) continue;
    recovered.push({
      id: getUniqueId(candidate.id),
      name: candidate.name,
      args: candidate.args,
    });
  }

  return recovered;
}

/**
 * Remove text-serialized tool calls from message text so leaked JSON or tags
 * do not clutter the chat transcript.
 */
export function stripRecoveredToolCalls(text: string): string {
  return stripCaideTags(text);
}
