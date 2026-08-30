import { describe, expect, it } from "vitest";

import { type AppSettings, AppSettingsSchema } from "~/appSettings";

import {
  createProviderInstallResetPatch,
  isProviderInstallSettingsDirty,
} from "./ProvidersSettingsPanel";

const defaults = AppSettingsSchema.makeUnsafe({});

describe("isProviderInstallSettingsDirty", () => {
  it("covers every provider install text and boolean field", () => {
    const dirtyPatches = [
      { engineBaseUrl: "https://engine.example" },
      { engineModelId: "gpt-5.6-sol" },
      { engineFlutterSdkBin: "/opt/flutter/bin/flutter" },
      { groqBaseUrl: "https://groq.example" },
      { opencodeZenBaseUrl: "https://zen.example" },
      { opencodeGoBaseUrl: "https://go.example" },
    ] satisfies ReadonlyArray<Partial<AppSettings>>;

    expect(isProviderInstallSettingsDirty(defaults, defaults)).toBe(false);
    for (const patch of dirtyPatches) {
      expect(isProviderInstallSettingsDirty({ ...defaults, ...patch }, defaults)).toBe(true);
    }
  });

  it("uses configured flags instead of unreadable password values", () => {
    expect(isProviderInstallSettingsDirty({ ...defaults, engineApiKey: "secret" }, defaults)).toBe(
      false,
    );
    expect(
      isProviderInstallSettingsDirty({ ...defaults, engineApiKeyConfigured: true }, defaults),
    ).toBe(true);
    expect(
      isProviderInstallSettingsDirty({ ...defaults, groqApiKeyConfigured: true }, defaults),
    ).toBe(true);
    expect(
      isProviderInstallSettingsDirty({ ...defaults, opencodeZenApiKeyConfigured: true }, defaults),
    ).toBe(true);
    expect(
      isProviderInstallSettingsDirty({ ...defaults, opencodeGoApiKeyConfigured: true }, defaults),
    ).toBe(true);
  });
});

describe("createProviderInstallResetPatch", () => {
  it("resets every configured field and writes password values so configured flags clear", () => {
    const patch = createProviderInstallResetPatch({
      ...defaults,
      engineApiKey: "",
      groqApiKey: "",
    });

    expect(Object.keys(patch).sort()).toEqual(
      [
        "engineApiKey",
        "engineBaseUrl",
        "engineFlutterSdkBin",
        "engineModelId",
        "groqApiKey",
        "groqBaseUrl",
        "opencodeZenApiKey",
        "opencodeZenBaseUrl",
        "opencodeGoApiKey",
        "opencodeGoBaseUrl",
      ].sort(),
    );
    expect(patch.engineApiKey).toBe("");
    expect(patch.groqApiKey).toBe("");
    expect(patch.engineBaseUrl).toBe("");
  });
});
