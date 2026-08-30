import type { SettingsSectionId } from "./settingsNavigation";

export interface SettingsSearchEntry {
  id: string;
  section: SettingsSectionId;
  title: string;
  description: string;
}

export const SETTINGS_SEARCH_ENTRIES: readonly SettingsSearchEntry[] = [
  { id: "planner-model", section: "models", title: "Planning Model", description: "Select model for app planner" },
  { id: "builder-model", section: "models", title: "Building Model", description: "Select model for code builder" },
  { id: "verifier-model", section: "models", title: "Verification Model", description: "Select model for verifier" },
  { id: "taste-model", section: "models", title: "Taste Model", description: "Select model for taste and anti-slop pass" },
  { id: "provider-url", section: "providers", title: "API Base URL", description: "Set provider base URL" },
  { id: "provider-key", section: "providers", title: "API Key", description: "Configure API authentication key" },
  { id: "theme", section: "appearance", title: "Theme", description: "Choose light, dark, or system theme" },
  { id: "profile-name", section: "profile", title: "Profile", description: "Edit user profile and avatar" },
];

export function settingsSectionLabel(section: SettingsSectionId): string {
  switch (section) {
    case "models":
      return "Models";
    case "providers":
      return "Providers";
    case "appearance":
      return "Appearance";
    case "profile":
      return "Profile";
    case "general":
    default:
      return "General";
  }
}

export function settingsSearchEntryTarget(entry: SettingsSearchEntry): string {
  return `setting-${entry.id}`;
}

export function rankSettingsSearchEntries(query: string, limit = 10): SettingsSearchEntry[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  return SETTINGS_SEARCH_ENTRIES.filter(
    (e) =>
      e.title.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.section.toLowerCase().includes(q),
  ).slice(0, limit);
}
