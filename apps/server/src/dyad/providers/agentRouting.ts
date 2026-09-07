// FILE: agentRouting.ts
// Purpose: Per-step model routing config (single model vs scout/builder/
// planner models). Semantics: plan-mode turns always use the planner slot;
// agent/build turns use the scout slot for read-only steps (including step
// 0) and the builder slot once any mutation has run. Unset slots inherit
// the turn default; unresolvable refs fall back to it silently (keys may be
// env-only). Donor has no equivalent (single model per turn + Pro
// fallback); this is Caide engine work.

import { PROVIDERS } from "./providers.ts";

export type RoutingStepKind = "scout" | "builder" | "planner";

export interface StepModelRef {
  providerId?: string;
  modelId?: string;
}

export interface AgentRoutingConfig {
  mode: "single" | "per-step";
  steps: Record<RoutingStepKind, StepModelRef>;
}

export const DEFAULT_AGENT_ROUTING: AgentRoutingConfig = {
  mode: "single",
  steps: { scout: {}, builder: {}, planner: {} },
};

function cleanRef(value: unknown): StepModelRef {
  if (!value || typeof value !== "object") return {};
  const rec = value as Record<string, unknown>;
  const out: StepModelRef = {};
  if (typeof rec.providerId === "string" && PROVIDERS[rec.providerId]) {
    out.providerId = rec.providerId;
  }
  if (typeof rec.modelId === "string" && rec.modelId.trim()) {
    out.modelId = rec.modelId.trim().slice(0, 200);
  }
  return out;
}

/** Validate/normalize a client-supplied routing config (unknown providers dropped). */
export function normalizeAgentRouting(input: unknown): AgentRoutingConfig {
  if (!input || typeof input !== "object") return { ...DEFAULT_AGENT_ROUTING, steps: { ...DEFAULT_AGENT_ROUTING.steps } };
  const rec = input as Record<string, unknown>;
  const steps = (rec.steps && typeof rec.steps === "object" ? rec.steps : {}) as Record<string, unknown>;
  return {
    mode: rec.mode === "per-step" ? "per-step" : "single",
    steps: {
      scout: cleanRef(steps.scout),
      builder: cleanRef(steps.builder),
      planner: cleanRef(steps.planner),
    },
  };
}

/** True when the slot names a concrete model (otherwise it inherits). */
export function isSlotSet(ref: StepModelRef): boolean {
  return Boolean(ref.providerId || ref.modelId);
}

export interface StepClassifyInput {
  /** Normalized chat mode for the turn. */
  chatMode: "build" | "ask" | "local-agent" | "plan";
  step: number;
  /** True when the previous step called tools and all were read-only. */
  lastStepAllReadOnly: boolean;
  /** True once any mutating tool has run this turn. */
  hasMutatedThisTurn: boolean;
}

/** Decide which routing slot a step uses (pure; runner maps slot → adapter). */
export function classifyStepKind(input: StepClassifyInput): RoutingStepKind {
  if (input.chatMode === "plan") return "planner";
  if (!input.hasMutatedThisTurn) return "scout";
  if (input.lastStepAllReadOnly) return "scout";
  return "builder";
}
