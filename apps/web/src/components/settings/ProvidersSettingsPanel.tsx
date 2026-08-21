// FILE: ProvidersSettingsPanel.tsx
// Purpose: Own provider picker, update, and CLI installation settings workflows.
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
import { type MouseEvent, type ReactNode, useCallback, useMemo, useState } from "react";

import type { AppSettings, AppSettingsBinding } from "~/appSettings";
import { CentralIcon } from "~/lib/central-icons";
import { ExternalLinkIcon } from "~/lib/icons";
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
import { Switch } from "../ui/switch";
import { DebouncedSettingTextInput } from "./DebouncedSettingTextInput";
import { SettingResetButton, useSettingsRestoreSignal } from "./SettingControls";
import { SettingsRow, SettingsSection } from "./SettingsPanelPrimitives";

type ProviderInstallTextKey =
  | "engineBaseUrl"
  | "engineModelId"
  | "engineFlutterSdkBin"
  | "openaiBaseUrl"
  | "anthropicBaseUrl"
  | "googleBaseUrl"
  | "openrouterBaseUrl"
  | "ollamaBaseUrl"
  | "deepseekBaseUrl"
  | "groqBaseUrl"
  | "mistralBaseUrl"
  | "togetherBaseUrl"
  | "cohereBaseUrl"
  | "xaiBaseUrl"
  | "fireworksBaseUrl"
  | "opencodeZenBaseUrl"
  | "opencodeGoBaseUrl";
type ProviderInstallPasswordKey =
  | "engineApiKey"
  | "openaiApiKey"
  | "anthropicApiKey"
  | "googleApiKey"
  | "openrouterApiKey"
  | "ollamaApiKey"
  | "deepseekApiKey"
  | "groqApiKey"
  | "mistralApiKey"
  | "togetherApiKey"
  | "cohereApiKey"
  | "xaiApiKey"
  | "fireworksApiKey"
  | "opencodeZenApiKey"
  | "opencodeGoApiKey";
type ProviderInstallPasswordConfiguredKey =
  | "engineApiKeyConfigured"
  | "openaiApiKeyConfigured"
  | "anthropicApiKeyConfigured"
  | "googleApiKeyConfigured"
  | "openrouterApiKeyConfigured"
  | "ollamaApiKeyConfigured"
  | "deepseekApiKeyConfigured"
  | "groqApiKeyConfigured"
  | "mistralApiKeyConfigured"
  | "togetherApiKeyConfigured"
  | "cohereApiKeyConfigured"
  | "xaiApiKeyConfigured"
  | "fireworksApiKeyConfigured"
  | "opencodeZenApiKeyConfigured"
  | "opencodeGoApiKeyConfigured";

type ProviderInstallTextField = {
  readonly kind: "text";
  readonly settingsKey: ProviderInstallTextKey;
  readonly label: string;
  readonly placeholder: string;
  readonly description: ReactNode;
};
type ProviderInstallPasswordField = {
  readonly kind: "password";
  readonly settingsKey: ProviderInstallPasswordKey;
  readonly configuredKey: ProviderInstallPasswordConfiguredKey;
  readonly label: string;
  readonly placeholder: string;
  readonly description: ReactNode;
};
type ProviderInstallField = ProviderInstallTextField | ProviderInstallPasswordField;
type ProviderInstallSettings = {
  readonly provider: ProviderKind;
  readonly docs: ReadonlyArray<{ readonly label: string; readonly href: string }>;
  readonly fields: readonly ProviderInstallField[];
};

const PROVIDER_VISIBILITY_OPTIONS: ReadonlyArray<{ provider: ProviderKind; title: string }> =
  PROVIDER_DESCRIPTORS.map((descriptor) => ({
    provider: descriptor.kind,
    title: descriptor.displayName,
  }));

