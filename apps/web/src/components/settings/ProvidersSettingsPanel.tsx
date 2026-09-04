// FILE: ProvidersSettingsPanel.tsx
// Purpose: Unified provider picker, key management, live connection testing,
// and available model inspection (Dyad x Caide parity in Caide styling).
// Layer: Settings panel

import { PROVIDER_DISPLAY_NAMES, type ProviderKind } from "@caide/contracts";
import { PROVIDER_DESCRIPTORS } from "@caide/shared/providerMetadata";
import { pluralize } from "@caide/shared/text";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type ReactNode, useCallback, useMemo, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { ensureNativeApi } from "~/nativeApi";
import { providerDiscoveryQueryKeys } from "~/lib/providerDiscoveryReactQuery";
import { toastManager } from "~/components/ui/toast";
import type { AppSettings, AppSettingsBinding } from "~/appSettings";
import { CentralIcon } from "~/lib/central-icons";
import {
  ExternalLinkIcon,
  RefreshCwIcon,
  Trash2,
  TriangleAlertIcon,
} from "~/lib/icons";
import { cn } from "~/lib/utils";
import { sameProviderOrder } from "~/providerOrdering";
import {
  SETTINGS_INSET_LIST_CLASS_NAME,
  SETTINGS_INSET_RADIUS_CLASS_NAME,
  SETTINGS_OUTLINED_SURFACE_CLASS_NAME,
} from "~/settingsPanelStyles";
import { ELEVATED_HOVER_SURFACE_RAISED_TEXT_CLASS_NAME } from "~/surfaceStyles";

import { Button } from "../ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../ui/collapsible";
import { DisclosureChevron } from "../ui/DisclosureChevron";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { SettingResetButton } from "./SettingControls";
import { SettingsRow, SettingsSection } from "./SettingsPanelPrimitives";
import { ModelsSection } from "./ModelsSection";
import { useDyadProviderSettings } from "~/hooks/useDyadProviderSettings";

const KEYLESS_PROVIDERS = new Set<string>(["ollama", "lmstudio"]);
const CUSTOM_PROVIDERS = new Set<string>(["custom"]);

const PROVIDER_WEBSITE_URLS: Record<string, string> = {
  openai: "https://platform.openai.com/api-keys",
  anthropic: "https://console.anthropic.com/settings/keys",
  google: "https://aistudio.google.com/api-keys",
  openrouter: "https://openrouter.ai/settings/keys",
  deepseek: "https://platform.deepseek.com/api_keys",
  groq: "https://console.groq.com/keys",
  xai: "https://console.xai.com/",
  minimax: "https://platform.minimax.io/",
  opencodeZen: "https://opencode.ai/zen",
  opencodeGo: "https://opencode.ai/zen",
  azure: "https://portal.azure.com/",
  bedrock: "https://console.aws.amazon.com/bedrock/",
  mistral: "https://console.mistral.ai/api-keys",
  together: "https://api.together.xyz/settings/api-keys",
  cohere: "https://dashboard.cohere.com/api-keys",
  fireworks: "https://fireworks.ai/account/api-keys",
};

const PROVIDER_FREE_TIERS = new Set<string>([
  "google",
  "openrouter",
  "ollama",
  "lmstudio",
]);

const PROVIDER_VISIBILITY_OPTIONS: ReadonlyArray<{ provider: ProviderKind; title: string }> =
  PROVIDER_DESCRIPTORS.map((descriptor) => ({
    provider: descriptor.kind,
    title: descriptor.displayName,
  }));

export function isProviderInstallSettingsDirty(
  settings: AppSettings,
  defaults: AppSettings,
): boolean {
  return (
    settings.groqApiKeyConfigured !== defaults.groqApiKeyConfigured ||
    settings.opencodeZenApiKeyConfigured !== defaults.opencodeZenApiKeyConfigured ||
    settings.opencodeGoApiKeyConfigured !== defaults.opencodeGoApiKeyConfigured ||
    settings.groqBaseUrl !== defaults.groqBaseUrl ||
    settings.opencodeZenBaseUrl !== defaults.opencodeZenBaseUrl ||
    settings.opencodeGoBaseUrl !== defaults.opencodeGoBaseUrl
  );
}

export function createProviderInstallResetPatch(defaults: AppSettings): Partial<AppSettings> {
  return {
    groqApiKey: defaults.groqApiKey,
    groqBaseUrl: defaults.groqBaseUrl,
    opencodeZenApiKey: defaults.opencodeZenApiKey,
    opencodeZenBaseUrl: defaults.opencodeZenBaseUrl,
    opencodeGoApiKey: defaults.opencodeGoApiKey,
    opencodeGoBaseUrl: defaults.opencodeGoBaseUrl,
  };
}

