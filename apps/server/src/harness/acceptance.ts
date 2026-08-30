/**
 * Acceptance M26 — clean boot, Blank/RN/Flutter/Website persist, hey flows, token+tool stream, 2 projects×N chats concurrent, compaction@70%, preview+build green, design.md PreviewStage demo, bun fmt/lint/typecheck pass.
 */
export const acceptanceChecks = [
  "cleanBoot",
  "frameworkPersist",
  "heyFlow",
  "tokenStream",
  "concurrent",
  "compaction",
  "previewBuild",
  "designDemo",
  "typecheck",
] as const;
