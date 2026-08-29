// apps/web/src/components/Sidebar.tsx — Pure Caide sidebar (project list + new project + new thread + settings)
import { useCallback, useEffect, useState } from "react";

interface Project { id: string; name: string; framework: string; workspaceRoot: string; updatedAt: string; threadCount: number }
interface Thread { id: string; projectId: string; title: string; status: string; createdAt: string }

interface SidebarProps {
  onSelectThread?: (threadId: string) => void;
  onOpenSettings?: () => void;
  onOpenCreateProject?: () => void;
  selectedThread?: string;
}

export function Sidebar({ onSelectThread, onOpenSettings, onOpenCreateProject, selectedThread }: SidebarProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [threads, setThreads] = useState<Record<string, Thread[]>>({});
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

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
      <div className="flex-1 overflow-y-auto p-2">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-xs text-muted-foreground">No projects yet</p>
            <p className="text-[10px] text-muted-foreground/60">Create your first project above</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {projects.map((proj) => (
              <div key={proj.id} className="group">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => toggleExpand(proj.id)} className="flex-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-accent">
                    <span className={`size-1.5 rounded-full ${proj.framework === "react-native" ? "bg-blue-500" : proj.framework === "flutter" ? "bg-cyan-500" : proj.framework === "website" ? "bg-green-500" : "bg-gray-400"}`} />
                    <span className="truncate font-medium text-foreground">{proj.name}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground">{(threads[proj.id] ?? []).length}</span>
                    <span className="text-[10px] text-muted-foreground/50">{expandedProject === proj.id ? "▾" : "▸"}</span>
                  </button>
                  <button type="button" onClick={() => newThread(proj.id)} className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-accent" title="New thread">+</button>
                </div>
                {expandedProject === proj.id && (threads[proj.id] ?? []).map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => onSelectThread?.(thread.id)}
                    className={`flex w-full items-center gap-2 rounded-lg pl-6 pr-2 py-1 text-left text-xs hover:bg-accent ${selectedThread === thread.id ? "bg-accent text-foreground" : "text-muted-foreground"}`}
                  >
                    <span className="truncate">{thread.title}</span>
                    <span className={`ml-auto size-1.5 rounded-full ${thread.status === "idle" ? "bg-gray-400" : thread.status === "running" ? "bg-amber-500" : thread.status === "completed" ? "bg-emerald-500" : "bg-red-500"}`} />
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
