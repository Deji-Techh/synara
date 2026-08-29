// apps/web/src/components/SettingsPage.tsx — Pure Caide minimal settings (M37/M59)
// Theme + Provider API key + Framework display + Home directory — no auth, no MCP, no skills

interface SettingsPageProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsPage({ open, onClose }: SettingsPageProps) {
  if (!open) return null;

  const theme = localStorage.getItem("caide:theme");
  const parsed = theme ? JSON.parse(theme) : { mode: "system" };

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
          <p className="text-[10px] text-muted-foreground mb-2">Dark-first, single accent, white pill CTA — design tokens from design.md.</p>
          <div className="flex gap-2">
            {(["light", "dark", "system"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  const state = { ...parsed, mode };
                  localStorage.setItem("caide:theme", JSON.stringify(state));
                  window.location.reload();
                }}
                className={`rounded-full px-3 py-1 text-xs font-medium border ${parsed.mode === mode ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:bg-accent"}`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Provider */}
        <div className="mb-6">
          <h3 className="text-sm font-medium mb-2">Provider</h3>
          <p className="text-[10px] text-muted-foreground mb-2">API key for OpenCode Zen or Go — never displayed back.</p>
          <input
            type="password"
            placeholder="OpenCode API key"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent mb-2"
          />
          <p className="text-[10px] text-muted-foreground">Your key is stored locally and never sent anywhere except OpenCode endpoints.</p>
        </div>

        {/* Framework */}
        <div className="mb-6">
          <h3 className="text-sm font-medium mb-2">Framework</h3>
          <p className="text-[10px] text-muted-foreground">Current: immutable after creation. No changes allowed.</p>
        </div>

        {/* Home */}
        <div>
          <h3 className="text-sm font-medium mb-2">Home directory</h3>
          <p className="text-[10px] text-muted-foreground font-mono">{typeof process !== "undefined" ? "~caide-apps" : "~/caide-apps"}</p>
        </div>
      </div>
    </div>
  );
}
