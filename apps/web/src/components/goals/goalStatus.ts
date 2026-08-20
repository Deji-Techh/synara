// FILE: goalStatus.ts
// Purpose: Pure display helpers for engine goal/run/activity states. These are
//          shared by the dock GoalsPanel and the GoalComposerStrip so labels,
//          tones and formatting stay identical everywhere.
// Layer: Web UI helpers (no React, no WS)
// Exports: status labels, tone/dot class names, run kind labels, subagent
//          metadata detection, and timestamp formatters.

import type { GoalRunKind, GoalRunStatus, GoalStatus, GoalTaskStatus } from "@caide/contracts";

/** Terminal goal states: no live execution, no recovery controls offered. */
export const GOAL_TERMINAL_STATUSES: readonly GoalStatus[] = ["completed", "cancelled"];

/** States that count as an in-flight/live goal for the composer strip + overlay. */
export const GOAL_LIVE_STATUSES: readonly GoalStatus[] = [
  "draft",
  "active",
  "running",
  "pausing",
  "paused",
  "verifying",
  "repairing",
  "blocked",
  "awaiting-user",
];

/** States where the engine is actively doing work (spinner + "running" look). */
export const GOAL_WORKING_STATUSES: readonly GoalStatus[] = ["running", "verifying", "repairing"];

export function goalStatusLabel(status: GoalStatus): string {
  return status.replace(/-/g, " ");
}

export function goalStatusLabelClass(status: GoalStatus): string {
  if (status === "completed") return "text-emerald-600 dark:text-emerald-400";
  if (status === "cancelled") return "text-destructive";
  if (status === "blocked" || status === "awaiting-user")
    return "text-amber-600 dark:text-amber-400";
  if (status === "paused" || status === "pausing") return "text-muted-foreground";
  return "text-primary";
}

export function goalStatusDotClass(status: GoalStatus): string {
  if (status === "completed") return "bg-emerald-500";
  if (status === "cancelled") return "bg-destructive";
  if (status === "blocked" || status === "awaiting-user") return "bg-amber-500";
  if (status === "paused" || status === "pausing") return "bg-muted-foreground";
  return "bg-primary";
}

export function goalRunKindLabel(kind: GoalRunKind): string {
  return kind; // plan / execute / repair / verify — labels match the engine.
}

export function goalRunStatusLabel(status: GoalRunStatus): string {
  return status.replace(/-/g, " ");
}

export function goalRunStatusLabelClass(status: GoalRunStatus): string {
  if (status === "succeeded") return "text-emerald-600 dark:text-emerald-400";
  if (status === "failed" || status === "cancelled") return "text-destructive";
  if (status === "running" || status === "claimed") return "text-primary";
  return "text-muted-foreground";
}

export function goalTaskStatusTone(status: GoalTaskStatus): string {
  if (status === "verified") return "text-emerald-600 dark:text-emerald-400";
  if (status === "blocked" || status === "awaiting-approval")
    return "text-amber-600 dark:text-amber-400";
  if (status === "running" || status === "verifying" || status === "repairing")
    return "text-primary";
  if (status === "skipped" || status === "cancelled") return "text-destructive";
  return "text-muted-foreground";
}

const SUBAGENT_METADATA_KEYS: readonly string[] = [
  "subagent",
  "subagentId",
  "agent",
  "agentId",
  "agentName",
  "helper",
];

/**
 * Detects whether an activity event row represents subagent work by inspecting
 * its engine-provided metadata. Keys are matched structurally (a subagent id,
 * name or flag) and the value must be a non-empty truthy string; bare booleans
 * fall through to the generic `description` label so rows stay data-honest.
 * Returns the subagent name when known, else null when the event is not a
 * subagent row.
 */
export function activitySubagentLabel(metadata: Record<string, unknown>): string | null {
  for (const key of SUBAGENT_METADATA_KEYS) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

/** Tool metadata (e.g. a shell command or file edit) for tagging agent rows. */
export function activityToolLabel(metadata: Record<string, unknown>): string | null {
  const value = metadata["tool"];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function formatGoalTimestamp(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  return new Date(ms).toLocaleTimeString();
}

export function formatGoalDateTime(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  return new Date(ms).toLocaleString();
}

/**
 * Compact relative time for run rows ("just now", "42s ago", "5m ago"), with a
 * zero-padded clock fallback so live rows degrade gracefully when over a day.
 */
export function formatGoalRelativeTime(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  const elapsedMs = Date.now() - ms;
  if (elapsedMs < 0) return "just now";
  const seconds = Math.floor(elapsedMs / 1_000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return formatGoalDateTime(ms);
}
