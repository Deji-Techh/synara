// FILE: AgentRoutingSection.tsx
// Purpose: Settings → Providers → Agent routing — one model for everything
// vs per-step scout/builder/planner models picked from connected providers.
// Local-first (agentRoutingStore) + pushed to harness sessions via
// settings_sync (server validates, unknown providers dropped).

import { useMemo, useState } from "react";
import { PROVIDER_DISPLAY_NAMES, type ProviderKind } from "@caide/contracts";
import {
  getBuiltInModelsForProvider,
} from "@caide/shared/languageModelCatalog";
import { SelectItem } from "~/components/ui/select";
import { useDyadProviderSettings } from "~/hooks/useDyadProviderSettings";
import { ProviderOptionLabel } from "~/components/ProviderIcon";
import { SettingsRow, SettingsSection } from "./SettingsPanelPrimitives";
import { SettingsSegmentedControl, SettingsSelectControl } from "./SettingControls";
import { loadCustomModelsForProvider } from "./ModelsSection";
import {
  loadAgentRouting,
  ROUTING_SLOTS,
  saveAgentRouting,
  type AgentRoutingSettings,
  type RoutingMode,
  type RoutingSlot,
} from "./agentRoutingStore";

const DISPLAY_NAMES = PROVIDER_DISPLAY_NAMES as unknown as Record<string, string>;

function providerLabel(id: string): string {
  return DISPLAY_NAMES[id] ?? id;
}

function modelOptionsFor(providerId: string): Array<{ id: string; label: string }> {
  if (!providerId) return [];
  const seen = new Map<string, string>();
  for (const m of getBuiltInModelsForProvider(providerId)) {
    if (m.name && !seen.has(m.name)) seen.set(m.name, m.displayName || m.name);
  }
  for (const m of loadCustomModelsForProvider(providerId)) {
    if (m.name && !seen.has(m.name)) seen.set(m.name, m.displayName || m.name);
  }
  return [...seen.entries()].map(([id, label]) => ({ id, label }));
}

export function AgentRoutingSection() {
  const { providers, connected } = useDyadProviderSettings();
  const [routing, setRouting] = useState<AgentRoutingSettings>(() => loadAgentRouting());

  const configuredProviders = useMemo(
    () => providers.filter((p) => p.configured),
    [providers],
  );

  const persist = (next: AgentRoutingSettings) => {
    setRouting(next);
    saveAgentRouting(next);
  };

  const setMode = (mode: RoutingMode) => persist({ ...routing, mode });

  const setSlot = (slot: RoutingSlot, patch: { providerId?: string; modelId?: string }) => {
    const prev = routing.steps[slot];
    const next = { ...routing.steps, [slot]: { ...prev, ...patch } };
    // Changing provider resets an incompatible model choice.
    if (patch.providerId !== undefined && patch.providerId !== prev.providerId) {
      next[slot] = { providerId: patch.providerId, modelId: "" };
    }
    persist({ ...routing, steps: next });
  };

  return (
    <SettingsSection title="Agent routing">
      <SettingsRow
        title="Routing mode"
        description="One model uses the thread model for every step. Per-step uses Scout for read-only steps, Builder once code changes, and Planner for plan-mode turns. Empty slots inherit the thread model."
        control={
          <SettingsSegmentedControl<RoutingMode>
            value={routing.mode}
            onValueChange={setMode}
            ariaLabel="Routing mode"
            options={[
              { value: "single", label: "One model" },
              { value: "per-step", label: "Per-step" },
            ]}
          />
        }
      />
      {routing.mode === "per-step" && (
        <>
          {ROUTING_SLOTS.map((slot) => {
            const pick = routing.steps[slot.id];
            const provider = configuredProviders.find((p) => p.id === pick.providerId);
            const models = modelOptionsFor(pick.providerId);
            return (
              <SettingsRow
                key={slot.id}
                title={slot.label}
                description={slot.hint}
                status={
                  !connected
                    ? "Harness offline"
                    : pick.providerId && !provider
                      ? "Provider not connected"
                      : undefined
                }
                control={
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <SettingsSelectControl
                      value={pick.providerId || "__default"}
                      onValueChange={(v) =>
                        setSlot(slot.id, { providerId: v === "__default" ? "" : v })
                      }
                      ariaLabel={`${slot.label} provider`}
                      valueContent={
                        pick.providerId ? (
                          <ProviderOptionLabel
                            provider={pick.providerId as ProviderKind}
                            label={providerLabel(pick.providerId)}
                          />
                        ) : (
                          "Thread default"
                        )
                      }
                    >
                      <SelectItem key="__default" value="__default">
                        Thread default
                      </SelectItem>
                      {configuredProviders.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          <ProviderOptionLabel
                            provider={p.id as ProviderKind}
                            label={providerLabel(p.id)}
                          />
                        </SelectItem>
                      ))}
                    </SettingsSelectControl>
                    <SettingsSelectControl
                      value={pick.modelId || "__default"}
                      onValueChange={(v) => setSlot(slot.id, { modelId: v === "__default" ? "" : v })}
                      ariaLabel={`${slot.label} model`}
                      valueContent={pick.modelId || "Thread default"}
                    >
                      <SelectItem key="__default" value="__default">
                        Thread default
                      </SelectItem>
                      {models.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SettingsSelectControl>
                  </div>
                }
              />
            );
          })}
          {configuredProviders.length === 0 && (
            <SettingsRow
              title="No connected providers"
              description="Connect a provider above first — per-step slots can only use connected providers."
            />
          )}
        </>
      )}
    </SettingsSection>
  );
}
