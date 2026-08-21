// FILE: artifactsGrid.logic.test.ts
// Purpose: Unit tests for Artifacts gallery sorting, filtering, and formatting.
// Layer: Web UI logic tests

import type { ArtifactRecord } from "@caide/contracts";
import { describe, expect, it } from "vitest";

import {
  artifactKindBadge,
  artifactKindLabel,
  filterArtifacts,
  formatArtifactSize,
  sortArtifacts,
  type ArtifactSort,
} from "./artifactsGrid.logic";

let sequence = 0;

const artifact = (overrides: {
  displayName?: string;
  fileName?: string;
  projectName?: string | null;
  kind?: ArtifactRecord["kind"];
  channel?: string | null;
  sizeBytes?: number;
  createdAt?: string;
}): ArtifactRecord =>
  ({
    id: `artifact-${(sequence += 1)}`,
    projectId: null,
    projectName: overrides.projectName ?? "My App",
    threadId: "thread-1",
    displayName: overrides.displayName ?? "app-release.apk",
    fileName: overrides.fileName ?? "app-release.apk",
    kind: overrides.kind ?? "apk",
    channel: overrides.channel ?? "release",
    target: "apk",
    filePath: `/home/me/caide-apps/my-app/.caide/artifacts/id/${overrides.fileName ?? "app-release.apk"}`,
    sizeBytes: overrides.sizeBytes ?? 1024,
    sha256: null,
    createdAt: overrides.createdAt ?? "2026-01-01T00:00:00.000Z",
  }) as ArtifactRecord;

describe("sortArtifacts", () => {
  it("sorts newest first by default direction", () => {
    const older = artifact({ displayName: "older", createdAt: "2026-01-01T00:00:00.000Z" });
    const newer = artifact({ displayName: "newer", createdAt: "2026-02-01T00:00:00.000Z" });
    const sort: ArtifactSort = { by: "createdAt", direction: "desc" };
    expect(sortArtifacts([older, newer], sort).map((a) => a.displayName)).toEqual([
      "newer",
      "older",
    ]);
  });

  it("sorts by name ascending", () => {
    const b = artifact({ displayName: "Beta" });
    const a = artifact({ displayName: "Alpha" });
    const sort: ArtifactSort = { by: "name", direction: "asc" };
    expect(sortArtifacts([b, a], sort).map((item) => item.displayName)).toEqual(["Alpha", "Beta"]);
  });

  it("sorts by size descending", () => {
    const small = artifact({ displayName: "small", sizeBytes: 1 });
    const large = artifact({ displayName: "large", sizeBytes: 1000 });
    const sort: ArtifactSort = { by: "size", direction: "desc" };
    expect(sortArtifacts([small, large], sort).map((item) => item.displayName)).toEqual([
      "large",
      "small",
    ]);
  });

  it("groups by kind and breaks ties newest-first", () => {
    const apkOld = artifact({ displayName: "apk-old", kind: "apk", createdAt: "2026-01-01T00:00:00.000Z" });
    const aabNew = artifact({ displayName: "aab-new", kind: "aab", createdAt: "2026-03-01T00:00:00.000Z" });
    const apkNew = artifact({ displayName: "apk-new", kind: "apk", createdAt: "2026-02-01T00:00:00.000Z" });
    const sort: ArtifactSort = { by: "kind", direction: "asc" };
    expect(sortArtifacts([apkOld, aabNew, apkNew], sort).map((item) => item.displayName)).toEqual([
      "aab-new",
      "apk-new",
      "apk-old",
    ]);
  });

  it("does not mutate the input array", () => {
    const a = artifact({ displayName: "A", createdAt: "2026-01-01T00:00:00.000Z" });
    const b = artifact({ displayName: "B", createdAt: "2026-02-01T00:00:00.000Z" });
    const input = [b, a];
    sortArtifacts(input, { by: "createdAt", direction: "asc" });
    expect(input.map((item) => item.displayName)).toEqual(["B", "A"]);
  });
});

describe("filterArtifacts", () => {
  it("matches display name, file name, project name, and kind", () => {
    const record = artifact({
      displayName: "Release build",
      fileName: "app-release.aab",
      projectName: "Notes",
      kind: "aab",
    });
    for (const query of ["release", "app-release", "notes", "aab"]) {
      expect(filterArtifacts([record], query)).toHaveLength(1);
    }
    expect(filterArtifacts([record], "nomatch")).toHaveLength(0);
  });

  it("returns all records for blank queries without reordering", () => {
    const a = artifact({ displayName: "A" });
    const b = artifact({ displayName: "B" });
    expect(filterArtifacts([a, b], "  ")).toEqual([a, b]);
  });
});

describe("formatArtifactSize", () => {
  it("formats bytes through gigabytes", () => {
    expect(formatArtifactSize(0)).toBe("0 B");
    expect(formatArtifactSize(512)).toBe("512 B");
    expect(formatArtifactSize(1024)).toBe("1.0 KB");
    expect(formatArtifactSize(42 * 1024 * 1024)).toBe("42.0 MB");
    expect(formatArtifactSize(1.2 * 1024 * 1024 * 1024)).toBe("1.2 GB");
  });
});

describe("kind labels", () => {
  it("maps kinds to badge and full labels", () => {
    expect(artifactKindBadge("apk")).toBe("APK");
    expect(artifactKindBadge("aab")).toBe("AAB");
    expect(artifactKindBadge("ipa")).toBe("IPA");
    expect(artifactKindLabel("apk")).toBe("Android APK");
    expect(artifactKindLabel("aab")).toBe("Android bundle");
    expect(artifactKindLabel("ipa")).toBe("iOS app");
  });
});
