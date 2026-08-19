import type { ProjectActivityItem } from "@caide/contracts";

// M4b: day-grouping + formatting helpers for the per-project Activity timeline.

export type ProjectActivityGroup = {
  readonly dayKey: string;
  readonly label: string;
  readonly items: readonly ProjectActivityItem[];
};

export function formatActivityTime(atMs: number): string {
  const date = new Date(atMs);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function localDayKey(atMs: number): string {
  const date = new Date(atMs);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shiftDayKey(dayKey: string, daysAgo: number): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - daysAgo);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function formatProjectActivityDayLabel(dayKey: string, nowMs: number = Date.now()): string {
  const today = localDayKey(nowMs);
  if (dayKey === today) return "Today";
  if (dayKey === shiftDayKey(today, 1)) return "Yesterday";
  const date = new Date(`${dayKey}T00:00:00`);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function groupProjectActivityByDay(
  items: readonly ProjectActivityItem[],
): ProjectActivityGroup[] {
  const groups = new Map<string, ProjectActivityItem[]>();
  for (const item of items) {
    const dayKey = localDayKey(item.at);
    const existing = groups.get(dayKey);
    if (existing === undefined) {
      groups.set(dayKey, [item]);
    } else {
      existing.push(item);
    }
  }
  return [...groups.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([dayKey, dayItems]) => ({
      dayKey,
      label: formatProjectActivityDayLabel(dayKey),
      items: dayItems,
    }));
}