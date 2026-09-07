// FILE: agentRoutingStore.ts
// Purpose: Agent routing settings (single model vs per-step scout/builder/
// planner) for Settings → Providers → Agent routing. Local-first
// (localStorage) + pushed to every harness session via settings_sync
// (server validates provider ids, unknown dropped). Mirrors the
// toolApprovalsStore pattern.

import { syncAllActiveHarnessSettings } from "~/harnessWs";

export type RoutingMode = "single" | "per-step";
export type RoutingSlot = "scout" | "builder" | "planner";

export interface SlotModel {
  providerId: string;
  modelId: string;
}

export interface AgentRoutingSettings {
  mode: RoutingMode;
  steps: Record<RoutingSlot, SlotModel>;
  fallbacks: SlotModel[];
}

export const ROUTING_SLOTS: Array<{ id: RoutingSlot; label: string; hint: string }> = [
  { id: "scout", label: "Scout", hint: "Read-only steps: exploration, file reads, searches" },
  { id: "builder", label: "Builder", hint: "Steps that write code, run commands, or change state" },
  { id: "planner", label: "Planner", hint: "Plan-mode turns (questionnaires, plans)" },
];

const STORAGE_KEY = "caide:agent-routing.v1";

const EMPTY_SLOT: SlotModel = { providerId: "", modelId: "" };

export const DEFAULT_ROUTING: AgentRoutingSettings = {
  mode: "single",
  steps: { scout: { ...EMPTY_SLOT }, builder: { ...EMPTY_SLOT }, planner: { ...EMPTY_SLOT } },
  fallbacks: [],
};

export const MAX_FALLBACKS = 3;

function cleanSlot(value: unknown): SlotModel {
  if (!value || typeof value !== "object") return { ...EMPTY_SLOT };
  const rec = value as Record<string, unknown>;
  return {
    providerId: typeof rec.providerId === "string" ? rec.providerId : "",
    modelId: typeof rec.modelId === "string" ? rec.modelId : "",
  };
}

export function loadAgentRouting(): AgentRoutingSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_ROUTING);
    const parsed = JSON.parse(raw) as Partial<AgentRoutingSettings>;
    const steps = (parsed.steps ?? {}) as Record<string, unknown>;
    const fallbacks = Array.isArray((parsed as { fallbacks?: unknown }).fallbacks)
      ? ((parsed as { fallbacks?: unknown[] }).fallbacks ?? [])
          .map(cleanSlot)
          .filter((r) => r.providerId || r.modelId)
          .slice(0, MAX_FALLBACKS)
      : [];
    return {
      mode: parsed.mode === "per-step" ? "per-step" : "single",
      steps: {
        scout: cleanSlot(steps.scout),
        builder: cleanSlot(steps.builder),
        planner: cleanSlot(steps.planner),
      },
      fallbacks,
    };
  } catch {
    return structuredClone(DEFAULT_ROUTING);
  }
}

export function saveAgentRouting(next: AgentRoutingSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  syncAllActiveHarnessSettings();
}
