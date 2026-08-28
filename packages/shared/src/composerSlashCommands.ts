// FILE: composerSlashCommands.ts
// Purpose: Share Caide's built-in composer slash command names across web UI
//          parsing and server-side profile stats backfills.
// Layer: Shared runtime utility
// Exports: command-name constants and normalization helpers.

/** Perfect builder slash set — 13 wired to real harness modes/quality gates.
 *  `preview` toggles the floating 672px stage (M11 visual verification).
 *  `build` + `test`/`analyze` drive distribution + qualityGate (M16/M21).
 *  `plan`/`debug`/`default` switch Plan / Evidence-first Debug / Normal stage context (M4).
 *  `review` triggers comparative benchmark (M16g). `fork`/`side` branch threads,
 *  `status` shows context window + rate-limit, `clear`/`compact` fresh + compaction @70%.
 *  `theme` switches the palette via theme changer. All other legacy engine
 *  commands (init/spawn/btw/goal/etc.) are deleted — see plans/002 §3.
 *  Keep `theme` as palette switcher; `model` is Router-decided per role/budget (M20). */
export const BUILT_IN_COMPOSER_SLASH_COMMANDS = [
  "preview",
  "build",
  "test",
  "analyze",
  "plan",
  "debug",
  "default",
  "review",
  "fork",
  "side",
  "status",
  "clear",
  "compact",
  "theme",
] as const;

export type BuiltInComposerSlashCommand = (typeof BUILT_IN_COMPOSER_SLASH_COMMANDS)[number];

export function normalizeComposerSlashCommandName(value: string): string {
  return value.trim().replace(/^\/+/, "").toLowerCase();
}

export function isBuiltInComposerSlashCommandName(
  value: string,
): value is BuiltInComposerSlashCommand {
  const normalizedValue = normalizeComposerSlashCommandName(value);
  return BUILT_IN_COMPOSER_SLASH_COMMANDS.some((command) => command === normalizedValue);
}
