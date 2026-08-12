// FILE: historyGrid.logic.test.ts
// Purpose: Unit tests for History grid sorting, filtering, and share text.
// Layer: Web UI logic tests

import { ProjectId } from "@caide/contracts";
import { describe, expect, it } from "vitest";

import {
  buildProjectShareText,
  filterHistoryProjects,
  historyProjectDateLabel,
  historyProjectSortDirectionLabel,
  sortHistoryProjects,
  type HistorySort,
} from "./historyGrid.logic";
import type { Project } from "./types";

const project = (overrides: {
  id?: string;
  name?: string;
  folderName?: string;
  cwd?: string;
  createdAt?: string;
  updatedAt?: string;
}): Project =>
  ({
    id: ProjectId.makeUnsafe(overrides.id ?? "project-1"),
    kind: "chat",
    name: overrides.name ?? "Alpha",
    folderName: overrides.folderName ?? "alpha",
    remoteName: "origin",
    localName: null,
    cwd: overrides.cwd ?? "/home/me/alpha",
    defaultModelSelection: null,
    expanded: false,
    scripts: [],
    ...(overrides.createdAt !== undefined ? { createdAt: overrides.createdAt } : {}),
    ...(overrides.updatedAt !== undefined ? { updatedAt: overrides.updatedAt } : {}),
  }) as Project;

describe("sortHistoryProjects", () => {
  const raw = [
    project({
      id: "a",
      name: "Zed",
      updatedAt: "2026-03-01T00:00:00Z",
      createdAt: "2026-01-01T00:00:00Z",
    }),
    project({
      id: "b",
      name: "Alpha",
      updatedAt: "2026-02-01T00:00:00Z",
      createdAt: "2026-01-02T00:00:00Z",
    }),
    project({ id: "c", name: "Beta", createdAt: "2026-01-03T00:00:00Z" }),
  ];

  it("sorts by newest updatedAt first by default", () => {
    const sorted = sortHistoryProjects(raw, { by: "updatedAt", direction: "desc" });
    expect(sorted.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("sorts by createdAt when updatedAt is missing", () => {
    const sorted = sortHistoryProjects(raw, { by: "createdAt", direction: "desc" });
    expect(sorted.map((p) => p.id)).toEqual(["c", "b", "a"]);
  });

  it("sorts by name in both directions", () => {
    expect(sortHistoryProjects(raw, { by: "name", direction: "asc" }).map((p) => p.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
    expect(sortHistoryProjects(raw, { by: "name", direction: "desc" }).map((p) => p.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("does not mutate the input array", () => {
    const rawCopy = [...raw];
    sortHistoryProjects(raw, { by: "name", direction: "asc" });
    expect(raw).toEqual(rawCopy);
  });

  it("returns an empty array for empty input", () => {
    expect(sortHistoryProjects([], { by: "updatedAt", direction: "desc" })).toEqual([]);
  });
});

describe("filterHistoryProjects", () => {
  const raw = [
    project({ id: "a", name: "Flappy Bird", folderName: "flappy", cwd: "/work/flappy" }),
    project({ id: "b", name: "Budget", folderName: "ledger", cwd: "/work/budget" }),
  ];

  it("returns a copy of all projects when the query is blank", () => {
    const out = filterHistoryProjects(raw, "  ");
    expect(out).toHaveLength(2);
    expect(out).not.toBe(raw);
  });

  it("matches name case-insensitively", () => {
    expect(filterHistoryProjects(raw, "flappy").map((p) => p.id)).toEqual(["a"]);
  });

  it("matches folderName", () => {
    expect(filterHistoryProjects(raw, "ledger").map((p) => p.id)).toEqual(["b"]);
  });

  it("matches across multiple fields", () => {
    expect(filterHistoryProjects(raw, "app").map((p) => p.id)).toEqual(["a"]);
  });

  it("returns nothing for a miss", () => {
    expect(filterHistoryProjects(raw, "nope")).toEqual([]);
  });
});

describe("historyProjectDateLabel", () => {
  it("prefers updatedAt", () => {
    const p = project({ updatedAt: "2026-02-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" });
    expect(historyProjectDateLabel(p)).toBe("2026-02-01T00:00:00Z");
  });

  it("falls back to createdAt", () => {
    const p = project({ createdAt: "2026-01-01T00:00:00Z" });
    expect(historyProjectDateLabel(p)).toBe("2026-01-01T00:00:00Z");
  });

  it("returns null when neither exists", () => {
    expect(historyProjectDateLabel(project({}))).toBeNull();
  });
});

describe("buildProjectShareText", () => {
  it("describes the project for sharing", () => {
    expect(buildProjectShareText(project({ id: "a", name: "Flappy", cwd: "/work/flappy" }))).toBe(
      "Project: Flappy\nKind: chat\nPath: /work/flappy",
    );
  });
});

describe("historyProjectSortDirectionLabel", () => {
  it.each<[HistorySort, string]>([
    [{ by: "updatedAt", direction: "desc" }, "Newest first"],
    [{ by: "name", direction: "asc" }, "Oldest first"],
  ])("maps %o to %s", (sort, label) => {
    expect(historyProjectSortDirectionLabel(sort)).toBe(label);
  });
});
