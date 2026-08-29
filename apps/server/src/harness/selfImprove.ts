// harness/selfImprove.ts — M23 self-improving loop (pure Caide)
// Tracks skill combo → Verifier confidence vs Fixer retries, refines SKILL.md when shouldRefine

import { shouldRefineSkill, type SkillComboStats } from "./evaluation";

const stats = new Map<string, SkillComboStats>();

export function recordSliceResult(input: { combo: readonly string[]; confidence: number; retries: number }): void {
  const key = input.combo.join("|");
  const prev = stats.get(key);
  const count = (prev?.count ?? 0) + 1;
  const avg = prev ? (prev.verifierConfidenceAvg * prev.count + input.confidence) / count : input.confidence;
  const retryRate = prev ? (prev.fixerRetryRate * prev.count + (input.retries > 0 ? 1 : 0)) / count : input.retries > 0 ? 1 : 0;
  const next: SkillComboStats = { combo: input.combo, verifierConfidenceAvg: avg, fixerRetryRate: retryRate, count };
  stats.set(key, next);
  if (shouldRefineSkill(next)) {
    // In real harness, this would queue a SKILL.md refinement PR — here we just log for evaluation harness
    console.warn(`[self-improve] refine skill combo ${key}: avg ${avg.toFixed(2)} retry ${retryRate.toFixed(2)} count ${count}`);
  }
}

export function getStats(): readonly SkillComboStats[] {
  return [...stats.values()];
}
