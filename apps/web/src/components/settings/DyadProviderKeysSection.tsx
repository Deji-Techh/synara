// FILE: DyadProviderKeysSection.tsx
// Purpose: Settings → Agent providers → harness model provider keys.
// Same Caide settings primitives; keys are write-only (server confirms with
// configured flags + live test results, never echoes keys).

import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";
import { cn } from "~/lib/utils";
import { knownDyadProviders, useDyadProviderSettings } from "~/hooks/useDyadProviderSettings";
import { SettingsListRow, SettingsRow, SettingsSection } from "./SettingsPanelPrimitives";

const KEYLESS = new Set(["ollama", "lmstudio", "auto"]);

export function DyadProviderKeysSection() {
  const { providers, tests, connected, save, test } = useDyadProviderSettings();
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [bases, setBases] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [savedFlash, setSavedFlash] = useState<Record<string, number>>({});

  const configuredById = new Map(providers.map((p) => [p.id, p]));

  const saveKey = (id: string) => {
    const key = (keys[id] ?? "").trim();
    const base = (bases[id] ?? "").trim();
    // Omit an empty key so saving a base URL never wipes the stored key.
    save(id, { ...(key ? { apiKey: key } : {}), ...(base ? { apiBaseUrl: base } : {}) });
    setKeys((prev) => ({ ...prev, [id]: "" }));
    setSavedFlash((prev) => ({ ...prev, [id]: Date.now() }));
  };

  return (
    <SettingsSection
      title="Harness model providers (Dyad)"
      action={
        <span className={cn("text-[11px]", connected ? "text-muted-foreground" : "text-destructive")}>
          {connected ? "Harness connected" : "Harness offline — start the server"}
        </span>
      }
    >
      <SettingsRow
        title="How this works"
        description="Keys save to the server (user-only file, never echoed back). Turns use them automatically; per-turn provider/model overrides still win. Local runtimes need no key."
        control={null}
      />
      {knownDyadProviders().map((id) => {
        const status = configuredById.get(id);
        const testResult = tests[id];
        const showing = showKeys[id] ?? false;
        const flashed = savedFlash[id] && Date.now() - savedFlash[id] < 3000;
        return (
          <div key={id} className="border-b border-border/50 py-2 last:border-b-0">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  status?.configured ? "bg-green-500" : "bg-muted-foreground/40",
                )}
              />
              <span className="w-28 shrink-0 truncate text-xs font-medium capitalize">{id}</span>
              {!KEYLESS.has(id) ? (
                <Input
                  type={showing ? "text" : "password"}
                  className="h-7 font-mono text-[11px]"
                  placeholder={status?.configured ? "•••••• (saved)" : "API key"}
                  value={keys[id] ?? ""}
                  onChange={(e) => setKeys((prev) => ({ ...prev, [id]: e.target.value }))}
                />
              ) : (
                <span className="flex-1 text-[11px] text-muted-foreground">Keyless local runtime</span>
              )}
              <Input
                className="h-7 w-40 font-mono text-[11px]"
                placeholder="Base URL (optional)"
                value={bases[id] ?? ""}
                onChange={(e) => setBases((prev) => ({ ...prev, [id]: e.target.value }))}
              />
              <Button
                size="xs"
                variant="outline"
                disabled={!connected || (!KEYLESS.has(id) && !(keys[id] ?? "").trim() && !(bases[id] ?? "").trim())}
                onClick={() => saveKey(id)}
              >
                Save
              </Button>
              <Button size="xs" variant="ghost" disabled={!connected} onClick={() => test(id)}>
                Test
              </Button>
              <Switch
                checked={showing}
                onCheckedChange={(value) => setShowKeys((prev) => ({ ...prev, [id]: value }))}
                aria-label={`Show ${id} key while typing`}
              />
            </div>
            {(testResult || flashed) && (
              <div
                className={cn(
                  "mt-1 pl-4 text-[11px]",
                  testResult
                    ? testResult.ok
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {testResult ? testResult.message : "Saved."}
              </div>
            )}
          </div>
        );
      })}
      <SettingsListRow
        title="chatgpt (OAuth)"
        description="Electron OAuth flow — not portable to the harness server. Use an OpenAI API key above instead."
      />
    </SettingsSection>
  );
}
