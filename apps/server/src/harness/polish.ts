// harness/polish.ts — M22 final polish pass + M16 coherence/security/perf checks
// Applied after core flows solid, reads actual generated code

import { executeTool } from "./tools";

export const POLISH_CHECKS = [
  "haptics mapped to actions (success via light, error via medium)",
  "transitions 220ms ease-out with motion-reduce fallback (disclosureMotion)",
  "a11y contrast >=4.5:1, tap targets >=44px, screen reader labels",
] as const;

export const COHERENCE_CHECKS = [
  "spacing rhythm screen→screen identical",
  "dark/light handling identical",
  "empty-state pattern identical everywhere",
] as const;

export const SECURITY_CHECKS = [
  "no hardcoded secrets",
  "no insecure local storage of sensitive data",
  "input sanitization present",
  "no exposed keys in client bundle",
] as const;

export const PERF_CHECKS = [
  "bundle size < limit",
  "no unnecessary re-renders (Profiler/Flutter overlay)",
  "images optimized",
  "lists virtualized",
] as const;

export interface PolishResult {
  readonly passed: string[];
  readonly failed: string[];
  readonly score: number;
}

// M22: Apply polish checks to actual generated code
export async function applyPolishChecks(projectDir: string): Promise<PolishResult> {
  const passed: string[] = [];
  const failed: string[] = [];

  // Check for hardcoded hex colors (should use designTokens)
  const hexCheck = await executeTool("grep", { pattern: "#[0-9a-fA-F]{3,6}" }, projectDir);
  if (hexCheck.ok && hexCheck.result && !hexCheck.result.includes("No matches")) {
    failed.push("Hardcoded hex colors found — use designTokens.*");
  } else {
    passed.push("No hardcoded hex colors");
  }

  // Check for missing error handling
  const errorCheck = await executeTool("grep", { pattern: "catch|error|Error" }, projectDir);
  if (errorCheck.ok && errorCheck.result && !errorCheck.result.includes("No matches")) {
    passed.push("Error handling present");
  } else {
    failed.push("No error handling found");
  }

  // Check for loading states
  const loadingCheck = await executeTool("grep", { pattern: "loading|Loading|ActivityIndicator|CircularProgress" }, projectDir);
  if (loadingCheck.ok && loadingCheck.result && !loadingCheck.result.includes("No matches")) {
    passed.push("Loading states present");
  } else {
    failed.push("No loading states found");
  }

  // Check for accessibility labels
  const a11yCheck = await executeTool("grep", { pattern: "accessibilityLabel|aria-label|Semantics" }, projectDir);
  if (a11yCheck.ok && a11yCheck.result && !a11yCheck.result.includes("No matches")) {
    passed.push("Accessibility labels present");
  } else {
    failed.push("No accessibility labels found");
  }

  // Check for empty states
  const emptyCheck = await executeTool("grep", { pattern: "empty|Empty|noData|No data" }, projectDir);
  if (emptyCheck.ok && emptyCheck.result && !emptyCheck.result.includes("No matches")) {
    passed.push("Empty states present");
  } else {
    failed.push("No empty states found");
  }

  const score = passed.length / (passed.length + failed.length);
  return { passed, failed, score };
}

export function polishPrompt(sliceSpec: string): string {
  return `Polish pass for ${sliceSpec}: ${POLISH_CHECKS.join(" · ")}`;
}
