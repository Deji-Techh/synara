/**
 * Compaction — rolling summary not truncation @70%, steal dyad mid-turn + kimi-code proactive.
 * artifact-over-conversation, per-slice fresh ctx.
 */
export function shouldCompact(usedTokens: number, budget: number): boolean {
  return usedTokens / budget >= 0.7;
}

export function summarize(history: string[]): string {
  return `Summary of ${history.length} messages: ${history.slice(-2).join(" | ")}`;
}
