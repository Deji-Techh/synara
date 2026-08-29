// apps/web/src/components/FileDiffView.tsx — M44: Real file changes after build
interface FileDiff { path: string; additions: number; deletions: number; status: "added" | "modified" | "deleted" }

interface FileDiffViewProps {
  files: FileDiff[];
  isOpen: boolean;
  onClose: () => void;
}

export function FileDiffView({ files, isOpen, onClose }: FileDiffViewProps) {
  if (!isOpen || files.length === 0) return null;
  return (
    <div className="fixed bottom-0 right-0 z-40 w-96 max-h-[60vh] rounded-t-2xl border border-border bg-card shadow-xl overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-sm font-medium">Changes ({files.length} files)</span>
        <button type="button" onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
      </div>
      <div className="overflow-y-auto">
        {files.map((f, i) => (
          <div key={i} className="flex items-center gap-2 px-4 py-1.5 border-b border-border last:border-0">
            <span className={`size-1.5 rounded-full ${f.status === "added" ? "bg-emerald-500" : f.status === "deleted" ? "bg-red-500" : "bg-amber-500"}`} />
            <span className="truncate text-xs font-mono">{f.path}</span>
            <span className="ml-auto text-[10px] text-muted-foreground">+{f.additions} -{f.deletions}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
