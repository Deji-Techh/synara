export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  description: string;
  highlights: string[];
  features?: string[];
  improvements?: string[];
  fixes?: string[];
}

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    version: "0.8.0",
    date: "2026-09-18",
    title: "V1 Backend Transplant & Live DeviceLab Expansion",
    description:
      "Complete backend convergence bringing the proven Dyad turn engine, multi-device mobile preview frames, Supabase & Neon database branching, and unified model routing into the native desktop app.",
    highlights: [
      "Native Dyad x Caide turn loop engine with delivery-mode streaming",
      "DeviceLab responsive framing for iPhone, Android, Tablet, and Desktop",
      "Neon serverless Postgres instant branching per project thread",
      "Interactive App Blueprint cards and 3-question survey alignment",
      "Direct BYOK support for Claude 3.7, OpenAI o3-mini, DeepSeek R1, and Ollama",
    ],
    features: [
      "Added multi-device framing to LiveLab with mobile QR code bridging",
      "Added automated Neon database branching during agent migrations",
      "Added explicit tool consent gates with terminal command blocklists",
      "Added 1-click Vercel deployment with synchronized database connection",
    ],
    improvements: [
      "Drastically improved turn loop responsiveness and cancel safety",
      "Reduced idle memory footprint across background tool executions",
      "Refined warm desert UI palette with high-contrast accessibility",
    ],
    fixes: [
      "Fixed Metro dev-server reconnect flakiness during rapid file edits",
      "Fixed Flutter toolchain path detection on macOS Apple Silicon and Linux",
    ],
  },
  {
    version: "0.7.0",
    date: "2026-08-20",
    title: "Immutable Framework Scaffolding & BYOK Multi-Model Hub",
    description:
      "Introduced immutable project framework boundaries for Blank, React Native (Expo), Flutter, and Next.js projects alongside complete removal of telemetry and gateway quotas.",
    highlights: [
      "Strict project/thread isolation preventing cross-context state leakage",
      "100% Free BYOK model architecture with zero token markup",
      "Local credential vault for encrypted API key storage",
    ],
    features: [
      "First-class React Native (Expo) Metro integration",
      "Flutter pub analyze and device simulator toolchain",
      "OpenCode Zen community-routed model integration",
    ],
    improvements: [
      "Instant WebSocket protocol synchronization between engine and UI",
      "Enhanced diff visualizer for multi-file code generations",
    ],
  },
  {
    version: "0.6.0",
    date: "2026-07-15",
    title: "Initial Desktop Workspace Preview",
    description:
      "The inaugural release of Caide: a local-first workspace for turning prompts into production full-stack code.",
    highlights: [
      "Electron desktop packaging for Linux, macOS, and Windows",
      "Local SQLite state store with zero telemetry",
      "Hot-reloading browser preview dock",
    ],
  },
];
