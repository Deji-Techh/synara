// harness/edgeRunner.ts — M14 edge sweeps + M15 adversarial execution via live preview primitives
// Drives DeviceFrame/PreviewStage interaction primitives, not chance in Builder first pass

import { EDGE_CASES, ADVERSARIAL_ACTIONS, type EdgeCase, type AdversarialAction } from "./edge";

export async function runEdgeSweep(input: { sliceSpec: string; previewUrl: string; runInteraction: (action: EdgeCase) => Promise<void> }): Promise<{ case: EdgeCase; ok: boolean }[]> {
  const results: { case: EdgeCase; ok: boolean }[] = [];
  for (const c of EDGE_CASES) {
    try {
      await input.runInteraction(c);
      results.push({ case: c, ok: true });
    } catch {
      results.push({ case: c, ok: false });
    }
  }
  return results;
}

export async function runAdversarial(input: { sliceSpec: string; previewUrl: string; runAction: (a: AdversarialAction) => Promise<void> }): Promise<{ action: AdversarialAction; crashed: boolean }[]> {
  const results: { action: AdversarialAction; crashed: boolean }[] = [];
  for (const a of ADVERSARIAL_ACTIONS) {
    try {
      await input.runAction(a);
      results.push({ action: a, crashed: false });
    } catch {
      results.push({ action: a, crashed: true });
    }
  }
  return results;
}
