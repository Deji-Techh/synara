// harness/edgeRunner.ts — M14 edge sweeps + M15 adversarial execution via tools.ts
// Checks projectDir for edge case violations + adversarial patterns

import { EDGE_CASES, ADVERSARIAL_ACTIONS, type EdgeCase, type AdversarialAction } from "./edge";
import { executeTool } from "./tools";

// Search patterns for each edge case
const EDGE_SEARCH: Record<EdgeCase, string> = {
  "long-text": "truncat|overflow|ellipsis|text-overflow|numberOfLines",
  "missing-data": "empty|no-data|placeholder|fallback|default",
  "slow-network": "loading|skeleton|spinner|ActivityIndicator|shimmer",
  "rapid-double-tap": "disabled|debounce|throttle|isSubmitting|isLoading",
};

// Search patterns for adversarial actions
const ADVERSARIAL_SEARCH: Record<AdversarialAction, string> = {
  "out-of-order-taps": "cancel|undo|back|navigate",
  "back-out-mid-flow": "onBack|goBack|pop|dismiss",
  "force-close-during-network": "abort|cleanup|unmount|cancel",
  "malformed-every-field": "validate|sanitize|trim|parseInt",
};

export async function runEdgeSweep(projectDir: string): Promise<{ pass: boolean; results: { case: EdgeCase; ok: boolean }[] }> {
  const results: { case: EdgeCase; ok: boolean }[] = [];
  for (const c of EDGE_CASES) {
    const pattern = EDGE_SEARCH[c];
    const res = await executeTool("grep", { pattern }, projectDir);
    results.push({ case: c, ok: res.ok });
  }
  return { pass: results.every((r) => r.ok), results };
}

export async function runAdversarial(projectDir: string): Promise<{ pass: boolean; results: { action: AdversarialAction; crashed: boolean }[] }> {
  const results: { action: AdversarialAction; crashed: boolean }[] = [];
  for (const a of ADVERSARIAL_ACTIONS) {
    const pattern = ADVERSARIAL_SEARCH[a];
    const res = await executeTool("grep", { pattern }, projectDir);
    results.push({ action: a, crashed: !res.ok });
  }
  return { pass: results.every((r) => !r.crashed), results };
}
