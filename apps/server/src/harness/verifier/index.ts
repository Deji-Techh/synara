import * as fs from "node:fs";
import * as path from "node:path";
import { auditProjectTokens, type TokenViolation } from "./tokenCompare.ts";
import { evaluateVisualScreenshot } from "./visual.ts";

export * from "./tokenCompare.ts";
export * from "./visual.ts";

export interface VerifyResult {
  passed: boolean;
  confidence: number;
  tasteScore: number;
  issues: string[];
  violations: TokenViolation[];
  diffSummary: string;
  needsHumanReview: boolean;
  needsTastePass: boolean;
}

export function verifySlice(
  files: Record<string, string>,
  screenshotBase64?: string,
): VerifyResult {
  const tokenAudit = auditProjectTokens(files);
  const visualAudit = screenshotBase64 ? evaluateVisualScreenshot(screenshotBase64) : null;

  const passed = tokenAudit.passed && (!visualAudit || visualAudit.passed);

  let confidence = passed ? 0.9 : Math.max(0.4, 0.9 - tokenAudit.violations.length * 0.1);
  let tasteScore = tokenAudit.score;

  if (visualAudit) {
    confidence = Math.round(((confidence + visualAudit.confidence) / 2) * 100) / 100;
    tasteScore = Math.round(((tasteScore + visualAudit.tasteScore) / 2) * 100) / 100;
  }

  const issues = [...tokenAudit.issues, ...(visualAudit ? visualAudit.feedback : [])];

  return {
    passed,
    confidence,
    tasteScore,
    issues,
    violations: tokenAudit.violations,
    diffSummary: passed
      ? `All ${Object.keys(files).length} files passed token and state audits with taste score ${tasteScore}.`
      : `Found ${issues.length} compliance issues across ${Object.keys(files).length} files.`,
    needsHumanReview: confidence < 0.75,
    needsTastePass: tasteScore < 0.7,
  };
}

export class Verifier {
  /**
   * Reads files directly from disk in fresh isolation and performs token/state verification.
   */
  static async verifyWorkspaceFiles(
    appPath: string,
    relativePaths: string[],
    screenshotBase64?: string,
  ): Promise<VerifyResult> {
    const fileContents: Record<string, string> = {};

    for (const rel of relativePaths) {
      const full = path.join(appPath, rel);
      if (fs.existsSync(full)) {
        fileContents[rel] = await fs.promises.readFile(full, "utf-8");
      } else {
        fileContents[rel] = "";
      }
    }

    return verifySlice(fileContents, screenshotBase64);
  }
}
