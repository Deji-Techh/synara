// harness/polish.ts — M22 final polish pass (haptics/transitions/a11y) + M16 coherence/security/perf stubs
// Applied after core flows solid, not woven earlier where they'd be redone

export const POLISH_CHECKS = [
  "haptics mapped to actions (success via light, error via medium)",
  "transitions 220ms ease-out with motion-reduce fallback (disclosureMotion)",
  "a11y contrast >=4.5:1, tap targets >=44px, screen reader labels",
] as const;

export function polishPrompt(sliceSpec: string): string {
  return `Polish pass for ${sliceSpec}: ${POLISH_CHECKS.join(" · ")}`;
}

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
