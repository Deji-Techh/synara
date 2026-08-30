/**
 * Visual verification — habit after every screen: live preview → screenshot → Verifier.
 * Steal 004 M11 + dyad screenshot + kimi-code BlockAssembler.
 */
import { verifySlice } from "./index.ts";

export type VisualResult = { screenshot: string; passed: boolean; confidence: number };

export async function verifyVisual(
  sliceId: string,
  capture: () => Promise<string>,
): Promise<VisualResult> {
  const screenshot = await capture();
  const result = verifySlice({ [sliceId]: screenshot });
  return { screenshot, passed: result.passed, confidence: result.confidence };
}
