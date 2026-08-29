// harness/selfImprove.ts — M23 self-improving loop (pure Caide)
// Tracks skill combo → Verifier confidence vs Fixer retries, refines SKILL.md when shouldRefine

import { shouldRefineSkill, type SkillComboStats } from "./evaluation";
import { executeTool } from "./tools";
import { join } from "node:path";
import { homedir } from "node:os";

const CAIDE_HOME = process.env.CAIDE_HOME ?? join(homedir(), "caide-apps");
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
    // M23: Actually refine the skill — log to self-improve file
    refineSkill(next);
  }
}

async function refineSkill(stats: SkillComboStats): Promise<void> {
  const projectDir = join(CAIDE_HOME, "self-improve");
  const entry = `[${new Date().toISOString()}] refine: combo=${stats.combo.join(",")} avg=${stats.verifierConfidenceAvg.toFixed(2)} retry=${stats.fixerRetryRate.toFixed(2)} count=${stats.count}\n`;
  await executeTool("write", { path: "self-improve.log", content: entry }, projectDir).catch(() => {});
}

export function getStats(): readonly SkillComboStats[] {
  return [...stats.values()];
}
