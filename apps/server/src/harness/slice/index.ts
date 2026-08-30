/**
 * Slice loop — one complete flow UI+state+data+edge per slice.
 * Retire horizontal anti-pattern per 004 M10.
 */
import { verifySlice } from "../verifier/index.ts";

export type SliceSpec = { id: string; title: string; prompt: string };
export type SliceResult = { id: string; files: Record<string, string>; passed: boolean };

export async function runSlice(spec: SliceSpec, ctx: { appPath: string }): Promise<SliceResult> {
  // stub: Builder writes files, Verifier checks
  const files: Record<string, string> = {
    [`src/slices/${spec.id}.tsx`]: `// ${spec.title}\nexport default function Slice() { return null; }`,
  };
  const result = verifySlice(files);
  void ctx;
  return { id: spec.id, files, passed: result.passed };
}
