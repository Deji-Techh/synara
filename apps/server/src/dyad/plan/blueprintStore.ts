// FILE: blueprintStore.ts
// Purpose: App-blueprint approval gate: per-session required/approved state,
// approved data, and the enforcement assertion state-modifying tools pass
// through. Donor: tool_invocation assertAppBlueprintApproved semantics —
// write_app_blueprint owns the gate; planning tools + capability-gated tools
// pass so the flow can progress; everything else state-modifying blocks
// until approval.

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
