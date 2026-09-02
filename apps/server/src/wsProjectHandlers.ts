// FILE: wsProjectHandlers.ts
// Purpose: Pure project helpers extracted from wsRpc.ts god file (2825 lines).
// Owns: slugify, parseCommitLogRows, classifyGoalActivityEvent.
// Keeps wsRpc as thin router — premium maintainability. No Effect deps here to stay type-safe.

import type { ProjectActivityItem, GoalActivityEvent } from "@caide/contracts";

const GOAL_ACTIVITY_KIND_BY_TOKEN: ReadonlyArray<[string, ProjectActivityItem["kind"]]> = [
  ["build", "build"],
  ["analy", "analyze"],
  ["test", "test"],
];

export function classifyGoalActivityEvent(event: GoalActivityEvent): ProjectActivityItem["kind"] {
  const type = event.type.toLowerCase();
  const matched = GOAL_ACTIVITY_KIND_BY_TOKEN.find(([token]) => type.includes(token));
  return matched !== undefined ? matched[1] : "goal";
}

export function parseCommitLogRows(stdout: string, maxRows: number): ProjectActivityItem[] {
  const rows: ProjectActivityItem[] = [];
  for (const line of stdout.split("\n")) {
    if (line.trim() === "" || rows.length >= maxRows) continue;
    const [hash, author, authorEmail, authorAtSeconds, ...subjectParts] = line.split("\x1f");
    if (typeof hash !== "string" || hash === "") continue;
    const at = Number(authorAtSeconds) * 1000;
    if (!Number.isFinite(at)) continue;
    const subject = (subjectParts.join("\x1f") || "(no message)").trim();
    const detail =
      author !== undefined && author !== "" ? `${author} <${authorEmail ?? ""}>`.trim() : null;
    rows.push({ id: `commit:${hash}`, kind: "commit", at, summary: subject, detail, status: null });
  }
  return rows;
}

export const slugifyCaideAppName = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || `app-${Date.now().toString(36)}`;
