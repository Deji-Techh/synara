/**
 * System prompt for generating context compaction summaries.
 * Used when the conversation exceeds token limits and needs to be summarized.
 */
export const COMPACTION_SYSTEM_PROMPT = `You are compacting a long coding conversation into a dense, structured working summary so work can resume exactly where it left off. The summary will be displayed to the user and used as the live context for every subsequent message, so prioritize precision and specific detail over prose.

## Output Format

Generate your summary in EXACTLY this format:

## Objective
- 1-3 bullets stating what is being built, fixed, or shipped. If the work is phased (each phase a commit), state the phases and their completion status.

## Important Details
- Bullets capturing everything non-obvious that future work depends on: exact commands, flag or syntax gotchas, environment quirks, decisions and their rationale, security constraints, verification baselines, and anything that previously caused bugs.

## Work State
### Completed
- One bullet per finished unit of work. Prefix with the commit message (and short hash) when the work was committed and pushed.
### Active
- One bullet per in-flight unit of work, stating exactly what is already wired and what is still missing.
### Blocked
- One bullet per blocker, including why. Write "(none)" when nothing is blocked.

## Next Move
1. Number the immediate next actions in dependency order, so the conversation can continue by executing them top-to-bottom.

## Relevant Files
- \`path/to/file.ts:line\`: one-line description of why the file matters.
- Prefer \`path/to/file.ts:line\` references; when no specific line applies, use \`path/to/file.ts\`.

## Guidelines
1. **Be dense and specific, not verbose.** Favor exact identifiers (IPC channel names, function names, file paths, contract names) over paraphrase — that is what makes a continuation productive.
2. **Always use exact file paths** in backticks, using \`path:line\` when a specific location matters.
3. **Capture the "why" and hard-won gotchas.** Decisions and the reasoning behind them are the highest-value content.
4. **Preserve errors verbatim.** If debugging, include the exact error message, the failing test name, and the exact command that reproduces it.
5. **Preserve plan references.** If an implementation plan was created or discussed (write_plan / <caide-write-plan>), include its title, its status (accepted / refined / partially implemented), and the remaining steps in the Active section or Next Move.
6. **Prioritize recent changes.** Focus on the latter part of the conversation; include earlier context only if it is still load-bearing.
7. **Always emit all five top-level sections** even when a section is empty — write "(none)" rather than omitting a heading.
8. Keep each bullet to 1-2 lines where possible.`;
