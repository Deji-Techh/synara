// apps/web/src/components/chat/CheckpointCard.tsx — Pure Caide human gate (M13/M19)
interface CheckpointCardProps {
  reason: string;
  confidence: number;
  tasteScore?: number;
  diffSummary?: string;
  onApprove: () => void;
  onRequestChange: (note: string) => void;
  onViewDiff: () => void;
}

export function CheckpointCard({ reason, confidence, tasteScore, diffSummary, onApprove, onRequestChange, onViewDiff }: CheckpointCardProps) {
  const needsGlance = confidence < 0.82;
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
          Checkpoint {needsGlance ? "needs glance" : "ready"}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">conf {Math.round(confidence * 100)}%{tasteScore !== undefined ? ` · taste ${Math.round(tasteScore * 100)}%` : ""}</span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{reason}</p>
      {diffSummary && <p className="mt-1 rounded bg-muted px-2 py-1 font-mono text-[11px]">{diffSummary}</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onApprove} className="rounded-full bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90">Approve</button>
        <button type="button" onClick={() => onRequestChange(prompt("What to change?") ?? "")} className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-[var(--secondary)]">Request change</button>
        <button type="button" onClick={onViewDiff} className="ml-auto rounded-full border border-border px-3 py-1.5 text-xs hover:bg-[var(--secondary)]">View diff</button>
      </div>
    </div>
  );
}