const PROVIDER_INSTALL_SETTINGS: readonly ProviderInstallSettings[] = [
  {
    provider: "engine",
    docs: [],
    fields: [
      {
        kind: "password",
        settingsKey: "engineApiKey",
        configuredKey: "engineApiKeyConfigured",
        label: "Builder API key",
        placeholder: "API Key",
        description: "API key the Builder engine uses for its OpenAI-compatible endpoint.",
      },
      {
        kind: "text",
        settingsKey: "engineBaseUrl",
        label: "Builder base URL",
        placeholder: "https://api.openai.com/v1",
        description: "OpenAI-compatible chat endpoint the Builder engine talks to.",
      },
      {
        kind: "text",
        settingsKey: "engineModelId",
        label: "Builder model ID",
        placeholder: "gpt-5.6-sol",
        description: "Model slug requested from the endpoint for agent turns.",
      },
      {
        kind: "text",
        settingsKey: "engineFlutterSdkBin",
        label: "Flutter SDK binary",
        placeholder: "/opt/flutter/bin/flutter",
        description:
          "Optional absolute path to the flutter binary. Overrides FLUTTER_SDK_BIN/PATH resolution.",
      },
    ],
  },
  {
    provider: "groq",
    docs: [{ label: "API Keys", href: "https://console.groq.com/keys" }],
    fields: [
      {
        kind: "password",
        settingsKey: "groqApiKey",
        configuredKey: "groqApiKeyConfigured",
        label: "Groq API key",
        placeholder: "API Key",
        description: "Your Groq API key.",
      },
      {
        kind: "text",
        settingsKey: "groqBaseUrl",
        label: "Groq base URL",
        placeholder: "https://api.groq.com/openai/v1",
        description: "Optional custom Groq endpoint override.",
      },
    ],
  },
  {
    provider: "opencodeZen",
    docs: [
      { label: "Docs", href: "https://opencode.ai/docs/zen" },
      { label: "Models", href: "https://opencode.ai/zen/v1/models" },
    ],
    fields: [
      {
        kind: "password",
        settingsKey: "opencodeZenApiKey",
        configuredKey: "opencodeZenApiKeyConfigured",
        label: "OpenCode Zen API key",
        placeholder: "API Key",
        description:
          "Your OpenCode Zen API key. The API provider is separate from the OpenCode CLI provider.",
      },
      {
        kind: "text",
        settingsKey: "opencodeZenBaseUrl",
        label: "OpenCode Zen base URL",
        placeholder: "https://opencode.ai/zen/v1",
        description: "Optional custom OpenCode Zen endpoint override.",
      },
    ],
  },
  {
    provider: "opencodeGo",
    docs: [
      { label: "Docs", href: "https://opencode.ai/docs/zen" },
      { label: "Models", href: "https://opencode.ai/zen/v1/models" },
    ],
    fields: [
      {
        kind: "password",
        settingsKey: "opencodeGoApiKey",
        configuredKey: "opencodeGoApiKeyConfigured",
        label: "OpenCode Go API key",
        placeholder: "API Key",
        description: "Your OpenCode Go API key.",
      },
      {
        kind: "text",
        settingsKey: "opencodeGoBaseUrl",
        label: "OpenCode Go base URL",
        placeholder: "https://opencode.ai/zen/v1",
        description: "Optional custom OpenCode Go endpoint override.",
      },
    ],
  },
];
function isProviderInstallFieldDirty(
  field: ProviderInstallField,
  settings: AppSettings,
  defaults: AppSettings,
): boolean {
  return field.kind === "password"
    ? settings[field.configuredKey] !== defaults[field.configuredKey]
    : settings[field.settingsKey] !== defaults[field.settingsKey];
}

function isProviderInstallConfigDirty(
  config: ProviderInstallSettings,
  settings: AppSettings,
  defaults: AppSettings,
): boolean {
  return config.fields.some((field) => isProviderInstallFieldDirty(field, settings, defaults));
}

export function isProviderInstallSettingsDirty(
  settings: AppSettings,
  defaults: AppSettings,
): boolean {
  return PROVIDER_INSTALL_SETTINGS.some((config) =>
    isProviderInstallConfigDirty(config, settings, defaults),
  );
}

function createProviderInstallDisclosureState(
  settings: AppSettings,
): Record<ProviderKind, boolean> {
  return Object.fromEntries(
    PROVIDER_INSTALL_SETTINGS.map((config) => [
      config.provider,
      config.fields.some((field) =>
        field.kind === "password"
          ? settings[field.configuredKey]
          : Boolean(settings[field.settingsKey]),
      ),
    ]),
  ) as Record<ProviderKind, boolean>;
}

function createClosedProviderInstallDisclosureState(): Record<ProviderKind, boolean> {
  return Object.fromEntries(
    PROVIDER_INSTALL_SETTINGS.map((config) => [config.provider, false]),
  ) as Record<ProviderKind, boolean>;
}

export function createProviderInstallResetPatch(defaults: AppSettings): Partial<AppSettings> {
  return Object.fromEntries(
    PROVIDER_INSTALL_SETTINGS.flatMap((config) =>
      config.fields.map((field) => [field.settingsKey, defaults[field.settingsKey]]),
    ),
  ) as Partial<AppSettings>;
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
      </div>
      <Switch
        checked={!props.isHidden}
        onCheckedChange={(checked) => props.onHiddenChange(!Boolean(checked))}
        aria-label={`Show ${props.option.title} in the provider picker`}
      />
    </div>
  );
}

