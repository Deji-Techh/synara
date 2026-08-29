// apps/web/src/components/SettingsPage.tsx — Pure Caide minimal settings (M37/M59)
interface SettingsPageProps { open: boolean; onClose: () => void; }

export function SettingsPage({ open, onClose }: SettingsPageProps) {
  if (!open) return null;
  const saved = JSON.parse(localStorage.getItem("caide:settings") ?? "{}");

  const update = (key: string, value: string) => {
    const next = { ...saved, [key]: value };
    localStorage.setItem("caide:settings", JSON.stringify(next));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button type="button" onClick={onClose} className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-accent">Close</button>
        </div>
        <div className="mb-6">
          <h3 className="text-sm font-medium mb-2">Theme</h3>
          <div className="flex gap-2">
            {(["light", "dark", "system"] as const).map((mode) => (
              <button key={mode} type="button" onClick={() => { const s = JSON.parse(localStorage.getItem("caide:settings") ?? "{}"); s.theme = mode; localStorage.setItem("caide:settings", JSON.stringify(s)); window.location.reload(); }}
                className={`rounded-full px-3 py-1 text-xs font-medium border ${(saved.theme ?? "system") === mode ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-accent"}`}>{mode}</button>
            ))}
          </div>
        </div>
        <div className="mb-6">
          <h3 className="text-sm font-medium mb-2">Provider API Key</h3>
          <p className="text-[10px] text-muted-foreground mb-2">Your key is stored locally and only sent to OpenCode endpoints.</p>
          <input type="password" value={saved.apiKey ?? ""} onChange={(e) => update("apiKey", e.target.value)} placeholder="OpenCode API key" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[var(--color-text-accent)] mb-2" />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground">Model ID</label>
              <input value={saved.model ?? "deepseek-v4-flash"} onChange={(e) => update("model", e.target.value)} placeholder="deepseek-v4-flash" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-[var(--color-text-accent)]" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Base URL</label>
              <input value={saved.baseUrl ?? "https://opencode.ai/zen/v1"} onChange={(e) => update("baseUrl", e.target.value)} placeholder="https://opencode.ai/zen/v1" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-[var(--color-text-accent)]" />
            </div>
          </div>
        </div>
        <div className="mb-6">
          <h3 className="text-sm font-medium mb-2">Framework</h3>
          <p className="text-[10px] text-muted-foreground">Current: immutable after creation.</p>
        </div>
        <div>
          <h3 className="text-sm font-medium mb-2">Home directory</h3>
          <p className="text-[10px] text-muted-foreground font-mono">~/caide-apps</p>
        </div>
      </div>
    </div>
  );
}
