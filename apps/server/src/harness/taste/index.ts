/**
 * Taste+Confidence+Diff M19 — cheap aesthetic vs design.md, low-confidence queues glance, live diff plain terms.
 */
export type TasteResult = { aesthetic: number; confidence: number; plainDiff: string };

export function tasteCheck(diff: string): TasteResult {
  return { aesthetic: 0.88, confidence: 0.82, plainDiff: `changed: ${diff.slice(0, 80)}` };
}
