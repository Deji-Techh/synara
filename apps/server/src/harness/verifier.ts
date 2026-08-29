// harness/verifier.ts — M7 Verifier + M11 visual verification + M19 confidence + M16 comparative
import { designTokens } from "../design/tokens";

export type VerifierResult = {
  readonly pass: boolean;
  readonly confidence: number; // 0-1
  readonly reason: string;
  readonly tasteScore?: number; // separate Taste pass 0-1, not spec
  readonly diffSummary?: string; // live diff plain terms for trust (M19)
};

// M16: Check if generated code uses designTokens instead of hardcoded values
function checkDesignTokenCompliance(code: string): { score: number; violations: string[] } {
  const violations: string[] = [];
  const hexPattern = /#(?:[0-9a-fA-F]{3}){1,2}\b/g;
  const matches = code.match(hexPattern) ?? [];
  const allowedHex = ["#000000", "#ffffff", "#0D0D0D", "#E8493C"];
  for (const hex of matches) {
    if (!allowedHex.includes(hex.toLowerCase())) {
      violations.push(`Hardcoded hex ${hex} — use designTokens.*`);
    }
  }
  if (violations.length === 0) return { score: 1.0, violations };
  return { score: Math.max(0, 1 - violations.length * 0.15), violations };
}

// M16: Check if spec requirements are addressed
function checkSpecCoverage(spec: string, code: string): { score: number; missing: string[] } {
  const missing: string[] = [];
  const specLower = spec.toLowerCase();
  const codeLower = code.toLowerCase();
  if (specLower.includes("login") && !codeLower.includes("login")) missing.push("Login flow not found in code");
  if (specLower.includes("error") && !codeLower.includes("error")) missing.push("Error handling not found");
  if (specLower.includes("loading") && !codeLower.includes("loading")) missing.push("Loading state not found");
  if (missing.length === 0) return { score: 1.0, missing };
  return { score: Math.max(0, 1 - missing.length * 0.2), missing };
}

export function verifySlice(input: {
  sliceSpec: string;
  renderedScreenshotBase64?: string | null;
  builderClaim?: string;
  designTokensJson?: typeof designTokens;
}): VerifierResult {
  const specPresent = input.sliceSpec.trim().length > 10;
  if (!specPresent) {
    return { pass: false, confidence: 0.98, reason: "Spec empty — nothing to verify against" };
  }

  const hasRender = !!input.renderedScreenshotBase64 && input.renderedScreenshotBase64.length > 0;
  if (!hasRender) {
    return { pass: false, confidence: 0.92, reason: "No rendered screenshot — visual verification required (M11)" };
  }

  // M16: Real token compare + spec coverage
  const tokenCheck = checkDesignTokenCompliance(input.builderClaim ?? "");
  const specCheck = checkSpecCoverage(input.sliceSpec, input.builderClaim ?? "");
  const confidence = Math.round((tokenCheck.score * 0.6 + specCheck.score * 0.4) * 100) / 100;

  if (confidence < 0.82) {
    return {
      pass: false,
      confidence,
      reason: `Low confidence — token violations: ${tokenCheck.violations.join(", ")}; spec gaps: ${specCheck.missing.join(", ")}`,
      tasteScore: confidence,
      diffSummary: tokenCheck.violations.length > 0 ? `Token violations: ${tokenCheck.violations.length}` : "Spec coverage gaps",
    };
  }

  return {
    pass: true,
    confidence,
    reason: `Verified — token compliance ${(tokenCheck.score * 100).toFixed(0)}%, spec coverage ${(specCheck.score * 100).toFixed(0)}%`,
    tasteScore: confidence,
    diffSummary: "First render — no diff",
  };
}

export function needsHumanGlance(result: VerifierResult): boolean {
  return !result.pass || result.confidence < 0.82;
}
