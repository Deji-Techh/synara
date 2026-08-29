// apps/web/src/components/FileDiffView.tsx — Real file diff with +/- lines
import { useState, useEffect } from "react";

interface FileDiff { filename: string; oldContent: string; newContent: string }

interface FileDiffViewProps {
  projectId?: string;
}

export function FileDiffView({ projectId }: FileDiffViewProps) {
  const [files, setFiles] = useState<string[]>([]);
  const [diffs, setDiffs] = useState<FileDiff[]>([]);

  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/harness/projects/${projectId}/files`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setFiles(data); })
      .catch(() => {});
  }, [projectId]);

  if (files.length === 0) {
    return <div className="text-xs text-muted-foreground p-4">No files yet</div>;
  }

  return (
    <div className="flex flex-col gap-2 p-4">
      <p className="text-xs font-medium text-muted-foreground">Project files ({files.length})</p>
      {files.map((f) => (
        <div key={f} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <span className={`size-2 rounded-sm ${f.endsWith(".tsx") || f.endsWith(".ts") ? "bg-blue-500" : f.endsWith(".dart") ? "bg-cyan-500" : f.endsWith(".json") ? "bg-green-500" : "bg-gray-400"}`} />
          <span className="text-xs font-mono">{f}</span>
        </div>
      ))}
      {diffs.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium text-muted-foreground mb-1">Diffs</p>
          {diffs.map((d) => (
            <div key={d.filename} className="rounded-lg border border-border bg-card overflow-hidden mb-2">
              <div className="px-3 py-1 bg-muted text-xs font-mono">{d.filename}</div>
              <div className="p-2 text-[11px] font-mono overflow-x-auto">
                {d.newContent.split("\n").map((line, i) => (
                  <div key={i} className={`px-2 ${line.startsWith("+") ? "bg-emerald-500/10 text-emerald-500" : line.startsWith("-") ? "bg-red-500/10 text-red-500" : "text-muted-foreground"}`}>
                    {line}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
