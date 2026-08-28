// design/tokens.ts — M3 design.md compiled to data, not prose (agent-system-spec.md:32)
// Injected as L3? No, as structured token injection distinct from prose — Builder refs `colorTokens.accent`.
export const designTokens = {
  colorTokens: {
    background: "#0D0D0D",
    backgroundNearBlack: "#121212",
    surface: "#181818",
    textPrimary: "#FFFFFF",
    textSecondary: "color-mix(in srgb, var(--color-neutral-500) 90%, var(--color-white))",
    textMuted: "var(--muted-foreground)",
    accent: "#E8493C", // single red/orange, used sparingly: brand mark + active nav only
    accentHover: "color-mix(in srgb, #E8493C 88%, white)",
    border: "var(--border)",
    borderHeavy: "var(--color-border-heavy)",
  },
  typeScale: {
    headline: "24/bold",
    body: "15/regular",
    caption: "13/regular",
    code: "12/mono",
  },
  spacingUnit: 4,
  radius: {
    pill: "1.35rem",
    card: "1.1rem",
    button: "0.65rem",
  },
  iconPack: "phosphor-duotone" as const,
  componentRules: {
    emptyState: "illustration grayscale soft on-brand → bold headline → one-line muted subtext → optional single white pill CTA (only when actionable)",
    primaryButton: "white pill, dark text, full-width or near-full-width, not accent",
    searchBar: "pill rounded-full floating with padding from edges, search left + mic right inside, contextual placeholder not generic",
    topBar: "minimal: brand mark left, bell right, no heavy title",
    bottomNav: "icon+label never icon-only, active accent icon+label+indicator, inactive muted gray, floating FAB offset outside tab row",
  },
  // Verifier does exact token compare, not vibes
  verifiableRules: [
    "dark-first not pure black: backgrounds ~#0D0D0D–#121212 never #000",
    "one accent only on brand/active-nav/primary emphasis never body text",
    "white is primary action color not accent",
    "aggressive type hierarchy bold headline vs muted gray subtext distinct, not lighter version",
    "search pill floating layered depth not flush header",
    "placeholder contextual real like 'Cheap 2 bedroom flat in Lusaka...' not 'Search...'",
  ],
} as const;

export type DesignTokens = typeof designTokens;
