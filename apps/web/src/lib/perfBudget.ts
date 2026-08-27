// FILE: perfBudget.ts
// Purpose: Perf budget guard — interaction <50ms, LCP via measure:lcp.
// World-class: warns in dev if interaction exceeds budget.

export function assertInteractionBudget<T>(label: string, fn: () => T, budgetMs = 50): T {
  if (typeof performance === "undefined" || !import.meta.env.DEV) return fn();
  const start = performance.now();
  const result = fn();
  const dur = performance.now() - start;
  if (dur > budgetMs) console.warn(`[perf] ${label} took ${dur.toFixed(1)}ms > ${budgetMs}ms`);
  return result;
}
