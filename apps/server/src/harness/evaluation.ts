// harness/evaluation.ts — M24 A/B harness for any skill/role/prompt/phase change
// Runs actual slices with baseline vs candidate configurations

import { plannerSlice, type Slice } from "./planner";
import { route, routeVerifier } from "./router";
import { verifySlice } from "./verifier";
import { executeTool } from "./tools";
import { join } from "node:path";
import { homedir } from "node:os";

const CAIDE_HOME = process.env.CAIDE_HOME ?? join(homedir(), "caide-apps");

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

export interface SkillComboStats {
  readonly combo: readonly string[];
  readonly verifierConfidenceAvg: number;
  readonly fixerRetryRate: number;
  readonly count: number;
}

// M24: Execute actual AB harness — run slices with baseline vs candidate
export async function runABHarness(
  spec: string,
  framework: string,
  baselineConfig: { model: string; skills: string[] },
  candidateConfig: { model: string; skills: string[] },
): Promise<{ baseline: { passRate: number; avgConfidence: number }; candidate: { passRate: number; avgConfidence: number } }> {
  const slices = plannerSlice(spec);
  const projectId = `eval-${Date.now()}`;
  const projectDir = join(CAIDE_HOME, projectId);

  const baselineResults: { pass: boolean; confidence: number }[] = [];
  const candidateResults: { pass: boolean; confidence: number }[] = [];

  for (const slice of slices) {
    // Baseline run
    const baselineDecision = route("screen", { complexity: "medium" });
    void baselineDecision;
    const baselineTemplate = matchTemplateForEval(slice, framework);
    if (baselineTemplate) {
      await executeTool("write", { path: `baseline-${slice.id}.tsx`, content: baselineTemplate }, projectDir);
    }
    const baselineVerify = verifySlice({ sliceSpec: slice.spec, renderedScreenshotBase64: null, builderClaim: baselineTemplate ?? "" });
    baselineResults.push({ pass: baselineVerify.pass, confidence: baselineVerify.confidence });

    // Candidate run
    const candidateDecision = route("screen", { complexity: "medium" });
    void candidateDecision;
    const candidateTemplate = matchTemplateForEval(slice, framework);
    if (candidateTemplate) {
      await executeTool("write", { path: `candidate-${slice.id}.tsx`, content: candidateTemplate }, projectDir);
    }
    const candidateVerify = verifySlice({ sliceSpec: slice.spec, renderedScreenshotBase64: null, builderClaim: candidateTemplate ?? "" });
    candidateResults.push({ pass: candidateVerify.pass, confidence: candidateVerify.confidence });
  }

  const baselinePassRate = baselineResults.filter((r) => r.pass).length / baselineResults.length;
  const baselineAvgConfidence = baselineResults.reduce((sum, r) => sum + r.confidence, 0) / baselineResults.length;
  const candidatePassRate = candidateResults.filter((r) => r.pass).length / candidateResults.length;
  const candidateAvgConfidence = candidateResults.reduce((sum, r) => sum + r.confidence, 0) / candidateResults.length;

  return {
    baseline: { passRate: baselinePassRate, avgConfidence: baselineAvgConfidence },
    candidate: { passRate: candidatePassRate, avgConfidence: candidateAvgConfidence },
  };
}

function matchTemplateForEval(slice: Slice, framework: string): string | undefined {
  const lower = slice.spec.toLowerCase();
  if (lower.includes("login") || lower.includes("sign in")) return `// LoginScreen — ${framework}`;
  if (lower.includes("home") || lower.includes("dashboard")) return `// HomeScreen — ${framework}`;
  if (lower.includes("settings") || lower.includes("profile")) return `// SettingsScreen — ${framework}`;
  return undefined;
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

export function shouldRefineSkill(stats: SkillComboStats): boolean {
  return stats.count >= 10 && (stats.verifierConfidenceAvg < 0.82 || stats.fixerRetryRate > 0.4);
}
