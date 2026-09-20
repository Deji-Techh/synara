import { describe, expect, it } from "vitest";
import {
  normalizeSettingsSection,
  settingRowAnchorId,
  SETTINGS_NAV_ITEMS,
  SETTINGS_SECTION_IDS,
} from "./settingsNavigation";

describe("settingsNavigation", () => {
  it("normalizes unknown or non-string inputs to profile", () => {
    expect(normalizeSettingsSection(undefined)).toBe("profile");
    expect(normalizeSettingsSection(null)).toBe("profile");
    expect(normalizeSettingsSection("")).toBe("profile");
    expect(normalizeSettingsSection("invalid-section-id")).toBe("profile");
  });

  it("normalizes general to general", () => {
    expect(normalizeSettingsSection("general")).toBe("general");
  });

  it("normalizes all valid SETTINGS_SECTION_IDS to themselves", () => {
    for (const section of SETTINGS_SECTION_IDS) {
      expect(normalizeSettingsSection(section)).toBe(section);
    }
  });

  it("ensures every nav item has a valid section id in SETTINGS_SECTION_IDS", () => {
    for (const item of SETTINGS_NAV_ITEMS) {
      expect(SETTINGS_SECTION_IDS).toContain(item.id);
    }
  });

  it("generates correct anchor slugs", () => {
    expect(settingRowAnchorId("Workspace defaults")).toBe("setting-workspace-defaults");
    expect(settingRowAnchorId("API Keys & Endpoints")).toBe("setting-api-keys-endpoints");
  });
});
