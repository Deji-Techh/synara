// FILE: appSettings.test.ts
// Purpose: Verifies app settings normalization, model options, and provider dispatch options.
// Layer: Web settings tests
// Exports: Vitest suites for appSettings.ts

import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
  AppSettingsSchema,
  CUSTOM_MODEL_EDITOR_PROVIDER_SETTINGS,
  DEFAULT_CHAT_FONT_SIZE_PX,
  DEFAULT_FOLLOW_UP_BEHAVIOR,
  DEFAULT_SIDEBAR_PROJECT_SORT_ORDER,
  DEFAULT_TERMINAL_FONT_SIZE_PX,
  DEFAULT_SIDEBAR_THREAD_SORT_ORDER,
  DEFAULT_TIMESTAMP_FORMAT,
  getAppModelOptions,
  getDefaultNativeFontSmoothing,
  getCustomModelOptionsByProvider,
  getCustomModelsByProvider,
  getCustomModelsForProvider,
  getDefaultCustomModelsForProvider,
  getGitTextGenerationModelOptions,
  isGitTextGenerationSettingsDirty,
  MODEL_PROVIDER_SETTINGS,
  normalizeChatFontSizePx,
  normalizeCustomModelSlugs,
  normalizeStoredAppSettings,
  normalizeTerminalFontFamily,
  normalizeTerminalFontSizePx,
  patchCustomModels,
  resolveAppModelSelection,
  resolveFollowUpDispatchMode,
  resolveTerminalFontFamilyStack,
} from "./appSettings";

describe("normalizeCustomModelSlugs", () => {
  it("normalizes aliases, removes built-ins, and deduplicates values", () => {
    expect(
      normalizeCustomModelSlugs([
        " custom/internal-model ",
        "llama-3.3-70b-versatile",
        "custom/internal-model",
        "",
        null,
      ]),
    ).toEqual(["custom/internal-model"]);
  });

  it("keeps provider-scoped custom slugs", () => {
    expect(normalizeCustomModelSlugs(["claude/custom-sonnet"], "opencodeZen")).toEqual([
      "claude/custom-sonnet",
    ]);
  });
});

describe("resolveFollowUpDispatchMode", () => {
  it("uses the selected behavior only while a turn is live", () => {
    expect(
      resolveFollowUpDispatchMode({
        behavior: "steer",
        hasLiveTurn: false,
      }),
    ).toBe("queue");
    expect(
      resolveFollowUpDispatchMode({
        behavior: "steer",
        hasLiveTurn: true,
      }),
    ).toBe("steer");
  });

  it("uses Ctrl/Cmd+Enter as a one-message inversion", () => {
    expect(
      resolveFollowUpDispatchMode({
        behavior: "queue",
        hasLiveTurn: true,
        useOppositeBehavior: true,
      }),
    ).toBe("steer");
    expect(
      resolveFollowUpDispatchMode({
        behavior: "steer",
        hasLiveTurn: true,
        useOppositeBehavior: true,
      }),
    ).toBe("queue");
  });
});

describe("getAppModelOptions", () => {
  it("appends saved custom models after the built-in options", () => {
    const options = getAppModelOptions("groq", ["custom/internal-model"]);

    expect(options.at(-1)).toMatchObject({
      slug: "custom/internal-model",
      provider: "groq",
      isCustom: true,
    });
    expect(options.some((option) => option.isCustom === false)).toBe(true);
  });

  it("keeps the currently selected custom model available even if it is no longer saved", () => {
    const options = getAppModelOptions("groq", [], "custom/selected-model");

    expect(options.at(-1)).toEqual({
      slug: "custom/selected-model",
      name: "custom/selected-model",
      provider: "groq",
      isCustom: true,
    });
  });

  it("keeps a saved custom provider model available as an exact slug option", () => {
    const options = getAppModelOptions("opencodeZen", ["custom/opus"], "custom/opus");

    expect(options.some((option) => option.slug === "custom/opus" && option.isCustom)).toBe(true);
  });
});

describe("getGitTextGenerationModelOptions", () => {
  it("merges saved groq models with the built-in catalog for git writing settings", () => {
    const options = getGitTextGenerationModelOptions({
      customGroqModels: ["custom/groq-model"],
      textGenerationModel: undefined,
      textGenerationProvider: "groq",
    });

    expect(options.some((option) => option.slug === "custom/groq-model")).toBe(true);
    expect(options.some((option) => option.isCustom === false)).toBe(true);
  });

  it("prefers runtime-discovered groq models for git writing settings", () => {
    const options = getGitTextGenerationModelOptions(
      {
        customGroqModels: [],
        textGenerationModel: "custom/model",
        textGenerationProvider: "groq",
      },
      {
        groq: [{ slug: "discovered/model", name: "Discovered Model" }],
      },
    );

    expect(options.some((option) => option.slug === "discovered/model")).toBe(true);
    expect(options.some((option) => option.slug === "custom/model")).toBe(true);
  });
});

