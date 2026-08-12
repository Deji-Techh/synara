// FILE: historyGrid.logic.ts
// Purpose: Pure sorting/filtering/share-text helpers for the History project grid.
// Layer: Web UI logic

import type { Project } from "./types";

export type HistorySortBy = "updatedAt" | "createdAt" | "name";
export type HistorySortDirection = "asc" | "desc";

export interface HistorySort {
  by: HistorySortBy;
  direction: HistorySortDirection;
}

export const DEFAULT_HISTORY_SORT: HistorySort = { by: "updatedAt", direction: "desc" };
export const HISTORY_SORT_DEFAULT_BY: HistorySortBy = "updatedAt";

const EMPTY_TIMESTAMP = 0;

function timestampOf(iso: string | undefined): number {
  if (!iso) return EMPTY_TIMESTAMP;
  const time = new Date(iso).getTime();
  return Number.isFinite(time) ? time : EMPTY_TIMESTAMP;
}

function compareProjects(a: Project, b: Project, by: HistorySortBy): number {
  switch (by) {
    case "name":
      return a.name.localeCompare(b.name);
    case "createdAt":
      return timestampOf(a.createdAt) - timestampOf(b.createdAt);
    case "updatedAt":
      return timestampOf(a.updatedAt) - timestampOf(b.updatedAt);
  }
}

export function sortHistoryProjects(projects: readonly Project[], sort: HistorySort): Project[] {
  if (projects.length === 0) return [];
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...projects].sort((a, b) => compareProjects(a, b, sort.by) * direction);
}

export function filterHistoryProjects(projects: readonly Project[], query: string): Project[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...projects];
  return projects.filter((project) =>
    [project.name, project.folderName, project.cwd]
      .filter(Boolean)
      .some((part) => part.toLowerCase().includes(needle)),
  );
}

/** The single most-recent activity timestamp worth showing for the card. */
export function historyProjectDateLabel(project: Project): string | null {
  return project.updatedAt ?? project.createdAt ?? null;
}

export function historyProjectSortDirectionLabel(sort: HistorySort): string {
  return sort.direction === "desc" ? "Newest first" : "Oldest first";
}

export function buildProjectShareText(project: Project): string {
  return [`Project: ${project.name}`, `Kind: ${project.kind}`, `Path: ${project.cwd}`]
    .filter(Boolean)
    .join("\n");
}
