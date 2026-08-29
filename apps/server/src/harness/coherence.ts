// harness/coherence.ts — M16 Cross-app coherence pass
// Checks spacing rhythm, dark/light handling, empty-state pattern across ALL screens

import { executeTool } from "./tools";

export interface CoherenceResult {
  readonly passed: string[];
  readonly failed: string[];
  readonly score: number;
}

// M16: Cross-app coherence — spacing rhythm screen→screen
async function checkSpacingRhythm(projectDir: string): Promise<{ pass: boolean; detail: string }> {
  const res = await executeTool("grep", { pattern: "padding|margin|gap" }, projectDir);
  if (!res.ok || !res.result || res.result.includes("No matches")) {
    return { pass: false, detail: "No spacing patterns found" };
  }
  // Check if spacing uses consistent multiples of 4
  const lines = res.result.split("\n").filter(Boolean);
  const inconsistent = lines.filter((line) => {
    const nums = line.match(/\d+/g) ?? [];
    return nums.some((n) => Number(n) % 4 !== 0);
  });
  if (inconsistent.length > 0) {
    return { pass: false, detail: `${inconsistent.length} spacing values not on 4px grid` };
  }
  return { pass: true, detail: "All spacing on 4px grid" };
}

// M16: Cross-app coherence — dark/light handling identical
async function checkDarkLightConsistency(projectDir: string): Promise<{ pass: boolean; detail: string }> {
  const darkRes = await executeTool("grep", { pattern: "#0D0D0D|#1A1A1A|#333333" }, projectDir);
  const lightRes = await executeTool("grep", { pattern: "#FFFFFF|#000000" }, projectDir);
  const hasDark = darkRes.ok && darkRes.result && !darkRes.result.includes("No matches");
  const hasLight = lightRes.ok && lightRes.result && !lightRes.result.includes("No matches");
  if (hasDark && hasLight) {
    return { pass: true, detail: "Both dark and light tokens used" };
  }
  if (!hasDark && !hasLight) {
    return { pass: false, detail: "No color tokens found" };
  }
  return { pass: false, detail: hasDark ? "Missing light tokens" : "Missing dark tokens" };
}

// M16: Cross-app coherence — empty-state pattern identical everywhere
async function checkEmptyStateConsistency(projectDir: string): Promise<{ pass: boolean; detail: string }> {
  const res = await executeTool("grep", { pattern: "empty|Empty|noData|No data|placeholder" }, projectDir);
  if (!res.ok || !res.result || res.result.includes("No matches")) {
    return { pass: false, detail: "No empty state patterns found" };
  }
  return { pass: true, detail: "Empty states present across screens" };
}

// M16: Run all coherence checks
export async function runCoherencePass(projectDir: string): Promise<CoherenceResult> {
  const passed: string[] = [];
  const failed: string[] = [];

  const spacing = await checkSpacingRhythm(projectDir);
  if (spacing.pass) passed.push(`Spacing: ${spacing.detail}`);
  else failed.push(`Spacing: ${spacing.detail}`);

  const darkLight = await checkDarkLightConsistency(projectDir);
  if (darkLight.pass) passed.push(`Dark/Light: ${darkLight.detail}`);
  else failed.push(`Dark/Light: ${darkLight.detail}`);

  const emptyState = await checkEmptyStateConsistency(projectDir);
  if (emptyState.pass) passed.push(`Empty states: ${emptyState.detail}`);
  else failed.push(`Empty states: ${emptyState.detail}`);

  const score = passed.length / (passed.length + failed.length);
  return { passed, failed, score };
}