describe("isGitTextGenerationSettingsDirty", () => {
  it("compares the normalized provider and model defaults", () => {
    const defaults = AppSettingsSchema.makeUnsafe({});

    expect(isGitTextGenerationSettingsDirty(defaults, defaults)).toBe(false);
    expect(
      isGitTextGenerationSettingsDirty(
        { ...defaults, textGenerationProvider: "engine", textGenerationModel: "custom/model" },
        defaults,
      ),
    ).toBe(true);
  });
});

describe("environment panel defaults", () => {
  it("starts optional text sections disabled without overriding explicit preferences", () => {
    const defaults = AppSettingsSchema.makeUnsafe({});
    expect(defaults).toMatchObject({
      showEnvironmentMarkers: false,
      showEnvironmentInstructions: false,
      showEnvironmentNotepad: false,
    });

    const enabled = AppSettingsSchema.makeUnsafe({
      showEnvironmentMarkers: true,
      showEnvironmentInstructions: true,
      showEnvironmentNotepad: true,
    });
    expect(enabled).toMatchObject({
      showEnvironmentMarkers: true,
      showEnvironmentInstructions: true,
      showEnvironmentNotepad: true,
    });
  });
});

describe("resolveAppModelSelection", () => {
  const emptyCustomModels = getCustomModelsByProvider({
    customEngineModels: [],
    customGroqModels: [],
    customOpenCodeZenModels: [],
    customOpenCodeGoModels: [],
  });

  it("preserves saved custom model slugs instead of falling back to the default", () => {
    expect(
      resolveAppModelSelection(
        "groq",
        { ...emptyCustomModels, groq: ["galapagos-alpha"] },
        "galapagos-alpha",
      ),
    ).toBe("galapagos-alpha");
  });

  it("falls back to the provider default when no model is selected", () => {
    const fallback = resolveAppModelSelection("groq", emptyCustomModels, "");
    expect(fallback).toBe(getAppModelOptions("groq", [])[0]?.slug ?? "");
  });

  it("resolves transient selected custom models included in app model options", () => {
    expect(resolveAppModelSelection("groq", emptyCustomModels, "custom/selected-model")).toBe(
      "custom/selected-model",
    );
  });
});

describe("timestamp format defaults", () => {
  it("defaults timestamp format to locale", () => {
    expect(DEFAULT_TIMESTAMP_FORMAT).toBe("locale");
  });
});

describe("chat font size defaults", () => {
  it("defaults chat font size to 12px", () => {
    expect(DEFAULT_CHAT_FONT_SIZE_PX).toBe(12);
  });

  it("clamps chat font size updates into the supported range", () => {
    expect(normalizeChatFontSizePx(9)).toBe(11);
    expect(normalizeChatFontSizePx(18.4)).toBe(18);
    expect(normalizeChatFontSizePx(Number.NaN)).toBe(DEFAULT_CHAT_FONT_SIZE_PX);
  });
});

describe("terminal font size defaults", () => {
  it("defaults terminal font size to 12px", () => {
    expect(DEFAULT_TERMINAL_FONT_SIZE_PX).toBe(12);
  });

  it("clamps terminal font size updates into the supported range", () => {
    expect(normalizeTerminalFontSizePx(8)).toBe(10);
    expect(normalizeTerminalFontSizePx(20.4)).toBe(20);
    expect(normalizeTerminalFontSizePx(99)).toBe(22);
    expect(normalizeTerminalFontSizePx(Number.NaN)).toBe(DEFAULT_TERMINAL_FONT_SIZE_PX);
  });
});

