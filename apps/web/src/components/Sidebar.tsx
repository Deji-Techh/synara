// apps/web/src/components/Sidebar.tsx — Pure Caide sidebar with delete + status
import { useCallback, useEffect, useState } from "react";

interface Project { id: string; name: string; framework: string; workspace_root: string; updated_at: string; thread_count: number }
interface Thread { id: string; project_id: string; title: string; status: string; created_at: string }

interface SidebarProps {
  onSelectThread?: (threadId: string) => void;
  onOpenSettings?: () => void;
  onOpenCreateProject?: () => void;
  selectedThread?: string;
}

export function Sidebar({ onSelectThread, onOpenSettings, onOpenCreateProject, selectedThread }: SidebarProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [threads, setThreads] = useState<Record<string, Thread[]>>({});
  const [files, setFiles] = useState<Record<string, string[]>>({});
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const refreshProjects = useCallback(() => {
    fetch("/api/harness/projects").then((r) => r.json()).then((data) => {
      if (Array.isArray(data)) setProjects(data);
    }).catch(() => {});
  }, []);

  useEffect(() => { refreshProjects(); }, [refreshProjects]);

  useEffect(() => {
    for (const proj of projects) {
      fetch(`/api/harness/projects/${proj.id}/threads`).then((r) => r.json()).then((data) => {
        if (Array.isArray(data)) setThreads((prev) => ({ ...prev, [proj.id]: data }));
      }).catch(() => {});
      fetch(`/api/harness/projects/${proj.id}/files`).then((r) => r.json()).then((data) => {
        if (Array.isArray(data)) setFiles((prev) => ({ ...prev, [proj.id]: data }));
      }).catch(() => {});
    }
  }, [projects]);

  const toggleExpand = (id: string) => setExpandedProject((prev) => (prev === id ? null : id));

  const newThread = async (projectId: string) => {
    const res = await fetch("/api/harness/thread", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, title: "New thread" }),
    });
    const data = await res.json();
    if (data.threadId) {
      onSelectThread?.(data.threadId);
      refreshProjects();
    }
  };

  const deleteProject = async (projectId: string) => {
    await fetch(`/api/harness/projects/${projectId}`, { method: "DELETE" });
    refreshProjects();
    setExpandedProject(null);
  };

  const getFileIcon = (name: string) => {
    if (name.endsWith(".tsx") || name.endsWith(".ts")) return "bg-blue-500";
    if (name.endsWith(".dart")) return "bg-cyan-500";
    if (name.endsWith(".css") || name.endsWith(".json")) return "bg-green-500";
    if (name.endsWith(".md")) return "bg-gray-400";
    return "bg-gray-300";
  };

  const filteredProjects = projects.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <aside className="w-64 shrink-0 border-r border-border bg-card flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <span className="text-sm font-bold">Caide</span>
        <span className="text-[10px] text-muted-foreground">Pure harness</span>
      </div>
      <div className="flex gap-1 px-3 py-2 border-b border-border">
        <button type="button" onClick={onOpenCreateProject} className="flex-1 rounded-full bg-foreground px-2 py-1 text-[10px] font-medium text-background hover:opacity-90">+ New project</button>
        <button type="button" onClick={onOpenSettings} className="rounded-full border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-accent">Settings</button>
      </div>
      <div className="px-3 py-1 border-b border-border">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search projects..." className="w-full bg-transparent text-[11px] px-2 py-1 rounded border border-border outline-none placeholder:text-muted-foreground/40" />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-xs text-muted-foreground">{search ? "No matches" : "No projects yet"}</p>
            <p className="text-[10px] text-muted-foreground/60">Create your first project above</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {filteredProjects.map((proj) => (
              <div key={proj.id} className="group">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => toggleExpand(proj.id)} className="flex-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-accent">
                    <span className={`size-1.5 rounded-full ${proj.framework === "react-native" ? "bg-blue-500" : proj.framework === "flutter" ? "bg-cyan-500" : proj.framework === "website" ? "bg-green-500" : "bg-gray-400"}`} />
                    <span className="truncate font-medium text-foreground">{proj.name}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">{(threads[proj.id] ?? []).length}</span>
                    <span className="text-[10px] text-muted-foreground/50">{expandedProject === proj.id ? "▾" : "▸"}</span>
                  </button>
                  <button type="button" onClick={() => newThread(proj.id)} className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-accent" title="New thread">+</button>
                  <button type="button" onClick={() => deleteProject(proj.id)} className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-red-500 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity" title="Delete project">×</button>
                </div>
                {expandedProject === proj.id && (
                  <>
                    {(threads[proj.id] ?? []).map((thread) => (
                      <button
                        key={thread.id}
                        type="button"
                        onClick={() => onSelectThread?.(thread.id)}
                        className={`flex w-full items-center gap-2 rounded-lg pl-6 pr-2 py-1 text-left text-xs hover:bg-accent ${selectedThread === thread.id ? "bg-accent text-foreground" : "text-muted-foreground"}`}
                      >
                        <span className="truncate">{thread.title}</span>
                        <span className={`ml-auto size-1.5 rounded-full ${thread.status === "idle" ? "bg-gray-400" : thread.status === "running" ? "bg-amber-500 animate-pulse" : thread.status === "completed" ? "bg-emerald-500" : "bg-red-500"}`} />
                      </button>
                    ))}
                    {(files[proj.id] ?? []).length > 0 && (
                      <div className="pl-6 pt-1">
                        <p className="text-[10px] font-medium text-muted-foreground/60 px-2 mb-0.5">Files</p>
                        {(files[proj.id] ?? []).slice(0, 10).map((f) => (
                          <div key={f} className="flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] text-muted-foreground">
                            <span className={`size-1 rounded-sm ${getFileIcon(f)}`} />
                            <span className="truncate">{f}</span>
                          </div>
                        ))}
                        {(files[proj.id] ?? []).length > 10 && (
                          <p className="text-[10px] text-muted-foreground/40 px-2">+{(files[proj.id] ?? []).length - 10} more</p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