function setProviderHidden(
  current: ReadonlyArray<ProviderKind>,
  provider: ProviderKind,
  hidden: boolean,
): ProviderKind[] {
  const withoutTarget = current.filter((entry) => entry !== provider);
  return hidden ? [...withoutTarget, provider] : withoutTarget;
}

function SortableProviderVisibilityRow(props: {
  option: { provider: ProviderKind; title: string };
  isHidden: boolean;
  isConfigured: boolean;
  onHiddenChange: (hidden: boolean) => void;
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.option.provider });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        SETTINGS_OUTLINED_SURFACE_CLASS_NAME,
        "flex items-center justify-between gap-3 px-3 py-2.5",
        isDragging && "z-10 opacity-80 shadow-lg",
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          type="button"
          ref={setActivatorNodeRef}
          className={cn(
            "inline-flex size-6 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground active:cursor-grabbing",
            ELEVATED_HOVER_SURFACE_RAISED_TEXT_CLASS_NAME,
            SETTINGS_INSET_RADIUS_CLASS_NAME,
          )}
          aria-label={`Reorder ${props.option.title}`}
          {...attributes}
          {...listeners}
        >
          <CentralIcon name="dot-grid-2x3" className="size-4" />
        </button>
        <span className="min-w-0 text-sm text-foreground">{props.option.title}</span>
        {props.isConfigured ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
            Ready
          </span>
        ) : null}
      </div>
      <Switch
        checked={!props.isHidden}
        onCheckedChange={(checked) => props.onHiddenChange(!Boolean(checked))}
        aria-label={`Show ${props.option.title} in the provider picker`}
      />
    </div>
  );
}

interface ProviderCardProps {
  providerId: ProviderKind;
  displayName: string;
  isOpen: boolean;
  onToggle: () => void;
  configured: boolean;
  testResult?: { ok: boolean; message: string };
  connected: boolean;
  onSaveKey: (id: string, entry: { apiKey?: string; apiBaseUrl?: string }) => void;
  onTestKey: (id: string) => void;
}

