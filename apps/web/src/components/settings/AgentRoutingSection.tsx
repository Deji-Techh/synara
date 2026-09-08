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
import { Button } from "~/components/ui/button";
import {
  loadAgentRouting,
  MAX_FALLBACKS,
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
    () => providers.filter((p) => p.configured || p.keyless),
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
                      {pick.providerId && !provider && (
                        <SelectItem key={pick.providerId} value={pick.providerId}>
                          <ProviderOptionLabel
                            provider={pick.providerId as ProviderKind}
                            label={`${providerLabel(pick.providerId)} (disconnected)`}
                          />
                        </SelectItem>
                      )}
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
                      {pick.modelId && !models.some((m) => m.id === pick.modelId) && (
                        <SelectItem key={pick.modelId} value={pick.modelId}>
                          {pick.modelId} (unavailable)
                        </SelectItem>
                      )}
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
              title={connected ? "No connected providers" : "Harness offline"}
              description={
                connected
                  ? "Agent routing runs on the Builder engine, which keeps its own API keys — add one to a provider above. Until then every step inherits the thread model."
                  : "Reconnect to sync provider status; slots stay on thread defaults meanwhile."
              }
            />
          )}
        </>
      )}
      <SettingsRow
        title="Fallback chain"
        description="Tried in order when the turn provider fails with a retryable error. Empty picks inherit the thread model."
        control={
          routing.fallbacks.length < MAX_FALLBACKS ? (
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                persist({ ...routing, fallbacks: [...routing.fallbacks, { providerId: "", modelId: "" }] })
              }
            >
              Add fallback
            </Button>
          ) : undefined
        }
      >
        {routing.fallbacks.length > 0 && (
          <div className="mt-2 flex flex-col gap-2">
            {routing.fallbacks.map((fb, i) => {
              const provider = configuredProviders.find((p) => p.id === fb.providerId);
              const models = modelOptionsFor(fb.providerId);
              return (
                <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">#{i + 1}</span>
                  <SettingsSelectControl
                    value={fb.providerId || "__default"}
                    onValueChange={(v) => {
                      const next = routing.fallbacks.map((f, j) =>
                        j === i
                          ? v === "__default"
                            ? { providerId: "", modelId: "" }
                            : { providerId: v, modelId: "" }
                          : f,
                      );
                      persist({ ...routing, fallbacks: next });
                    }}
                    ariaLabel={`Fallback ${i + 1} provider`}
                    valueContent={
                      fb.providerId ? (
                        <ProviderOptionLabel
                          provider={fb.providerId as ProviderKind}
                          label={providerLabel(fb.providerId)}
                        />
                      ) : (
                        "Thread default"
                      )
                    }
                  >
                    <SelectItem key="__default" value="__default">
                      Thread default
                    </SelectItem>
                    {fb.providerId && !configuredProviders.some((p) => p.id === fb.providerId) && (
                      <SelectItem key={fb.providerId} value={fb.providerId}>
                        <ProviderOptionLabel
                          provider={fb.providerId as ProviderKind}
                          label={`${providerLabel(fb.providerId)} (disconnected)`}
                        />
                      </SelectItem>
                    )}
                    {configuredProviders.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <ProviderOptionLabel provider={p.id as ProviderKind} label={providerLabel(p.id)} />
                      </SelectItem>
                    ))}
                  </SettingsSelectControl>
                  <SettingsSelectControl
                    value={fb.modelId || "__default"}
                    onValueChange={(v) => {
                      const next = routing.fallbacks.map((f, j) =>
                        j === i ? { ...f, modelId: v === "__default" ? "" : v } : f,
                      );
                      persist({ ...routing, fallbacks: next });
                    }}
                    ariaLabel={`Fallback ${i + 1} model`}
                    valueContent={fb.modelId || "Thread default"}
                  >
                    <SelectItem key="__default" value="__default">
                      Thread default
                    </SelectItem>
                    {fb.modelId && !models.some((m) => m.id === fb.modelId) && (
                      <SelectItem key={fb.modelId} value={fb.modelId}>
                        {fb.modelId} (unavailable)
                      </SelectItem>
                    )}
                    {models.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SettingsSelectControl>
                  <Button
                    size="xs"
                    variant="ghost"
                    aria-label={`Remove fallback ${i + 1}`}
                    onClick={() =>
                      persist({ ...routing, fallbacks: routing.fallbacks.filter((_, j) => j !== i) })
                    }
                  >
                    Remove
                  </Button>
                  {!provider && fb.providerId && (
                    <span className="text-[11px] text-destructive">Provider not connected</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SettingsRow>
    </SettingsSection>
  );
}
