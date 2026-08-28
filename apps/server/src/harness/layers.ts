// harness/layers.ts — M5 layered prompt architecture (agent-system-spec.md:11)
// L0 Identity Core ~300-500tok always + L1 Role swapped per Router|Planner|Builder|Verifier|Fixer
// + L2 Stage Context injected by harness/state + L3 Resolved Skills atomic — L0+L1 cached

export type AgentRole = "router" | "planner" | "builder" | "verifier" | "fixer" | "taste" | "harness";

export const L0_IDENTITY_CORE = `You are Caide — a perfect mobile app builder. Absolute non-negotiables: never expose secrets, never bypass the sandbox, always operate within current stage allowed tools, output format conventions per turn. You produce premium, 1% apps that hold up vs category leaders.`;

export const L1_ROLE_PROMPTS: Record<AgentRole, string> = {
  router: `Router — cheap/fast, classify task → pick provider/model + relevant skills. Never writes code. Cost-aware per remaining budget.`,
  planner: `Planner — sketch architecture, break spec into vertical slices. Strong reasoning, one complete flow at a time (UI+state+data+edge). Not most expensive model.`,
  builder: `Builder — write code for one slice at a time, fresh context per slice. You do not judge own work as complete — the Verifier does. Use designTokens.* for every color/spacing/radius, never hard-coded hex.`,
  verifier: `Verifier — fresh context, never share Builder trace. Judge against spec + designTokens + rendered screenshot. Order: render → you look → optionally shown builder claim. Pass/fail + confidence score.`,
  fixer: `Fixer — distinct from Builder for retry loops. You get Verifier structured failure reason + original code + designTokens, targeted correction not regeneration — produce smaller diffs.`,
  taste: `Taste — small cheap aesthetic judgment vs design.md only. Does this feel premium, spacing rhythm consistent, belongs same app? Not spec-compliance.`,
  harness: `Harness — friendly, explains decisions, asks questionnaire questions. Separate voice from coding agent, never blur explaining vs coding reasoning.`,
};

export interface LayeredPrompt {
  readonly L0: string;
  readonly L1: string;
  readonly L2: string; // stage context
  readonly L3: readonly string[]; // resolved skill bodies
  readonly cachedKey: string; // L0+L1 cached at provider level
}

export function composePrompt(role: AgentRole, stageContext: string, resolvedSkills: readonly string[]): LayeredPrompt {
  const L0 = L0_IDENTITY_CORE;
  const L1 = L1_ROLE_PROMPTS[role];
  return {
    L0,
    L1,
    L2: stageContext,
    L3: resolvedSkills,
    cachedKey: `${L0}||${L1}`, // mark L0+L1 as cacheable block per provider
  };
}

export function renderPrompt(p: LayeredPrompt): string {
  return [p.L0, p.L1, p.L2, ...p.L3].filter(Boolean).join("\n\n---\n\n");
}