describe("terminal font family settings", () => {
  it("leaves the bundled terminal font stack active for empty values", () => {
    expect(resolveTerminalFontFamilyStack("")).toBeNull();
    expect(resolveTerminalFontFamilyStack("   ")).toBeNull();
  });

  it("quotes a single multi-word font and appends a monospace fallback", () => {
    expect(resolveTerminalFontFamilyStack("Fira Code")).toBe('"Fira Code", monospace');
    expect(resolveTerminalFontFamilyStack("Menlo")).toBe("Menlo, monospace");
  });

  it("preserves explicit font stacks while adding a generic fallback when missing", () => {
    expect(resolveTerminalFontFamilyStack('"Fira Code", Menlo')).toBe(
      '"Fira Code", Menlo, monospace',
    );
    expect(resolveTerminalFontFamilyStack('"Fira Code", ui-monospace')).toBe(
      '"Fira Code", ui-monospace',
    );
  });

  it("strips characters that could break the terminal font CSS variable", () => {
    expect(normalizeTerminalFontFamily("Fira; Code{}\n<>")).toBe("Fira Code");
  });
});

describe("sidebar sort defaults", () => {
  it("defaults project sorting to manual", () => {
    expect(DEFAULT_SIDEBAR_PROJECT_SORT_ORDER).toBe("manual");
  });

  it("defaults thread sorting to updated_at", () => {
    expect(DEFAULT_SIDEBAR_THREAD_SORT_ORDER).toBe("updated_at");
  });
});

describe("normalizeStoredAppSettings", () => {
  it("defaults native font smoothing by platform", () => {
    expect(getDefaultNativeFontSmoothing("MacIntel")).toBe(true);
    expect(getDefaultNativeFontSmoothing("Win32")).toBe(false);
    expect(getDefaultNativeFontSmoothing("Linux x86_64")).toBe(false);
  });

  it("uses the current platform default for existing settings without a stored value", () => {
    const decodedSettings = Schema.decodeSync(Schema.fromJsonString(AppSettingsSchema))("{}");

    expect(decodedSettings.enableNativeFontSmoothing).toBe(getDefaultNativeFontSmoothing());
  });

  it("preserves an explicitly stored updated_at project sort order", () => {
    const decodedSettings = Schema.decodeSync(Schema.fromJsonString(AppSettingsSchema))(
      JSON.stringify({
        sidebarProjectSortOrder: "updated_at",
        chatFontSizePx: 99,
        terminalFontSizePx: 3,
        customGroqModels: [" custom/internal-model ", "llama-3.3-70b-versatile"],
      }),
    );

    expect(normalizeStoredAppSettings(decodedSettings)).toMatchObject({
      sidebarProjectSortOrder: "updated_at",
      chatFontSizePx: 18,
      terminalFontSizePx: 10,
      customGroqModels: ["custom/internal-model"],
    });
  });
});

describe("provider-indexed custom model settings", () => {
  const settings = {
    customEngineModels: ["custom/engine-model"],
    customGroqModels: ["custom/groq-model"],
    customOpenCodeZenModels: ["custom/zen-model"],
    customOpenCodeGoModels: ["custom/go-model"],
  } as const;

  it("exports one provider config per surviving provider", () => {
    expect(MODEL_PROVIDER_SETTINGS.map((config) => config.provider)).toEqual([
      "engine",
      "groq",
      "opencodeZen",
      "opencodeGo",
    ]);
  });

  it("keeps the groq catalog authoritative without advertising custom slugs in editors", () => {
    expect(CUSTOM_MODEL_EDITOR_PROVIDER_SETTINGS.map((config) => config.provider)).not.toContain(
      "groq",
    );
  });

  it("reads custom models for each provider", () => {
    expect(getCustomModelsForProvider(settings, "engine")).toEqual(["custom/engine-model"]);
    expect(getCustomModelsForProvider(settings, "groq")).toEqual(["custom/groq-model"]);
    expect(getCustomModelsForProvider(settings, "opencodeZen")).toEqual(["custom/zen-model"]);
    expect(getCustomModelsForProvider(settings, "opencodeGo")).toEqual(["custom/go-model"]);
  });

  it("reads default custom models for each provider", () => {
    const defaults = {
      customEngineModels: ["default/engine-model"],
      customGroqModels: ["default/groq-model"],
      customOpenCodeZenModels: [],
      customOpenCodeGoModels: [],
    } as const;

    expect(getDefaultCustomModelsForProvider(defaults, "engine")).toEqual(["default/engine-model"]);
    expect(getDefaultCustomModelsForProvider(defaults, "groq")).toEqual(["default/groq-model"]);
    expect(getDefaultCustomModelsForProvider(defaults, "opencodeZen")).toEqual([]);
  });

  it("patches custom models per provider", () => {
    expect(patchCustomModels("engine", ["custom/engine-model"])).toEqual({
      customEngineModels: ["custom/engine-model"],
    });
    expect(patchCustomModels("groq", ["custom/groq-model"])).toEqual({
      customGroqModels: ["custom/groq-model"],
    });
    expect(patchCustomModels("opencodeZen", ["custom/zen-model"])).toEqual({
      customOpenCodeZenModels: ["custom/zen-model"],
    });
    expect(patchCustomModels("opencodeGo", ["custom/go-model"])).toEqual({
      customOpenCodeGoModels: ["custom/go-model"],
    });
  });

  it("builds a complete provider-indexed custom model record", () => {
    expect(getCustomModelsByProvider(settings)).toEqual({
      engine: ["custom/engine-model"],
      groq: ["custom/groq-model"],
      opencodeZen: ["custom/zen-model"],
      opencodeGo: ["custom/go-model"],
    });
  });

  it("normalizes and deduplicates custom model options per provider", () => {
    const modelOptionsByProvider = getCustomModelOptionsByProvider({
      customEngineModels: [" custom/engine-model ", "custom/engine-model"],
      customGroqModels: [" custom/groq-model ", "llama-3.3-70b-versatile", "custom/groq-model"],
      customOpenCodeZenModels: [" custom/zen-model ", "custom/zen-model"],
      customOpenCodeGoModels: [],
    });

    expect(
      modelOptionsByProvider.engine.filter((option) => option.slug === "custom/engine-model"),
    ).toHaveLength(1);
    expect(
      modelOptionsByProvider.groq.filter((option) => option.slug === "custom/groq-model"),
    ).toHaveLength(1);
    // Built-in slugs are never duplicated as custom options.
    expect(
      modelOptionsByProvider.groq.filter((option) => option.slug === "llama-3.3-70b-versatile"),
    ).toHaveLength(1);
    expect(
      modelOptionsByProvider.opencodeZen.filter((option) => option.slug === "custom/zen-model"),
    ).toHaveLength(1);
  });
});

