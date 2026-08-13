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

export const PALETTE_THEME_IDS = [
  "default",
  "codex",
  "graphite",
  "carbon",
  "slate",
  "oled-black",
  "midnight",
  "forest",
  "aubergine",
  "light",
] as const;

export type PaletteThemeId = (typeof PALETTE_THEME_IDS)[number];

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
    swatches: readonly [string, string, string];
    dark: boolean | "system";
    darkSeed: PaletteThemeSeed;
    lightSeed: PaletteThemeSeed;
  }
> = {
  default: {
    swatches: ["#181818", "#242424", "#339cff"],
    dark: "system",
    darkSeed: { accent: "#339cff", ink: "#ffffff", surface: "#181818" },
    lightSeed: { accent: "#356df3", ink: "#1a1c1f", surface: "#fcfcfc" },
  },
  codex: {
    swatches: ["#181818", "#242424", "#cfcfcf"],
    dark: true,
    darkSeed: { accent: "#7a7f8a", ink: "#e7e7e7", surface: "#181818" },
    lightSeed: { accent: "#6b7280", ink: "#1f1f1f", surface: "#f7f7f8" },
  },
  graphite: {
    swatches: ["#1C1C1C", "#242424", "#4F8EF7"],
    dark: true,
    darkSeed: { accent: "#4f8ef7", ink: "#e6e6e6", surface: "#1c1c1c" },
    lightSeed: { accent: "#4f8ef7", ink: "#232323", surface: "#f4f6fa" },
  },
  carbon: {
    swatches: ["#121212", "#1B1B1B", "#7C8CFF"],
    dark: true,
    darkSeed: { accent: "#7c8cff", ink: "#dcDde4", surface: "#121212" },
    lightSeed: { accent: "#5c6cf0", ink: "#23262e", surface: "#f4f4f8" },
  },
  slate: {
    swatches: ["#20242B", "#2A3039", "#5B9CF6"],
    dark: true,
    darkSeed: { accent: "#5b9cf6", ink: "#dfe5ee", surface: "#20242b" },
    lightSeed: { accent: "#3d7fe0", ink: "#2b323c", surface: "#f2f5f9" },
  },
  "oled-black": {
    swatches: ["#000000", "#0A0A0A", "#5B8CFF"],
    dark: true,
    darkSeed: { accent: "#5b8cff", ink: "#e8ecf4", surface: "#000000" },
    lightSeed: { accent: "#4370e8", ink: "#101218", surface: "#fafbfd" },
  },
  midnight: {
    swatches: ["#0B1020", "#141B2D", "#58A6FF"],
    dark: true,
    darkSeed: { accent: "#58a6ff", ink: "#d7e0f2", surface: "#0b1020" },
    lightSeed: { accent: "#2f7fe0", ink: "#1c2436", surface: "#eef2fb" },
  },
  forest: {
    swatches: ["#101713", "#1A251E", "#55C88A"],
    dark: true,
    darkSeed: { accent: "#55c88a", ink: "#d7e4db", surface: "#101713" },
    lightSeed: { accent: "#1f9a63", ink: "#1c2620", surface: "#eef4f0" },
  },
  aubergine: {
    swatches: ["#171119", "#241A28", "#B084F5"],
    dark: true,
    darkSeed: { accent: "#b084f5", ink: "#e7dff0", surface: "#171119" },
    lightSeed: { accent: "#9459d9", ink: "#2a2030", surface: "#f5f1f9" },
  },
  light: {
    swatches: ["#F7F7F8", "#FFFFFF", "#356DF3"],
    dark: false,
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

export const PALETTE_THEMES: readonly PaletteThemeDescriptor[] = PALETTE_THEME_IDS.map((id) => {
  const entry = PALETTE_SEEDS[id];
  return {
    id,
    name: id === "default" ? "Caide default" : titleForPalette(id),
    description: descriptionForPalette(id),
    swatches: entry.swatches,
    dark: entry.dark,
    chromeThemes: {
      dark: buildChromeTheme(entry.darkSeed, "dark"),
      light: buildChromeTheme(entry.lightSeed, "light"),
    },
  };
});

function titleForPalette(id: PaletteThemeId): string {
  switch (id) {
    case "oled-black":
      return "OLED Black";
    case "default":
      return "Caide default";
    default:
      return id.charAt(0).toUpperCase() + id.slice(1);
  }
}

function descriptionForPalette(id: PaletteThemeId): string {
  switch (id) {
    case "default":
      return "The stock Caide chrome where nothing has been customized yet.";
    case "codex":
      return "Quiet near-black surfaces and neutral steel-gray accents.";
    case "graphite":
      return "Balanced neutral dark surfaces with a crisp blue accent.";
    case "carbon":
      return "Deeper neutral blacks with a violet-blue accent.";
    case "slate":
      return "Professional blue-gray workspace for long sessions.";
    case "oled-black":
      return "True black, high contrast, and minimal glow.";
    case "midnight":
      return "Ink-blue surfaces with a clear cyan-blue accent.";
    case "forest":
      return "Low-saturation green-black surfaces for calm focus.";
    case "aubergine":
      return "Muted plum surfaces with a soft violet accent.";
    case "light":
      return "Clean professional light surfaces and restrained contrast.";
  }
}

export function isPaletteThemeId(value: string | null | undefined): value is PaletteThemeId {
  return PALETTE_THEME_IDS.includes(value as PaletteThemeId);
}

export function findPaletteTheme(id: PaletteThemeId | null | undefined): PaletteThemeDescriptor {
  return PALETTE_THEMES.find((theme) => theme.id === id) ?? PALETTE_THEMES[0]!;
}
