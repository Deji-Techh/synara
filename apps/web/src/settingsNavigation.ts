export type SettingsSectionId =
  | "general"
  | "models"
  | "providers"
  | "appearance"
  | "profile";

export interface SettingsNavItem {
  id: SettingsSectionId;
  label: string;
  icon: string;
  group: "workspace" | "account";
}

export interface SettingsNavGroup {
  id: "workspace" | "account";
  label: string;
}

export const SETTINGS_NAV_GROUPS: readonly SettingsNavGroup[] = [
  { id: "workspace", label: "Harness & Workspace" },
  { id: "account", label: "Account" },
];

export const SETTINGS_NAV_ITEMS: readonly SettingsNavItem[] = [
  { id: "general", label: "General", icon: "settings-gear-4", group: "workspace" },
  { id: "models", label: "Models", icon: "cpu-chip", group: "workspace" },
  { id: "providers", label: "Providers", icon: "cloud", group: "workspace" },
  { id: "appearance", label: "Appearance", icon: "palette", group: "workspace" },
  { id: "profile", label: "Profile", icon: "user", group: "account" },
];

export function normalizeSettingsSection(value: unknown): SettingsSectionId {
  if (
    value === "general" ||
    value === "models" ||
    value === "providers" ||
    value === "appearance" ||
    value === "profile"
  ) {
    return value;
  }
  return "general";
}

export function settingRowAnchorId(title: string): string {
  return `setting-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

export const SETTINGS_TARGETS = {
  models: "setting-models",
  providers: "setting-providers",
  appearance: "setting-appearance",
  environmentPanel: "setting-environment-panel",
} as const;
