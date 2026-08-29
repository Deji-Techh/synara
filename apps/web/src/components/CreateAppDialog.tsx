// apps/web/src/components/CreateAppDialog.tsx — Pure Caide framework picker (M36)
import { useState } from "react";

interface CreateAppDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (projectId: string, threadId: string) => void;
}

const FRAMEWORKS = [
  { id: "blank", label: "Blank", description: "Empty project — pick a framework-appropriate skill for your first slice", color: "bg-gray-400" },
  { id: "react-native", label: "React Native", description: "Expo app with TypeScript — builds native iOS/Android + web", color: "bg-blue-500" },
  { id: "flutter", label: "Flutter", description: "Dart app with Material Design — builds APK/AAB/IPA", color: "bg-cyan-500" },
  { id: "website", label: "Website", description: "Vite + React/TS/Vanilla — fast web preview and production build", color: "bg-green-500" },
] as const;

export function CreateAppDialog({ open, onClose, onCreated }: CreateAppDialogProps) {
  const [name, setName] = useState("");
  const [framework, setFramework] = useState<string>("blank");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/harness/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), framework }),
      });
      const data = await res.json();
      onCreated?.(data.projectId, data.threadId);
      onClose();
    } catch (err) {
      console.error("Failed to create project", err);
    } finally { setCreating(false); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <h2 className="text-lg font-semibold mb-4">Create new project</h2>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Project name"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent mb-4"
          autoFocus
        />
        <div className="grid grid-cols-2 gap-2 mb-4">
          {FRAMEWORKS.map((fw) => (
            <button
              key={fw.id}
              type="button"
              onClick={() => setFramework(fw.id)}
              className={`rounded-xl border-2 p-3 text-left transition-all ${framework === fw.id ? "border-foreground bg-accent/5" : "border-border hover:border-accent/30"}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`size-2 rounded-full ${fw.color}`} />
                <span className="text-sm font-medium">{fw.label}</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-tight">{fw.description}</p>
            </button>
          ))}
        </div>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="rounded-full border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-accent">Cancel</button>
          <button type="button" onClick={handleCreate} disabled={!name.trim() || creating} className="rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50">{creating ? "Creating..." : "Create project"}</button>
        </div>
      </div>
    </div>
  );
}
