export const PRODUCT_NAME = "Caide";

export const PRODUCT_CATEGORY = "The local-first AI workspace for building production apps.";

export const PRODUCT_HERO_TITLE = "Build production apps with the AI agents you already use";

export const PRODUCT_HERO_DESCRIPTION =
  "Caide is the local-first desktop and web workspace for building full-stack apps—unifying chats, blueprints, tool execution, live device preview, and production builds in one focused window.";

export const PRODUCT_META_DESCRIPTION =
  "Caide is a free, open-source, local-first workspace for building production apps with AI agents. Supports Blank, React Native (Expo), Flutter, and Next.js projects with live device preview, BYOK models, blueprints, Supabase, and Neon database branching.";

export const PRODUCT_DESCRIPTION =
  "Caide is a free, open-source, local-first AI app-builder workspace. Create immutable-framework projects (Blank, React Native Expo, Flutter, Next.js), iterate with native Dyad x Caide turn loop, review interactive App Blueprints and questionnaires, preview live apps in DeviceLab, manage Supabase and Neon database branching, and ship production builds without subscriptions or markups.";

export const SUPPORTED_FRAMEWORKS = [
  {
    id: "react-native",
    name: "React Native (Expo)",
    description: "Expo Metro dev-server, mobile simulator, browser preview for web, native iOS and Android build targets.",
    badge: "Mobile & Web",
  },
  {
    id: "flutter",
    name: "Flutter",
    description: "Dart toolchain, flutter analyze/test, DeviceLab preview, and native APK, AAB, and IPA packaging.",
    badge: "Cross-Platform",
  },
  {
    id: "website",
    name: "Website (Next.js / Vite)",
    description: "Modern SSR or SPA web apps with live hot-reloading preview, Vercel one-click deploy, and tarball builds.",
    badge: "Full-Stack Web",
  },
  {
    id: "blank",
    name: "Blank Managed",
    description: "Clean managed directory where the agent designs and scaffolds custom architectures from scratch.",
    badge: "Custom Architecture",
  },
] as const;

export const SUPPORTED_PROVIDERS = [
  "Anthropic",
  "OpenAI",
  "DeepSeek",
  "Google Gemini",
  "Groq",
  "Ollama (Local)",
  "OpenCode Zen",
  "Custom OpenAI Endpoint",
] as const;

export const PRODUCT_PILLARS = [
  {
    title: "Framework-Driven Architecture",
    description:
      "Choose Blank, React Native (Expo), Flutter, or Next.js at project creation. Scaffolding, prompts, tools, preview adapters, and native build artifacts adapt precisely to your stack.",
  },
  {
    title: "Bring Your Own Keys, 100% Free",
    description:
      "Zero subscription tiers, zero hosted gateway limits, and zero token markups. Use your own keys for Anthropic, OpenAI, DeepSeek, Gemini, Groq, or run completely offline with Ollama.",
  },
  {
    title: "Interactive Blueprints & Questionnaires",
    description:
      "Align on app architecture, state management, and API design before code generation begins with interactive in-chat blueprint review cards and 3-question survey gates.",
  },
  {
    title: "LiveLab & DeviceLab Verification",
    description:
      "Verify the running app with multi-device frames (iPhone, Android, Tablet, Desktop), hot-reloading dev server, live console logs, problems diagnostics, and visual element inspection.",
  },
  {
    title: "Supabase & Neon Database Branching",
    description:
      "Connect Supabase or Neon serverless Postgres with automatic instant database branches per thread and working tree, keeping database migrations safe and isolated.",
  },
  {
    title: "Consent Gates & Shell Safety",
    description:
      "Review and approve terminal executions, inspect file diffs before they land, and benefit from protected shell blocklists and granular tool consent policies.",
  },
] as const;
