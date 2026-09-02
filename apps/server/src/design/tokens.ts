/**
 * Design tokens — compiled from `~/Downloads/design.md`.
 * Verifier does exact token compare, not vibes.
 */
export const colorTokens = {
  background: "#0D0D0D",
  backgroundAlt: "#121212",
  textPrimary: "#FFFFFF",
  textMuted: "#9CA3AF",
  textFaint: "#6B7280",
  accent: "#E8493C",
  surface: "#1A1A1A",
  surfaceRaised: "#262626",
  border: "#2A2A2A",
  success: "#22C55E",
  warning: "#F59E0B",
  error: "#EF4444",
} as const;

export const typeScale = {
  headline: "24/bold",
  title: "20/bold",
  subtitle: "16/medium",
  body: "15/regular",
  caption: "13/regular",
  micro: "11/medium",
} as const;

export const spacingUnit = 4 as const;

export const radius = {
  pill: "999px",
  card: "16px",
  sheet: "20px",
} as const;

export const componentRules = {
  emptyState:
    "illustration grayscale soft + bold headline + one muted subtext + optional single white pill CTA",
  primaryButton: "white pill, dark text (#0D0D0D), full-width or near-full-width, 44px min tap",
  searchBar: "pill rounded-full floating with padding, contextual placeholder not generic",
  bottomNav: "icon+label, active accent, inactive muted, FAB offset outside tab row",
  topBar: "brand mark left + bell right, minimal",
} as const;

export const iconPack = "phosphor-duotone" as const;

export type DesignTokens = {
  colorTokens: typeof colorTokens;
  typeScale: typeof typeScale;
  componentRules: typeof componentRules;
  iconPack: typeof iconPack;
  spacingUnit: typeof spacingUnit;
};

export const designTokens: DesignTokens = {
  colorTokens,
  typeScale,
  componentRules,
  iconPack,
  spacingUnit,
};
