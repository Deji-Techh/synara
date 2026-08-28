// harness/router.ts — M7 Router + M20 cost-aware dynamic routing
import type { AgentRole } from "./layers";

export type SliceKind = "screen" | "flow" | "motion" | "data-model" | "polish";

export interface RouterDecision {
  readonly role: AgentRole;
  readonly model: string; // e.g. opencode/gpt-5.6-sol vs opencode/claude-sonnet-5 vs free
  readonly skills: readonly string[]; // skill names to inject as L3
  readonly reasoning: string;
}

const SKILL_MAP: Record<string, readonly string[]> = {
  screen: ["ui-ux-mastery", "anti-ai-slop"],
  flow: ["product-flow", "ui-ux-mastery"],
  motion: ["motion-interaction"],
  "data-model": ["backend-production"],
  polish: ["ui-ux-mastery", "motion-interaction", "anti-ai-slop"],
};

const CHEAP_MODELS = ["opencode/minimax-m2.7", "opencode/qwen3-flash", "opencode/deepseek-v4-flash"] as const;
const STRONG_MODELS = ["opencode/gpt-5.6-sol", "opencode/claude-opus-4.8", "opencode/claude-fable-5"] as const;

export function route(
  sliceKind: SliceKind,
  opts: { remainingBudget?: number; complexity?: "low" | "medium" | "high"; provider?: string },
): RouterDecision {
  const complexity = opts.complexity ?? "medium";
  // Cost-aware: if budget hot, downgrade low-stakes slices
  const useCheap = (opts.remainingBudget !== undefined && opts.remainingBudget < 2) && sliceKind !== "data-model";
  const useStrong = complexity === "high" || sliceKind === "data-model";
  const model = useCheap ? CHEAP_MODELS[0]! : useStrong ? STRONG_MODELS[0]! : CHEAP_MODELS[1]!;

  const skills = SKILL_MAP[sliceKind] ?? [];
  const role: AgentRole = sliceKind === "motion" ? "builder" : "builder"; // taste/harness separate

  return {
    role,
    model,
    skills,
    reasoning: `slice=${sliceKind} complexity=${complexity} budget=${opts.remainingBudget ?? "n/a"} → ${model} + [${skills.join(",")}]`,
  };
}

export function routeVerifier(): RouterDecision {
  return { role: "verifier", model: STRONG_MODELS[1]!, skills: ["ui-ux-mastery"], reasoning: "verifier always strong, fresh context, exact token compare" };
}

export function routeTaste(): RouterDecision {
  return { role: "taste", model: CHEAP_MODELS[0]!, skills: ["ui-ux-mastery", "anti-ai-slop"], reasoning: "taste = cheap aesthetic only, not spec" };
}

export function routeFixer(): RouterDecision {
  return { role: "fixer", model: STRONG_MODELS[0]!, skills: [], reasoning: "fixer targeted correction with failure reason + tokens" };
}
