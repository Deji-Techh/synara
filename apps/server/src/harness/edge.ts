// harness/edge.ts — M14 systematic edge sweeps + M15 adversarial self-play + M16 coherence/security/perf/benchmark
// Each is a focused agent pass via live preview session interaction primitives, not chance in Builder first pass

export type EdgeCase =
  | "long-text" // names/descriptions truncate gracefully not break layout
  | "missing-data" // listing no image/price/description renders sensibly
  | "slow-network" // degraded/slow shows appropriate loading not instant-or-broken
  | "rapid-double-tap"; // double submit / rapid nav not duplicate/break

export const EDGE_CASES: readonly EdgeCase[] = ["long-text", "missing-data", "slow-network", "rapid-double-tap"];

export function edgeSweepForSlice(sliceSpec: string): { prompt: string; cases: readonly EdgeCase[] } {
  return {
    prompt: `Edge-case sweep for slice: ${sliceSpec}. Generate and test long text, missing data, slow network, rapid double-tap against live preview session.`,
    cases: EDGE_CASES,
  };
}

export type AdversarialAction =
  | "out-of-order-taps"
  | "back-out-mid-flow"
  | "force-close-during-network"
  | "malformed-every-field";

export const ADVERSARIAL_ACTIONS: readonly AdversarialAction[] = [
  "out-of-order-taps",
  "back-out-mid-flow",
  "force-close-during-network",
  "malformed-every-field",
];

export function adversarialPlan(sliceSpec: string): string {
  return `Adversarial self-play for: ${sliceSpec}. Try to break like hostile user: ${ADVERSARIAL_ACTIONS.join(", ")}. Only job: can I make this crash or behave incorrectly? Feed findings into Fixer loop.`;
}

// Cross-app coherence (M16 8.5) — whole-app pass after per-slice passes
export function coherenceCheck(appSpec: string): string {
  return `Cross-app coherence for whole app: ${appSpec}. Check spacing rhythm screen→screen, dark/light handling identical, empty-state pattern identical everywhere. Per-slice passed ≠ aggregate consistent.`;
}

// Security + perf (M16 8.75)
export const SECURITY_CHECKS = ["hardcoded secrets", "insecure local storage", "missing sanitization", "exposed keys in bundle"] as const;
export const PERF_CHECKS = ["bundle size", "re-renders (Profiler/overlay)", "image optimization", "list virtualization"] as const;

// Benchmark (M16 8.9) — compare built app vs category leaders fetched screenshots, run same Taste model
export function benchmarkPrompt(category: string): string {
  return `Comparative benchmark vs best-in-class ${category} apps. Fetch reference screenshots, run same Taste model comparison as agent-system-spec, flag where falls short of genuinely excellent (not just meets spec).`;
}
