// FILE: planStore.ts
// Purpose: Plan draft persistence + acceptance records (plan handoff state).
// Drafts live under <app>/.caide/plans/<slug>-<ts>.md with validated
// frontmatter (donor planPersistence semantics: id/title/status/timestamps).
// The last-presented plan per session is tracked so exit_plan can record
// WHAT was accepted (donor startPlanHandoffFromMain needsAppBlueprint
// clearing + handoff); the full handoff service consumes getAcceptedPlan.
// Donor: dyad planPersistence.ts + plan_handoff_service.ts (state subset;
// Electron broadcast + new-chat forking not carried — Caide continues in
// the same session via the plan continue-gate).

import * as fs from "node:fs";
import * as path from "node:path";

export type PlanStatus = "draft" | "accepted" | "superseded";

export interface PlanRecord {
  id: string;
  title: string;
  summary: string;
  plan: string;
  status: PlanStatus;
  createdAt: number;
  acceptedAt?: number;
  file?: string;
}

export function slugifyPlanTitle(title: string): string {
  return (
    title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) ||
    "plan"
  );
}

export function planFileName(title: string, at = Date.now()): string {
  return `${slugifyPlanTitle(title)}-${at}.md`;
}

function frontmatter(record: PlanRecord): string {
  const lines = [
    "---",
    `id: ${JSON.stringify(record.id)}`,
    `title: ${JSON.stringify(record.title)}`,
    `status: ${record.status}`,
    `createdAt: ${record.createdAt}`,
  ];
  if (record.acceptedAt !== undefined) lines.push(`acceptedAt: ${record.acceptedAt}`);
  lines.push("---");
  return lines.join("\n");
}

/** Parse `---` frontmatter; returns null when missing/invalid (donor validatePlanId parity: id required). */
export function parsePlanFile(content: string): { id: string; title: string; status: PlanStatus; createdAt: number; acceptedAt?: number; body: string } | null {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(content);
  if (!match) return null;
  const fields: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  let id: string;
  try {
    id = JSON.parse(fields.id ?? "");
  } catch {
    return null;
  }
  if (typeof id !== "string" || id.length === 0 || id.length > 128) return null;
  const status = fields.status === "accepted" || fields.status === "superseded" ? fields.status : "draft";
  let title = "Untitled plan";
  try {
    const parsed = JSON.parse(fields.title ?? "");
    if (typeof parsed === "string" && parsed) title = parsed;
  } catch {
    // keep default
  }
  return {
    id,
    title,
    status,
    createdAt: Number(fields.createdAt) || 0,
    acceptedAt: fields.acceptedAt !== undefined ? Number(fields.acceptedAt) || undefined : undefined,
    body: match[2],
  };
}

/** Write (or rewrite) a plan draft file. Returns the stored record. */
export async function writePlanFile(
  appPath: string,
  plan: { title: string; summary: string; plan: string },
  at = Date.now(),
): Promise<PlanRecord> {
  const id = `${slugifyPlanTitle(plan.title)}-${at}`;
  const record: PlanRecord = {
    id,
    title: plan.title,
    summary: plan.summary,
    plan: plan.plan,
    status: "draft",
    createdAt: at,
  };
  const dir = path.join(appPath, ".caide", "plans");
  await fs.promises.mkdir(dir, { recursive: true });
  const file = path.join(dir, planFileName(plan.title, at));
  record.file = file;
  await fs.promises.writeFile(
    file,
    `${frontmatter(record)}\n\n# ${plan.title}\n\n${plan.summary}\n\n${plan.plan}\n`,
  );
  return record;
}

/** Mark a plan file accepted (best-effort rewrite of status frontmatter). */
export async function markPlanFileAccepted(file: string, acceptedAt = Date.now()): Promise<void> {
  let content: string;
  try {
    content = await fs.promises.readFile(file, "utf-8");
  } catch {
    return;
  }
  const parsed = parsePlanFile(content);
  if (!parsed) return;
  const record: PlanRecord = {
    id: parsed.id,
    title: parsed.title,
    summary: "",
    plan: parsed.body,
    status: "accepted",
    createdAt: parsed.createdAt,
    acceptedAt,
    file,
  };
  try {
    await fs.promises.writeFile(file, `${frontmatter(record)}\n\n${parsed.body}`);
  } catch {
    // ignore — in-memory acceptance still stands
  }
}

/** List plan files for an app (newest last). */
export async function listPlanFiles(appPath: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.promises.readdir(path.join(appPath, ".caide", "plans"));
  } catch {
    return [];
  }
  return entries.filter((e) => e.endsWith(".md")).sort();
}

// --- session acceptance records (in-memory, snapshotted like todos) ---

const lastPresented = new Map<string, PlanRecord>();
const acceptedPlans = new Map<string, PlanRecord>();

/** Track the last plan presented to a session (set by write_plan). */
export function recordPlanPresented(sessionId: string, record: PlanRecord): void {
  lastPresented.set(sessionId, record);
}

export function getLastPresentedPlan(sessionId: string): PlanRecord | undefined {
  return lastPresented.get(sessionId);
}

/**
 * Record acceptance of the last-presented plan (exit_plan). Returns the
 * accepted record, or undefined when no plan was presented. File marking
 * is the caller's job (await markPlanFileAccepted) so tool results are
 * deterministic.
 */
export function recordPlanAccepted(sessionId: string, acceptedAt = Date.now()): PlanRecord | undefined {
  const presented = lastPresented.get(sessionId);
  if (!presented) return undefined;
  const record: PlanRecord = { ...presented, status: "accepted", acceptedAt };
  acceptedPlans.set(sessionId, record);
  return record;
}

export function getAcceptedPlan(sessionId: string): PlanRecord | undefined {
  return acceptedPlans.get(sessionId);
}

export function setAcceptedPlan(sessionId: string, record: PlanRecord): void {
  acceptedPlans.set(sessionId, { ...record, status: "accepted" });
}

export function clearPlanRecords(sessionId: string): void {
  lastPresented.delete(sessionId);
  acceptedPlans.delete(sessionId);
}
