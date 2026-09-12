// FILE: theme.ts
// Purpose: Exact carbon-copy design tokens from Caide's web app (apps/web/src/index.css)
// Layer: Video design system

export const CAIDE_THEME = {
  colors: {
    // Exact dark mode background and surfaces from apps/web/src/index.css
    bg: "#0e0e0e",
    shellBg: "#0a0a0a",
    sidebar: "#121212",
    surface: "#141414",
    surfaceElevated: "#181818",
    surfaceHover: "rgba(255, 255, 255, 0.05)",
    
    // Borders: crisp subtle hairlines
    border: "rgba(255, 255, 255, 0.08)",
    borderLight: "rgba(255, 255, 255, 0.04)",
    borderFocus: "rgba(255, 255, 255, 0.22)",
    divider: "rgba(255, 255, 255, 0.06)",

    // Primary & accents: Apple/Linear-grade crisp monochrome with purposeful accents
    primary: "#ffffff",
    primaryForeground: "#0e0e0e",
    foreground: "#f5f5f5",
    mutedForeground: "#8e8e93",
    subtleForeground: "#636366",

    // Brand / provider specific accents from Caide
    claude: "#d97757",
    emerald: "#34d399",
    success: "#10b981",
    info: "#6073cc",
    warning: "#fbbf24",
    danger: "#f87171",
  },
  typography: {
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    fontMono: "'JetBrains Mono', Menlo, Monaco, Consolas, monospace",
  },
  shadows: {
    window: "0 30px 90px -10px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.08)",
    dialog: "0 25px 70px -12px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.1)",
    composer: "0 8px 32px -8px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.08)",
    device: "0 35px 80px -15px rgba(0, 0, 0, 0.95), 0 0 0 1px rgba(255, 255, 255, 0.12)",
  },
  radius: {
    sm: "6px",
    md: "8px",
    lg: "12px",
    xl: "16px",
    "2xl": "20px",
    full: "9999px",
  },
};

// Exact frameworks list from apps/web/src/components/CreateAppDialog.tsx
export const FRAMEWORKS_DATA = [
  {
    id: "blank",
    label: "Blank",
    description: "Start from an empty workspace",
    hint: "No preview",
    icon: null,
  },
  {
    id: "react-native",
    label: "React Native",
    description: "Expo / React Native mobile app",
    hint: "Browser preview · APK build",
    icon: "framework-icons/react-native.png",
  },
  {
    id: "flutter",
    label: "Flutter",
    description: "Flutter mobile app",
    hint: "Device preview · APK/AAB",
    icon: "framework-icons/flutter.png",
  },
  {
    id: "website",
    label: "Website",
    description: "Browser-first web application",
    hint: "Browser preview · Web build",
    icon: "framework-icons/website.png",
  },
] as const;

// Authentic provider options from Caide's provider routing
export const PROVIDERS_DATA = [
  {
    id: "opencodeZen",
    name: "OpenCode Zen / Go",
    badge: "Gateway",
    models: "mimo-v2.5-free · gpt-5.6-sol",
    active: true,
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    badge: "Reasoning",
    models: "claude-3-7-sonnet · claude-3-5-sonnet",
    active: true,
  },
  {
    id: "openai",
    name: "OpenAI Codex",
    badge: "Flagship",
    models: "gpt-5.6-sol · gpt-4o",
    active: true,
  },
  {
    id: "neon",
    name: "Neon & Supabase PostgreSQL",
    badge: "Connected",
    models: "Auto-branching on every prompt",
    active: true,
  },
] as const;
