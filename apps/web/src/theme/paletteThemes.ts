import { UI_THEMES, type UiThemeId } from "../lib/uiThemes";
import type { ChromeTheme, ThemeSemanticColors, ThemeVariant } from "./theme.logic";

/**
 * Preset palette accents: fixed semantic colors that let each palette keep its
 * native diff/skill heritage instead of inheriting whatever code theme is active.
 */
const DEFAULT_SEMANTIC_COLORS: Record<ThemeVariant, ThemeSemanticColors> = {
  dark: {
    diffAdded: "#40c977",
    diffRemoved: "#fa423e",
    skill: "#ad7bf9",
  },
  light: {
    diffAdded: "#1f9f5c",
    diffRemoved: "#e5484d",
    skill: "#924ff7",
  },
};

export const PALETTE_THEME_IDS = UI_THEMES.map((t) => t.id);

export type PaletteThemeId = UiThemeId;

export interface PaletteThemeDescriptor {
  readonly id: PaletteThemeId;
  readonly name: string;
  readonly description: string;
  /** [surface, elevated surface, accent] preview swatches. */
  readonly swatches: readonly [string, string, string];
  readonly dark: boolean | "system";
  readonly chromeThemes: Record<ThemeVariant, ChromeTheme>;
}

export interface PaletteThemeSeed extends Pick<ChromeTheme, "accent" | "ink" | "surface"> {}

/** Dark + light chrome seeds for every palette. */
const PALETTE_SEEDS: Record<
  PaletteThemeId,
  {
    darkSeed: PaletteThemeSeed;
    lightSeed: PaletteThemeSeed;
  }
> = {
  system: {
    darkSeed: { accent: "#339cff", ink: "#ffffff", surface: "#181818" },
    lightSeed: { accent: "#356df3", ink: "#1a1c1f", surface: "#fcfcfc" },
  },
  codex: {
    darkSeed: { accent: "#7a7f8a", ink: "#e7e7e7", surface: "#181818" },
    lightSeed: { accent: "#6b7280", ink: "#1f1f1f", surface: "#f7f7f8" },
  },
  graphite: {
    darkSeed: { accent: "#4f8ef7", ink: "#e6e6e6", surface: "#1c1c1c" },
    lightSeed: { accent: "#4f8ef7", ink: "#232323", surface: "#f4f6fa" },
  },
  carbon: {
    darkSeed: { accent: "#7c8cff", ink: "#dcDde4", surface: "#121212" },
    lightSeed: { accent: "#5c6cf0", ink: "#23262e", surface: "#f4f4f8" },
  },
  slate: {
    darkSeed: { accent: "#5b9cf6", ink: "#dfe5ee", surface: "#20242b" },
    lightSeed: { accent: "#3d7fe0", ink: "#2b323c", surface: "#f2f5f9" },
  },
  "oled-black": {
    darkSeed: { accent: "#5b8cff", ink: "#e8ecf4", surface: "#000000" },
    lightSeed: { accent: "#4370e8", ink: "#101218", surface: "#fafbfd" },
  },
  midnight: {
    darkSeed: { accent: "#58a6ff", ink: "#d7e0f2", surface: "#0b1020" },
    lightSeed: { accent: "#2f7fe0", ink: "#1c2436", surface: "#eef2fb" },
  },
  forest: {
    darkSeed: { accent: "#55c88a", ink: "#d7e4db", surface: "#101713" },
    lightSeed: { accent: "#1f9a63", ink: "#1c2620", surface: "#eef4f0" },
  },
  aubergine: {
    darkSeed: { accent: "#b084f5", ink: "#e7dff0", surface: "#171119" },
    lightSeed: { accent: "#9459d9", ink: "#2a2030", surface: "#f5f1f9" },
  },
  light: {
    darkSeed: { accent: "#4f8ef7", ink: "#eef1f6", surface: "#eef0f4" },
    lightSeed: { accent: "#356df3", ink: "#1a1c1f", surface: "#ffffff" },
  },
};

function buildChromeTheme(seed: PaletteThemeSeed, variant: ThemeVariant): ChromeTheme {
  return {
    accent: seed.accent,
    contrast: 0,
    fonts: { code: null, ui: null },
    ink: seed.ink,
    opaqueWindows: false,
    semanticColors: DEFAULT_SEMANTIC_COLORS[variant],
    surface: seed.surface,
  };
}

export const PALETTE_THEMES: readonly PaletteThemeDescriptor[] = UI_THEMES.map((uiTheme) => {
  const entry = PALETTE_SEEDS[uiTheme.id];
  return {
    id: uiTheme.id,
    name: uiTheme.name,
    description: uiTheme.description,
    swatches: uiTheme.swatches,
    dark: uiTheme.dark,
    chromeThemes: {
      dark: buildChromeTheme(entry.darkSeed, "dark"),
      light: buildChromeTheme(entry.lightSeed, "light"),
    },
  };
});

export function isPaletteThemeId(value: string | null | undefined): value is PaletteThemeId {
  return PALETTE_THEME_IDS.includes(value as PaletteThemeId);
}

export function findPaletteTheme(id: PaletteThemeId | null | undefined): PaletteThemeDescriptor {
  return PALETTE_THEMES.find((theme) => theme.id === id) ?? PALETTE_THEMES[0]!;
}