function ProviderDocsLinks({ docs }: { docs: ProviderInstallSettings["docs"] }) {
  if (docs.length === 0) {
    return null;
  }
  return (
    <div className={cn(SETTINGS_OUTLINED_SURFACE_CLASS_NAME, "px-3 py-2.5")}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs font-medium text-foreground">CLI docs</span>
        <div className="flex flex-wrap gap-2">
          {docs.map((doc) => (
            <Button
              key={`${doc.label}:${doc.href}`}
              variant="outline"
              size="sm"
              render={<a href={doc.href} target="_blank" rel="noreferrer" />}
            >
              <span>{doc.label}</span>
              <ExternalLinkIcon className="size-3" />
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProviderInstallFieldControl(props: {
  field: ProviderInstallField;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
}) {
  const id = `provider-install-${props.field.settingsKey}`;

  const configured =
    props.field.kind === "password" ? props.settings[props.field.configuredKey] : false;
  const isPassword = props.field.kind === "password";
  return (
    <label htmlFor={id} className="block">
      <span className="block text-xs font-medium text-foreground">{props.field.label}</span>
      <DebouncedSettingTextInput
        id={id}
        size="sm"
        variant="soft"
        className="mt-1"
        value={isPassword ? "" : props.settings[props.field.settingsKey]}
        onCommit={(nextValue) =>
          props.updateSettings({ [props.field.settingsKey]: nextValue } as Partial<AppSettings>)
        }
        placeholder={
          isPassword && configured
            ? "Configured — enter a replacement or leave blank"
            : props.field.placeholder
        }
        type={isPassword ? "password" : undefined}
        autoComplete={isPassword ? "new-password" : undefined}
        spellCheck={false}
      />
      <span className="mt-1 block text-xs text-muted-foreground">{props.field.description}</span>
    </label>
  );
}

function ProviderToolRow(props: {
  config: ProviderInstallSettings;
  open: boolean;
  settings: AppSettings;
  defaults: AppSettings;
  onOpenChange: (open: boolean) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
}) {
  const title = PROVIDER_DISPLAY_NAMES[props.config.provider];
  const isDirty = isProviderInstallConfigDirty(props.config, props.settings, props.defaults);

  return (
    <Collapsible open={props.open} onOpenChange={props.onOpenChange}>
      <div className="border-t border-border/70 first:border-t-0">
        <div className="flex min-h-11 items-center gap-2 px-3 py-2">
          <CollapsibleTrigger
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span className="min-w-0 flex-1 text-sm font-medium text-foreground">{title}</span>
            {isDirty ? (
              <span className="shrink-0 text-[11px] text-muted-foreground">Custom</span>
            ) : null}
            <DisclosureChevron
              open={props.open}
              className="size-4 shrink-0 text-muted-foreground"
            />
          </CollapsibleTrigger>
        </div>

        <CollapsiblePanel>
          <div className="border-t border-border/70 bg-muted/20 px-3 py-3">
            <div className="space-y-3">
              <ProviderDocsLinks docs={props.config.docs} />
              {props.config.fields.map((field) => (
                <ProviderInstallFieldControl
                  key={field.settingsKey}
                  field={field}
                  settings={props.settings}
                  updateSettings={props.updateSettings}
                />
              ))}
            </div>
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
  resetEpoch,
}: ProvidersSettingsPanelProps) {
  const [openInstallProviders, setOpenInstallProviders] = useState<Record<ProviderKind, boolean>>(
    () => createProviderInstallDisclosureState(settings),
  );
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
  const installSettingsDirty = isProviderInstallSettingsDirty(settings, defaults);

  useSettingsRestoreSignal(resetEpoch, () => {
    setOpenInstallProviders(createClosedProviderInstallDisclosureState());
  });

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
  if (!active) return null;

  return (
    <div className="space-y-6">
      <SettingsSection title="Provider picker">
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

      <div>
        <SettingsSection title="Provider tools">
          <SettingsRow
            title="API providers"
            description="Configure API keys and base URLs for each provider. Open a row to edit its credentials."
            resetAction={
              installSettingsDirty ? (
                <SettingResetButton
                  label="provider tools"
                  onClick={() => {
                    updateSettings(createProviderInstallResetPatch(defaults));
                    setOpenInstallProviders(createClosedProviderInstallDisclosureState());
                  }}
                />
              ) : null
            }
          >
            <div className="mt-4">
              <div className={SETTINGS_INSET_LIST_CLASS_NAME}>
                {PROVIDER_INSTALL_SETTINGS.map((config) => (
                  <ProviderToolRow
                    key={config.provider}
                    config={config}
                    open={openInstallProviders[config.provider]}
                    settings={settings}
                    defaults={defaults}
                    onOpenChange={(open) =>
                      setOpenInstallProviders((existing) => ({
                        ...existing,
                        [config.provider]: open,
                      }))
                    }
                    updateSettings={updateSettings}
                  />
                ))}
              </div>
            </div>
          </SettingsRow>
        </SettingsSection>
      </div>
    </div>
  );
}
