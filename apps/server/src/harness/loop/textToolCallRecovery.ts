// FILE: textToolCallRecovery.ts
// Purpose: Recover tool calls that weak models serialize as TEXT instead of
// native function calls — e.g. `<function=write_file><parameter=...>` blocks
// or `<dyad-write>` tags. Without this, the raw markup lands in the
// transcript, nothing executes, and the turn ends with no visible work.
// Recovery maps text blocks onto registry tools so they execute through the
// normal path (consent gating, timeouts, tool_call events) and feed next steps.
// Only names present in the turn's tool map are recovered — unknown names
// stay visible as text so the failure is debuggable, never silently dropped.

import { getCaideWriteTags, parseFunctionTagCalls } from "../utils/caideTagParser.ts";

export interface RecoveredToolCall {
  id: string;
  name: string;
  args: unknown;
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
  let index = 0;
  const nextId = () => `${idPrefix}-${index++}`;

  for (const call of parseFunctionTagCalls(stepText)) {
    if (!isKnownTool(call.name)) continue;
    recovered.push({ id: nextId(), name: call.name, args: { ...call.args } });
  }

  // dyad-write/caide-write tags in Agent (native) mode: the tag parser is
  // otherwise only consulted on the legacy build path.
  if (isKnownTool("write_file")) {
    for (const tag of getCaideWriteTags(stepText)) {
      // write_file schema is strict {path, content} — drop description.
      if (!tag.path || !tag.content) continue;
      recovered.push({
        id: nextId(),
        name: "write_file",
        args: { path: tag.path, content: tag.content },
      });
    }
  }

  return recovered;
}
