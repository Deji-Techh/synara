// FILE: visibleInterval.ts
// Purpose: setInterval that skips ticks while the document is hidden.
// Preview/toolchain/build polls must not burn CPU (and WS budgets) in a
// minimized or backgrounded window.

export function setVisibleInterval(fn: () => void, ms: number): () => void {
  const id = window.setInterval(() => {
    if (typeof document !== "undefined" && document.hidden) return;
    fn();
  }, ms);
  return () => window.clearInterval(id);
}