describe("AppSettingsSchema", () => {
  it("folds unknown legacy provider kinds onto the default provider", () => {
    const decode = Schema.decodeSync(Schema.fromJsonString(AppSettingsSchema));
    const decoded = decode(
      JSON.stringify({
        textGenerationProvider: "google",
        defaultProvider: "google",
        hiddenProviders: ["google"],
        providerOrder: ["openai", "google"],
        geminiBinaryPath: "/custom/bin/gemini",
        customGeminiModels: ["gemini-custom-preview"],
      }),
    );

    expect(decoded.defaultProvider).toBe("groq");
    expect(decoded.hiddenProviders).toEqual(["groq"]);
    expect(normalizeStoredAppSettings(decoded)).not.toHaveProperty("geminiBinaryPath");
    expect(normalizeStoredAppSettings(decoded)).not.toHaveProperty("customGeminiModels");
  });

  it("defaults the Environment panel closed and preserves an explicit open preference", () => {
    const decode = Schema.decodeSync(Schema.fromJsonString(AppSettingsSchema));

    expect(decode("{}").environmentPanelDefaultOpen).toBe(false);
    expect(
      decode(JSON.stringify({ environmentPanelDefaultOpen: true })).environmentPanelDefaultOpen,
    ).toBe(true);
  });

  it("fills decoding defaults for persisted settings that predate newer keys", () => {
    const decode = Schema.decodeSync(Schema.fromJsonString(AppSettingsSchema));

    expect(
      decode(
        JSON.stringify({
          confirmThreadDelete: false,
        }),
      ),
    ).toMatchObject({
      uiDensity: "comfortable",
      chatFontSizePx: DEFAULT_CHAT_FONT_SIZE_PX,
      engineApiKeyConfigured: false,
      defaultThreadEnvMode: "local",
      confirmThreadDelete: false,
      confirmTerminalTabClose: true,
      desktopAppIcon: "default",
      enableAssistantStreaming: true,
      followUpBehavior: DEFAULT_FOLLOW_UP_BEHAVIOR,
      sidebarProjectSortOrder: DEFAULT_SIDEBAR_PROJECT_SORT_ORDER,
      sidebarThreadSortOrder: DEFAULT_SIDEBAR_THREAD_SORT_ORDER,
      timestampFormat: DEFAULT_TIMESTAMP_FORMAT,
      customEngineModels: [],
      customGroqModels: [],
      customOpenCodeZenModels: [],
      customOpenCodeGoModels: [],
    });
  });

  it("preserves the selected desktop app icon", () => {
    const decode = Schema.decodeSync(Schema.fromJsonString(AppSettingsSchema));

    expect(decode(JSON.stringify({ desktopAppIcon: "icon" })).desktopAppIcon).toBe("icon");
  });
});
