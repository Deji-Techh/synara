// harness/planner.ts — M7 Planner breaks spec into vertical slices (pure Caide, no dyad)
// Each slice is one complete flow UI+state+data+edge before next, always testable/demoable

export interface Slice {
  readonly id: string;
  readonly title: string;
  readonly spec: string;
  readonly kind: "screen" | "flow";
}

export function planSlices(spec: string): Slice[] {
  const flows = spec.split("\n").filter((l) => l.trim().startsWith("1.") || l.trim().startsWith("2.") || l.trim().startsWith("3."));
  // Fallback: split spec into flows by numbered list, or single slice if not found
  if (flows.length === 0) {
    return [{ id: "slice-1", title: "Initial slice", spec, kind: "flow" }];
  }
  return flows.map((flow, idx) => ({
    id: `slice-${idx + 1}`,
    title: flow.trim().slice(0, 80),
    spec: flow.trim(),
    kind: "flow" as const,
  }));
}
