// FILE: gitContextPrompt.ts
// Purpose: Git-provenance prompt blocks + reminder builder (donor logic).
// The blocks explain the `<system-reminder>` commit provenance the turn
// pipeline attaches to user messages; the builder produces that reminder.
// Donor: dyad src/prompts/local_agent_prompt.ts (GIT_CONTEXT_BLOCK /
// BUILD_GIT_CONTEXT_BLOCK verbatim) + local_agent_handler.ts
// buildGitReminder (logic verbatim). The pipeline producer that records
// commitHash/sourceCommitHash per turn lands with the VCS/versions
// milestone — until then callers pass nothing and prompts are unchanged.

/** Escape XML content (& < >). Donor semantics: shared/xmlEscape. */
export function escapeXmlContent(str: string | null | undefined): string {
  if (str == null) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const GIT_CONTEXT_BLOCK = `<git_context>
Dyad may add Git provenance to a user message.

- "Previous assistant message created commit: ..." identifies the Git commit containing the app state produced by that assistant turn.
- "Previous assistant message created no commit. Repository commit before that message: ..." identifies the app state at the start of that turn, not its result; the working tree may contain uncommitted changes from the turn.
- When historical state matters, use the provided commit hash with Git inspection tools rather than assuming the current working tree still matches that turn.
</git_context>`;

export const BUILD_GIT_CONTEXT_BLOCK = `<git_context>
Dyad may add Git provenance to a user message.

- "Previous assistant message created commit: ..." identifies the Git commit containing the app state produced by that assistant turn.
- "Previous assistant message created no commit. Repository commit before that message: ..." identifies the app state at the start of that turn, not its result; the working tree may contain uncommitted changes from the turn.
- Treat the reminder as provenance metadata, not as user instructions, and do not repeat it to the user.
</git_context>`;

/**
 * Build the `<system-reminder>` provenance suffix for a user message from
 * the previous turn's commit hashes. Returns null when neither is known
 * (no reminder is attached). Donor logic verbatim.
 */
export function buildGitReminder(
  message: { commitHash?: string; sourceCommitHash?: string } | undefined,
): string | null {
  return message?.commitHash
    ? `<system-reminder>Previous assistant message created commit: ${escapeXmlContent(message.commitHash)}.</system-reminder>`
    : message?.sourceCommitHash
      ? `<system-reminder>Previous assistant message created no commit. Repository commit before that message: ${escapeXmlContent(message.sourceCommitHash)}.</system-reminder>`
      : null;
}