function ProviderCard({
  providerId,
  displayName,
  isOpen,
  onToggle,
  configured,
  testResult,
  connected,
  onSaveKey,
  onTestKey,
}: ProviderCardProps) {
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [baseUrlInput, setBaseUrlInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const isKeyless = KEYLESS_PROVIDERS.has(providerId);
  const isCustom = CUSTOM_PROVIDERS.has(providerId);
  const websiteUrl = PROVIDER_WEBSITE_URLS[providerId];
  const hasFreeTier = PROVIDER_FREE_TIERS.has(providerId);

  const handleSave = () => {
    const key = apiKeyInput.trim();
    const base = baseUrlInput.trim();
    onSaveKey(providerId, {
      ...(key ? { apiKey: key } : {}),
      ...(base ? { apiBaseUrl: base } : {}),
    });
    setApiKeyInput("");
    toastManager.add({
      type: "success",
      title: `${displayName} settings saved`,
      description: "Credentials stored securely on this device.",
    });
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setApiKeyInput(text.trim());
        toastManager.add({ type: "success", title: "Pasted API key from clipboard" });
      }
    } catch {
      toastManager.add({ type: "error", title: "Could not access clipboard" });
    }
  };

  const handleClear = () => {
    onSaveKey(providerId, { apiKey: "" });
    setApiKeyInput("");
    toastManager.add({ type: "success", title: `${displayName} credentials cleared` });
  };

  const handleRunTest = () => {
    setIsTesting(true);
    onTestKey(providerId);
    setTimeout(() => setIsTesting(false), 2000);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <div className="border-t border-border/70 first:border-t-0">
        <div className="flex min-h-12 items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-muted/30">
          <CollapsibleTrigger
            type="button"
            className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none"
          >
            <DisclosureChevron open={isOpen} className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 font-medium text-sm text-foreground">
              {displayName}
            </span>
            <div className="flex items-center gap-2">
              {configured ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                  Ready
                </span>
              ) : isKeyless ? (
                <span className="rounded-full bg-muted/80 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                  Local
                </span>
              ) : hasFreeTier ? (
                <span className="rounded-full bg-blue-500/10 px-2 py-0.5 font-mono text-[10px] text-blue-600 dark:text-blue-400">
                  Free tier available
                </span>
              ) : (
                <span className="rounded-full bg-muted/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                  Needs key
                </span>
              )}
            </div>
          </CollapsibleTrigger>
          {websiteUrl ? (
            <Button
              variant="ghost"
              size="xs"
              className="h-7 shrink-0 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
              render={<a href={websiteUrl} target="_blank" rel="noreferrer" />}
            >
              <span>Get API key</span>
              <ExternalLinkIcon className="size-3" />
            </Button>
          ) : null}
        </div>

        <CollapsiblePanel>
          <div className="border-t border-border/60 bg-muted/15 px-4 py-4 space-y-4">
            {isKeyless ? (
              <div className="rounded-lg border border-border/50 bg-card/50 p-3">
                <p className="text-xs text-muted-foreground">
                  {displayName} runs locally on your machine. No account, API key, or billing is required.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <Input
                    className="h-8 max-w-sm font-mono text-xs"
                    placeholder={
                      providerId === "ollama" ? "http://localhost:11434/v1" : "http://localhost:1234/v1"
                    }
                    value={baseUrlInput}
                    onChange={(e) => setBaseUrlInput(e.target.value)}
                  />
                  <Button size="xs" variant="outline" onClick={handleSave}>
                    Save endpoint
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={!connected || isTesting}
                    onClick={handleRunTest}
                  >
                    {isTesting ? "Testing..." : "Test"}
                  </Button>
                </div>
              </div>
            ) : isCustom ? (
              <div className="rounded-lg border border-border/50 bg-card/50 p-3 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Connect to any self-hosted, cloud gateway, or OpenAI-compatible inference endpoint.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-mono uppercase text-muted-foreground block mb-1">
                      API Base URL (required)
                    </label>
                    <Input
                      className="h-8 font-mono text-xs"
                      placeholder="https://api.openai.com/v1"
                      value={baseUrlInput}
                      onChange={(e) => setBaseUrlInput(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono uppercase text-muted-foreground block mb-1">
                      API Key (optional)
                    </label>
                    <Input
                      type={showPassword ? "text" : "password"}
                      className="h-8 font-mono text-xs"
                      placeholder={configured ? "•••••••• (saved)" : "API key"}
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Button size="xs" onClick={handleSave} disabled={!baseUrlInput.trim()}>
                    Save endpoint
                  </Button>
                  <Button size="xs" variant="outline" onClick={handleRunTest} disabled={!connected || isTesting}>
                    {isTesting ? "Testing..." : "Test"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">
                    API Key
                  </label>
                  <div className="flex items-center gap-2 max-w-xl">
                    <Input
                      type={showPassword ? "text" : "password"}
                      className="h-8 font-mono text-xs flex-1"
                      placeholder={configured ? "•••••••••••••••• (saved)" : "Enter API key"}
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                    />
                    <Button
                      size="xs"
                      variant="ghost"
                      className="text-xs"
                      onClick={() => setShowPassword((prev) => !prev)}
                    >
                      {showPassword ? "Hide" : "Show"}
                    </Button>
                    <Button size="xs" variant="outline" className="text-xs" onClick={handlePaste}>
                      Paste
                    </Button>
                    <Button
                      size="xs"
                      className="text-xs"
                      onClick={handleSave}
                      disabled={!apiKeyInput.trim()}
                    >
                      Save
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      className="text-xs"
                      disabled={!connected || isTesting}
                      onClick={handleRunTest}
                    >
                      {isTesting ? "Testing..." : "Test"}
                    </Button>
                    {configured ? (
                      <Button
                        size="xs"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        title="Clear API key"
                        onClick={handleClear}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            )}

            {testResult ? (
              <div
                className={cn(
                  "flex items-center gap-2 rounded-md p-2 text-xs",
                  testResult.ok
                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                    : "bg-destructive/10 text-destructive border border-destructive/20",
                )}
              >
                {!testResult.ok && <TriangleAlertIcon className="size-3.5 shrink-0" />}
                <span>{testResult.message}</span>
              </div>
            ) : null}

            <ModelsSection providerId={providerId} allowCustomModels={!isKeyless} />
          </div>
        </CollapsiblePanel>
      </div>
    </Collapsible>
  );
}

export type ProvidersSettingsPanelProps = AppSettingsBinding & {
  readonly active: boolean;
  readonly resetEpoch: number;
};

export function ProvidersSettingsPanel({
  settings,
  defaults,
  updateSettings,
  active,
}: ProvidersSettingsPanelProps) {
  const { providers, tests, connected, save, test } = useDyadProviderSettings();
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({});

  const hiddenProviderSet = useMemo(
    () => new Set<ProviderKind>(settings.hiddenProviders),
    [settings.hiddenProviders],
  );
  const hiddenProviderCount = hiddenProviderSet.size;

  const providerVisibilityOptionsByProvider = useMemo(
    () => new Map(PROVIDER_VISIBILITY_OPTIONS.map((option) => [option.provider, option])),
    [],
  );

  const orderedProviderVisibilityOptions = useMemo(
    () =>
      settings.providerOrder.flatMap((provider) => {
        const option = providerVisibilityOptionsByProvider.get(provider);
        return option ? [option] : [];
      }),
    [providerVisibilityOptionsByProvider, settings.providerOrder],
  );

  const providerVisibilitySensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );
  const isProviderOrderDirty = !sameProviderOrder(settings.providerOrder, defaults.providerOrder);

  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshModels = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const api = ensureNativeApi();
      await api.server.refreshProviders();
      await queryClient.invalidateQueries({ queryKey: providerDiscoveryQueryKeys.all });
      toastManager.add({
        type: "success",
        title: "Models refreshed",
        description: "Successfully updated available model catalog from provider endpoints.",
      });
    } catch (err) {
      toastManager.add({
        type: "error",
        title: "Failed to refresh models",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [queryClient]);

  const handleProviderOrderDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const fromIndex = settings.providerOrder.indexOf(active.id as ProviderKind);
      const toIndex = settings.providerOrder.indexOf(over.id as ProviderKind);
      if (fromIndex < 0 || toIndex < 0) return;
      updateSettings({ providerOrder: arrayMove([...settings.providerOrder], fromIndex, toIndex) });
    },
    [settings.providerOrder, updateSettings],
  );

  const configuredMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const p of providers) {
      map.set(p.id, p.configured);
    }
    return map;
  }, [providers]);

  if (!active) return null;

  return (
    <div className="space-y-6">
      <SettingsSection
        title="Provider picker"
        action={
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-xs"
            onClick={handleRefreshModels}
            disabled={isRefreshing}
          >
            <RefreshCwIcon className={cn("size-3.5", isRefreshing && "animate-spin")} />
            <span>{isRefreshing ? "Refreshing..." : "Refresh models"}</span>
          </Button>
        }
      >
        <SettingsRow
          title="Visible providers"
          description="Drag providers into your preferred picker order and hide the ones you don't use. The provider you're currently using on a thread always stays visible."
          status={
            hiddenProviderCount > 0
              ? `${hiddenProviderCount} ${pluralize(hiddenProviderCount, "provider")} hidden`
              : isProviderOrderDirty
                ? "Custom order"
                : "All providers visible"
          }
          resetAction={
            hiddenProviderCount > 0 || isProviderOrderDirty ? (
              <SettingResetButton
                label="provider picker"
                onClick={() =>
                  updateSettings({
                    hiddenProviders: defaults.hiddenProviders,
                    providerOrder: defaults.providerOrder,
                  })
                }
              />
            ) : null
          }
        >
          <DndContext
            sensors={providerVisibilitySensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleProviderOrderDragEnd}
          >
            <SortableContext
              items={orderedProviderVisibilityOptions.map((option) => option.provider)}
              strategy={verticalListSortingStrategy}
            >
              <div className="mt-4 space-y-2">
                {orderedProviderVisibilityOptions.map((option) => (
                  <SortableProviderVisibilityRow
                    key={option.provider}
                    option={option}
                    isConfigured={Boolean(configuredMap.get(option.provider))}
                    isHidden={hiddenProviderSet.has(option.provider)}
                    onHiddenChange={(hidden) =>
                      updateSettings({
                        hiddenProviders: setProviderHidden(
                          settings.hiddenProviders,
                          option.provider,
                          hidden,
                        ),
                      })
                    }
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Provider credentials & tools"
        action={
          <span className={cn("text-[11px]", connected ? "text-muted-foreground" : "text-destructive")}>
            {connected ? "Harness connected" : "Harness offline"}
          </span>
        }
      >
        <SettingsRow
          title="API credentials & available models"
          description="Configure API keys, verify connectivity with live test pings, and inspect context windows and tokens for each provider."
        >
          <div className="mt-4">
            <div className={SETTINGS_INSET_LIST_CLASS_NAME}>
              {orderedProviderVisibilityOptions.map((option) => (
                <ProviderCard
                  key={option.provider}
                  providerId={option.provider}
                  displayName={option.title}
                  isOpen={Boolean(openCards[option.provider])}
                  onToggle={() =>
                    setOpenCards((prev) => ({
                      ...prev,
                      [option.provider]: !prev[option.provider],
                    }))
                  }
                  configured={Boolean(configuredMap.get(option.provider))}
                  testResult={tests[option.provider]}
                  connected={connected}
                  onSaveKey={save}
                  onTestKey={test}
                />
              ))}
            </div>
          </div>
        </SettingsRow>
      </SettingsSection>
    </div>
  );
}

