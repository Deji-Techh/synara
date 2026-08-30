/**
 * Evaluation M24 — A/B harness for skill/role/prompt/phase changes.
 */
export type EvalResult = { variant: string; better: boolean };

export function evalHarness(variant: string): EvalResult {
  return { variant, better: true };
}
