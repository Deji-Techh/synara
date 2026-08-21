// FILE: artifactsGrid.logic.ts
// Purpose: Pure sorting/filtering/formatting helpers for the global build-
//          artifact gallery (every APK/AAB/IPA ever built).
// Layer: Web UI logic

import type { ArtifactKind, ArtifactRecord } from "@caide/contracts";

export type ArtifactSortBy = "createdAt" | "name" | "size" | "kind";
export type ArtifactSortDirection = "asc" | "desc";

export interface ArtifactSort {
  by: ArtifactSortBy;
  direction: ArtifactSortDirection;
}

export const DEFAULT_ARTIFACT_SORT: ArtifactSort = { by: "createdAt", direction: "desc" };

const EMPTY_TIMESTAMP = 0;

function timestampOf(iso: string | undefined): number {
  if (!iso) return EMPTY_TIMESTAMP;
  const time = new Date(iso).getTime();
  return Number.isFinite(time) ? time : EMPTY_TIMESTAMP;
}

function compareArtifacts(a: ArtifactRecord, b: ArtifactRecord, by: ArtifactSortBy): number {
  switch (by) {
    case "name":
      return a.displayName.localeCompare(b.displayName);
    case "size":
      return a.sizeBytes - b.sizeBytes;
    case "kind":
      return a.kind.localeCompare(b.kind) || timestampOf(b.createdAt) - timestampOf(a.createdAt);
    case "createdAt":
      return timestampOf(a.createdAt) - timestampOf(b.createdAt);
  }
}

export function sortArtifacts(
  records: readonly ArtifactRecord[],
  sort: ArtifactSort,
): ArtifactRecord[] {
  if (records.length === 0) return [];
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...records].sort((a, b) => compareArtifacts(a, b, sort.by) * direction);
}

export function filterArtifacts(
  records: readonly ArtifactRecord[],
  query: string,
): ArtifactRecord[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...records];
  return records.filter((record) => {
    const haystacks = [
      record.displayName,
      record.fileName,
      record.projectName ?? "",
      record.kind,
    ].map((part) => part.toLowerCase());
    return haystacks.some((part) => part.includes(needle));
  });
}

/** Human-readable binary size: 0 B, 512 B, 1.5 MB, 42.0 MB, 1.2 GB. */
export function formatArtifactSize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  let value = sizeBytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded = unitIndex === 0 ? String(value) : value.toFixed(1);
  return `${rounded} ${units[unitIndex]}`;
}

export function artifactKindLabel(kind: ArtifactKind): string {
  switch (kind) {
    case "apk":
      return "Android APK";
    case "aab":
      return "Android bundle";
    case "ipa":
      return "iOS app";
  }
}

/** Short uppercase badge text for the card chip. */
export function artifactKindBadge(kind: ArtifactKind): string {
  switch (kind) {
    case "apk":
      return "APK";
    case "aab":
      return "AAB";
    case "ipa":
      return "IPA";
  }
}
