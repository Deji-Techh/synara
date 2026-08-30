/**
 * Cost/retrieval M20 — L0+L1 caching, semantic skill cache, speculative 2-draft, decisions log, cost-aware routing.
 */
export function costAwareModel(sliceComplexity: "low" | "high", budgetRemaining: number): string {
  if (budgetRemaining < 0.2 && sliceComplexity === "low") return "cheap";
  return "strong";
}
