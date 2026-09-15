// FILE: blueprintStore.ts
// Purpose: App-blueprint approval gate: per-session required/approved state,
// approved data, and the enforcement assertion state-modifying tools pass
// through. Donor: tool_invocation assertAppBlueprintApproved semantics —
// write_app_blueprint owns the gate; planning tools + capability-gated tools
// pass so the flow can progress; everything else state-modifying blocks
// until approval.

import * as fs from "node:fs";
import * as path from "node:path";

export interface BlueprintVisual {
  type: "logo" | "photo" | "illustration" | "icon" | "background" | "other";
  description: string;
  prompt: string;
}

export interface AppBlueprint {
  appName: string;
  userPrompt: string;
  framework?: string;
  designDirection: string;
  primaryColor: string;
  visuals: BlueprintVisual[];
}

interface BlueprintState {
  required: boolean;
  approved: boolean;
  data: AppBlueprint | null;
}

const states = new Map<string, BlueprintState>();

function get(sessionId: string): BlueprintState {
  let entry = states.get(sessionId);
  if (!entry) {
    entry = { required: false, approved: false, data: null };
    states.set(sessionId, entry);
  }
  return entry;
}

/** Mark new-app turns as blueprint-gated (send path sets this). */
export function setBlueprintRequired(sessionId: string, required = true): void {
  get(sessionId).required = required;
}

export function isBlueprintRequired(sessionId: string): boolean {
  return states.get(sessionId)?.required ?? false;
}

/** Present a draft (tool call); resets approval until the user approves. */
export function presentBlueprint(sessionId: string, data: AppBlueprint): void {
  const entry = get(sessionId);
  entry.data = data;
  entry.approved = false;
}

/**
 * Arm the gate for a new-app flow. Primary arming is the creation marker
 * (first turn on a fresh scaffold calls setBlueprintRequired); this stays
 * as a backstop for drafts on sessions the marker missed — from that point,
 * mutating tools block until approval.
 */
export function armBlueprintGate(sessionId: string): void {
  get(sessionId).required = true;
}

export function approveBlueprint(sessionId: string, data?: AppBlueprint): AppBlueprint | null {
  const entry = get(sessionId);
  if (data) entry.data = data;
  entry.approved = true;
  return entry.data;
}

export function getBlueprint(sessionId: string): AppBlueprint | null {
  return states.get(sessionId)?.data ?? null;
}

export function isBlueprintApproved(sessionId: string): boolean {
  return states.get(sessionId)?.approved ?? false;
}

export function clearBlueprint(sessionId: string): void {
  states.delete(sessionId);
}

/**
 * Per-app arming marker (donor needsAppBlueprint parity). V1 arms the gate
 * at app creation (DB row); V2 has no shared app DB on this layer, so our
 * scaffolds stamp `.caide/needs-blueprint` and the first turn on a fresh
 * app arms the session gate. Approval and plan-exit clear the marker (V1
 * clears the app flag on both); cancel clears only the session state, so a
 * retried new-app turn re-arms from the surviving marker. All helpers are
 * best-effort and never throw.
 */
export const BLUEPRINT_MARKER = ".caide/needs-blueprint";

function markerPath(appPath: string): string {
  return path.join(appPath, BLUEPRINT_MARKER);
}

/** Stamp the marker at app creation (scaffold choke point calls this). */
export function stampBlueprintMarker(appPath: string): boolean {
  try {
    if (!appPath) return false;
    fs.mkdirSync(path.join(appPath, ".caide"), { recursive: true });
    fs.writeFileSync(markerPath(appPath), `${Date.now()}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}

/** Whether this app still needs its first blueprint (marker present). */
export function hasBlueprintMarker(appPath: string): boolean {
  try {
    if (!appPath) return false;
    return fs.existsSync(markerPath(appPath));
  } catch {
    return false;
  }
}

/** Clear the marker (blueprint approval, plan exit). Never throws. */
export function clearBlueprintMarker(appPath: string): boolean {
  try {
    if (!appPath) return false;
    if (!fs.existsSync(markerPath(appPath))) return false;
    fs.rmSync(markerPath(appPath), { force: true });
    return true;
  } catch {
    return false;
  }
}

export class BlueprintNotApprovedError extends Error {
  constructor(toolName: string) {
    super(
      `App blueprint not approved yet — ${toolName} is blocked until the user approves the blueprint (write_app_blueprint → blueprint card → Approve).`,
    );
    this.name = "BlueprintNotApprovedError";
  }
}

/**
 * Donor assertAppBlueprintApproved semantics: when the gate is on, only the
 * blueprint tool itself, planning-specific tools, capability-gated tools, and
 * non-modifying tools pass. Everything else throws until approval.
 */
export function assertAppBlueprintApproved(
  sessionId: string,
  toolName: string,
  modifiesState: boolean,
  opts: { planningSpecific?: boolean; capabilityGated?: boolean } = {},
): void {
  const entry = states.get(sessionId);
  if (!entry || !entry.required || entry.approved) return;
  if (toolName === "write_app_blueprint") return;
  if (opts.planningSpecific || opts.capabilityGated) return;
  if (!modifiesState) return;
  throw new BlueprintNotApprovedError(toolName);
}
