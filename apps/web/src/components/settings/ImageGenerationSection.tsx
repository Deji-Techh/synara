// FILE: ImageGenerationSection.tsx
// Purpose: Settings → Providers → Image generation (P8). Preferred image
// source selector + optional model override, persisted as server defaults
// via provider_settings_set. Unavailable picks fall through silently at
// turn time (turn-model → Gemini → OpenAI → Pollinations → illustrated
// placeholder); selection costs zero probes and never stalls.

import { useState } from "react";
import { SelectItem } from "~/components/ui/select";
import { Input } from "~/components/ui/input";
import { useDyadProviderSettings } from "~/hooks/useDyadProviderSettings";
import { SettingsRow, SettingsSection } from "./SettingsPanelPrimitives";
import { SettingsSelectControl } from "./SettingControls";

const SOURCE_OPTIONS = [
  { value: "auto", label: "Auto (recommended)", hint: "Turn model if image-capable, else Gemini, OpenAI, Pollinations, placeholder." },
  { value: "turn-model", label: "Turn model", hint: "Only when the turn model itself generates images; otherwise falls through." },
  { value: "gemini", label: "Gemini", hint: "Needs a Google/Gemini key. Falls through when unconfigured." },
  { value: "openai", label: "OpenAI", hint: "Needs an OpenAI key. Falls through when unconfigured." },
  { value: "pollinations", label: "Pollinations", hint: "Keyless. Always available." },
  { value: "placeholder", label: "Illustrated placeholder", hint: "Skips generation; writes a designed SVG placeholder." },
] as const;

export function ImageGenerationSection() {
  const {
    providers,
    connected,
    defaultImageProviderId,
    defaultImageModelId,
    saveDefaults,
  } = useDyadProviderSettings();
  const [modelDraft, setModelDraft] = useState<string | null>(null);

  const source = defaultImageProviderId || "auto";
  const model = modelDraft ?? defaultImageModelId ?? "";
  const googleConfigured = providers.some((p) => (p.id === "google" || p.id === "gemini") && p.configured);
  const openaiConfigured = providers.some((p) => p.id === "openai" && p.configured);
  const needsKey =
    (source === "gemini" && !googleConfigured) || (source === "openai" && !openaiConfigured);

  return (
    <SettingsSection title="Image generation">
      <SettingsRow
        title="Preferred source"
        description="The agent tries this first for generate_image, then falls through silently — no probing, no waiting. Placeholders are only written when every leg fails and you provided no asset."
        status={!connected ? "Harness offline" : needsKey ? "Needs key — falls through meanwhile" : undefined}
        control={
          <SettingsSelectControl
            value={SOURCE_OPTIONS.some((o) => o.value === source) ? source : "auto"}
            onValueChange={(v) => saveDefaults({ imageProviderId: v === "auto" ? "" : v })}
            ariaLabel="Preferred image source"
            valueContent={SOURCE_OPTIONS.find((o) => o.value === source)?.label ?? "Auto (recommended)"}
          >
            {SOURCE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SettingsSelectControl>
        }
      >
        <p className="mt-1 text-[11px] text-muted-foreground">
          {SOURCE_OPTIONS.find((o) => o.value === source)?.hint ?? ""}
        </p>
      </SettingsRow>
      <SettingsRow
        title="Model override"
        description="Optional model id for the Gemini/OpenAI leg (e.g. gemini-2.0-flash-preview-image-generation). Empty = built-in default chain."
        control={
          <Input
            placeholder="Auto"
            value={model}
            onChange={(e) => setModelDraft(e.target.value)}
            onBlur={() => {
              if (modelDraft !== null && modelDraft.trim() !== (defaultImageModelId ?? "")) {
                saveDefaults({ imageModelId: modelDraft.trim() });
              }
              setModelDraft(null);
            }}
            className="h-8 w-56 font-mono text-xs"
            aria-label="Image model override"
          />
        }
      />
    </SettingsSection>
  );
}
