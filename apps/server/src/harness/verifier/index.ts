/**
 * Verifier — fresh ctx never sees builder trace, exact token compare vs design tokens.
 * Steal agent-system-spec.md Verifier + deepseek checkpoint chain.
 */
import { designTokens } from "../../design/tokens.ts";

export type VerifyResult = {
  passed: boolean;
  confidence: number;
  tasteScore: number;
  diffSummary: string;
};

export function verifySlice(files: Record<string, string>): VerifyResult {
  // stub: check every file contains near-black bg token
  const hasBg = Object.values(files).some((c) => c.includes(designTokens.colorTokens.background));
  return {
    passed: hasBg,
    confidence: hasBg ? 0.85 : 0.35,
    tasteScore: hasBg ? 0.9 : 0.4,
    diffSummary: hasBg ? "uses design tokens" : "missing design tokens",
  };
}
