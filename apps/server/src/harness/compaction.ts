// harness/compaction.ts — M9 rolling summarization not truncation @70% clean boundary
// Artifact-over-conversation + per-slice fresh ctx + proactive

export interface CompactionState {
  readonly tokenBudget: number;
  readonly usedTokens: number;
  readonly summary: string | null;
  readonly recentTurns: readonly string[];
  readonly persistentArtifacts: readonly string[]; // spec.md, architecture.md, manifest.json refs
}

export function shouldCompact(state: CompactionState): boolean {
  return state.usedTokens / state.tokenBudget >= 0.7;
}

export function compact(state: CompactionState, cheapModelSummarize: (input: { built: string; decisions: string[]; pending: string[] }) => string): CompactionState {
  if (!shouldCompact(state)) return state;
  const built = state.recentTurns.slice(0, -2).join("\n");
  const decisions: string[] = []; // fill from session decisions log (M20)
  const pending = state.recentTurns.slice(-2);
  const summary = cheapModelSummarize({ built, decisions, pending });
  return {
    ...state,
    summary,
    recentTurns: pending,
    // persistent artifacts never dropped — artifact-over-conversation
  };
}

export function freshSliceContext(layer0: string, layer1: string, stageContext: string, sliceSpec: string): string {
  // Per-slice isolation: fresh context L0+1+2+3 + slice spec only, not 20 prior slices (M9)
  return [layer0, layer1, stageContext, sliceSpec].join("\n\n---\n\n");
}
