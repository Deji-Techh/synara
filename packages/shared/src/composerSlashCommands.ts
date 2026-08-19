// FILE: composerSlashCommands.ts
// Purpose: Share Caide's built-in composer slash command names across web UI
//          parsing and server-side profile stats backfills.
// Layer: Shared runtime utility
// Exports: command-name constants and normalization helpers.

export const BUILT_IN_COMPOSER_SLASH_COMMANDS = [
  "init",
  "spawn",
  "btw",
  "goal",
  "schedule",
  "browser",
  "grill-me",
  "teamwork-preview",
  "learn",
  "doctor",
  "test",
  "analyze",
  "build",
  "preview",
  "theme",
  "clear",
  "compact",
  "model",
  "plan",
  "debug",
  "default",
  "review",
  "fork",
  "side",
  "status",
  "subagents",
  "fast",
  "export",
  "feedback",
  "automation",
  // Dyad/engine registry commands surfaced to the composer so the shared
  // package stays the single source of truth for what the web parses/menus.
  // The engine does not yet expose its command registry over RPC; when it does
  // (`slash:list`), that response should replace this static mirror.
  "goals",
  "commands",
  "help",
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
