// harness/evaluation.ts — M24 A/B harness for any skill/role/prompt/phase change, not assumed quality
export interface EvalCase {
  readonly name: string;
  readonly baselineSkill: string;
  readonly candidateSkill: string;
  readonly slices: readonly string[];
}

export interface EvalResult {
  readonly caseName: string;
  readonly baseline: { verifierPassRate: number; fixerLoops: number; benchmarkGap: number };
  readonly candidate: { verifierPassRate: number; fixerLoops: number; benchmarkGap: number };
  readonly winner: "baseline" | "candidate" | "tie";
  readonly delta: string;
}

export function evaluateSkillChange(c: EvalCase, baselineResult: EvalResult["baseline"], candidateResult: EvalResult["candidate"]): EvalResult {
  const baselineScore = baselineResult.verifierPassRate - baselineResult.fixerLoops * 0.1 - baselineResult.benchmarkGap * 0.5;
  const candidateScore = candidateResult.verifierPassRate - candidateResult.fixerLoops * 0.1 - candidateResult.benchmarkGap * 0.5;
  const winner = candidateScore > baselineScore + 0.02 ? "candidate" : baselineScore > candidateScore + 0.02 ? "baseline" : "tie";
  return {
    caseName: c.name,
    baseline: baselineResult,
    candidate: candidateResult,
    winner,
    delta: `baseline ${baselineScore.toFixed(3)} vs candidate ${candidateScore.toFixed(3)} → ${winner}`,
  };
}

// Self-improving loop wiring (M23): track skill combo → Verifier confidence vs Fixer retries
export type SkillComboStats = {
  readonly combo: readonly string[];
  readonly verifierConfidenceAvg: number;
  readonly fixerRetryRate: number;
  readonly count: number;
};

export function shouldRefineSkill(stats: SkillComboStats): boolean {
  return stats.count >= 10 && (stats.verifierConfidenceAvg < 0.82 || stats.fixerRetryRate > 0.4);
}
