// apps/web/src/components/SettingsPage.tsx — Pure Caide minimal settings (M37/M59)
// Supports both OpenCode Zen and OpenCode Go providers

const PROVIDERS = [
  { id: "opencode-zen", label: "OpenCode Zen", baseUrl: "https://opencode.ai/zen/v1" },
  { id: "opencode-go", label: "OpenCode Go", baseUrl: "https://opencode.ai/zen/go/v1" },
] as const;

const DEFAULT_MODELS_ZEN = ["deepseek-v4-flash", "mimo-v2.5", "kimi-k3", "qwen3.8-max", "gemini-3.7-flash"];
const DEFAULT_MODELS_GO = ["grok-4.6", "deepseek-v4-flash", "mimo-v2.5", "qwen3.8-max", "glm-5.3"];

interface SettingsPageProps { open: boolean; onClose: () => void; }

export function SettingsPage({ open, onClose }: SettingsPageProps) {
  if (!open) return null;
  const saved = JSON.parse(localStorage.getItem("caide:settings") ?? "{}");

  const update = (key: string, value: string) => {
    const next = { ...saved, [key]: value };
    localStorage.setItem("caide:settings", JSON.stringify(next));
  };

  const provider = saved.provider ?? "opencode-zen";
  const baseUrl = saved.baseUrl ?? (provider === "opencode-go" ? "https://opencode.ai/zen/go/v1" : "https://opencode.ai/zen/v1");
  const models = provider === "opencode-go" ? DEFAULT_MODELS_GO : DEFAULT_MODELS_ZEN;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button type="button" onClick={onClose} className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-accent">Close</button>
        </div>

        {/* Theme */}
        <div className="mb-6">
          <h3 className="text-sm font-medium mb-2">Theme</h3>
          <div className="flex gap-2">
            {(["light", "dark", "system"] as const).map((mode) => (
              <button key={mode} type="button" onClick={() => { const s = JSON.parse(localStorage.getItem("caide:settings") ?? "{}"); s.theme = mode; localStorage.setItem("caide:settings", JSON.stringify(s)); window.location.reload(); }}
                className={`rounded-full px-3 py-1 text-xs font-medium border ${(saved.theme ?? "system") === mode ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-accent"}`}>{mode}</button>
            ))}
          </div>
        </div>

        {/* Provider */}
        <div className="mb-6">
          <h3 className="text-sm font-medium mb-2">Provider</h3>
          <p className="text-[10px] text-muted-foreground mb-2">Choose OpenCode Zen or OpenCode Go. Your key is stored locally.</p>
          <div className="flex gap-2 mb-3">
            {PROVIDERS.map((p) => (
              <button key={p.id} type="button" onClick={() => { update("provider", p.id); update("baseUrl", p.baseUrl); }}
                className={`rounded-full px-3 py-1 text-xs font-medium border ${provider === p.id ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-accent"}`}>
                {p.label}
              </button>
            ))}
          </div>
          <input type="password" value={saved.apiKey ?? ""} onChange={(e) => update("apiKey", e.target.value)} placeholder="API key" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[var(--color-text-accent)] mb-2" />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground">Model</label>
              <select value={saved.model ?? models[0]} onChange={(e) => update("model", e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-[var(--color-text-accent)]">
                {models.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Base URL</label>
              <input value={saved.baseUrl ?? baseUrl} onChange={(e) => update("baseUrl", e.target.value)} placeholder={baseUrl} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-[var(--color-text-accent)]" />
            </div>
          </div>
        </div>

        {/* Framework */}
        <div className="mb-6">
          <h3 className="text-sm font-medium mb-2">Framework</h3>
          <p className="text-[10px] text-muted-foreground">Current: immutable after creation. Blank / React Native / Flutter / Website.</p>
        </div>

        {/* Home directory */}
        <div>
          <h3 className="text-sm font-medium mb-2">Home directory</h3>
          <p className="text-[10px] text-muted-foreground font-mono">~/caide-apps</p>
        </div>
      </div>
    </div>
  );
}
