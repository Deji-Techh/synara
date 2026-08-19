import { describe, expect, it } from "vitest";

import type { ProjectActivityItem } from "@caide/contracts";

import {
  formatActivityTime,
  formatProjectActivityDayLabel,
  groupProjectActivityByDay,
} from "./projectActivity";

function item(at: number, overrides: Partial<ProjectActivityItem> = {}): ProjectActivityItem {
  return {
    id: `item-${at}`,
    kind: "chat",
    at,
    summary: "Summary",
    ...overrides,
  };
}

function localDayKey(atMs: number): string {
  const date = new Date(atMs);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

describe("formatActivityTime", () => {
  it("formats an epoch-ms timestamp as local HH:MM", () => {
    const date = new Date(2026, 7, 19, 14, 5);
    expect(formatActivityTime(date.getTime())).toBe("14:05");
  });
});

describe("formatProjectActivityDayLabel", () => {
  it("labels today and yesterday", () => {
    const now = new Date(2026, 7, 19, 12, 0).getTime();
    const today = new Date(2026, 7, 19, 9, 0).getTime();
    const yesterday = new Date(2026, 7, 18, 23, 30).getTime();
    const older = new Date(2026, 7, 15, 10, 0).getTime();
    expect(formatProjectActivityDayLabel(localDayKey(today), now)).toBe("Today");
    expect(formatProjectActivityDayLabel(localDayKey(yesterday), now)).toBe("Yesterday");
    expect(formatProjectActivityDayLabel(localDayKey(older), now)).toMatch(/^\w{3}, \w{3} \d+$/);
  });
});

describe("groupProjectActivityByDay", () => {
  it("groups items by local day and sorts groups newest-first", () => {
    const now = new Date(2026, 7, 19, 12, 0).getTime();
    const olderDay = new Date(2026, 7, 17, 10, 0).getTime();
    const laterDay = new Date(2026, 7, 18, 10, 0).getTime();
    const groups = groupProjectActivityByDay([
      item(olderDay, { id: "old" }),
      item(laterDay, { id: "mid" }),
      item(now, { id: "today-1" }),
      item(now + 1000, { id: "today-2" }),
    ]);
    expect(groups.map((group) => group.dayKey)).toEqual([
      localDayKey(now),
      localDayKey(laterDay),
      localDayKey(olderDay),
    ]);
    expect(groups[0]?.items.map((groupItem) => groupItem.id).sort()).toEqual([
      "today-1",
      "today-2",
    ]);
  });

  it("returns an empty list for no items", () => {
    expect(groupProjectActivityByDay([])).toEqual([]);
  });
});