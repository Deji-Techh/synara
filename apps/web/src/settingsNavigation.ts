// FILE: settingsNavigation.ts
// Purpose: Share the settings topic taxonomy between the main sidebar and the settings screen.
// Layer: Route/UI support
// Exports: section ids, nav items, and search normalization helper

export const SETTINGS_SECTION_IDS = [
  "database",
  "general",
  "profile",
  "appearance",
  "notifications",
  "behavior",
  "shortcuts",
  "worktrees",
  "archived",
  "providers",
  "skills",
  "integrations",
  "advanced",
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number];
export type SettingsNavGroupId = "personal" | "integrations" | "coding" | "system" | "archived";

/**
 * Deep-link scroll targets inside settings panels. Each id is shared by its DOM owner and callers
 * that navigate with `?target=…`; the settings route resolves every target after the active panel
 * mounts.
 */
export const SETTINGS_TARGETS = {
  providerUpdates: "provider-updates",
  environmentPanel: "environment-panel",
} as const;

export type SettingsNavItem = {
  id: SettingsSectionId;
  group: SettingsNavGroupId;
  label: string;
  description: string;
  /** Basename of a SVG under `/central-icons-reversed`. */
  icon: string;
  eyebrow: string;
};

export const SETTINGS_NAV_GROUPS: ReadonlyArray<{
  id: SettingsNavGroupId;
  label: string;
}> = [
  { id: "personal", label: "Personal" },
  { id: "coding", label: "Agent & AI" },
  { id: "integrations", label: "Connections" },
  { id: "system", label: "System" },
  { id: "archived", label: "Archived" },
] as const;

export const SETTINGS_NAV_ITEMS: readonly SettingsNavItem[] = [
  // ── personal ──────────────────────────────────────────────────────────────
  {
    id: "profile",
    group: "personal",
    label: "Profile",
    description: "Your local activity, streaks, and a shareable stats card.",
    icon: "user",
    eyebrow: "Your stats",
  },
  {
    id: "appearance",
    group: "personal",
    label: "Appearance",
    description: "Theme, font sizes, spacing density, and terminal display.",
    icon: "brush",
    eyebrow: "Look & feel",
  },
  {
    id: "notifications",
    group: "personal",
    label: "Notifications",
    description: "Task completion alerts and desktop notification preferences.",
    icon: "bell",
    eyebrow: "Alerts",
  },
  {
    id: "shortcuts",
    group: "personal",
    label: "Keybindings",
    description: "Keyboard shortcuts for common actions across the workspace.",
    icon: "keyboard",
    eyebrow: "Shortcuts",
  },
  // ── coding (Agent & AI) ───────────────────────────────────────────────────
  {
    id: "general",
    group: "coding",
    label: "General",
    description: "Default chat mode, build target, apps folder, and global instructions.",
    icon: "settings-slider-hor",
    eyebrow: "Workspace defaults",
  },
  {
    id: "providers",
    group: "coding",
    label: "Agent providers",
    description: "API keys, default model, reasoning effort, Turbo edits, and custom models.",
    icon: "agent",
    eyebrow: "AI providers",
  },
  {
    id: "behavior",
    group: "coding",
    label: "Chat behavior",
    description: "Max turns, auto-approve, blueprint, sandbox, MCP, and code explorer.",
    icon: "settings-toggle-1",
    eyebrow: "Turn controls",
  },
  {
    id: "skills",
    group: "coding",
    label: "Agent skills",
    description: "Browse, add, and configure skills available to the agent.",
    icon: "zap",
    eyebrow: "Skills",
  },
  // ── integrations (Connections) ────────────────────────────────────────────
  {
    id: "integrations",
    group: "integrations",
    label: "MCP servers",
    description: "Manage MCP server connections, OAuth, and tool permissions.",
    icon: "modelcontextprotocol",
    eyebrow: "MCP",
  },
  {
    id: "database",
    group: "integrations",
    label: "Database",
    description: "Supabase and Neon project connections, branch configuration, and auth.",
    icon: "storage",
    eyebrow: "Data",
  },
  // ── system ────────────────────────────────────────────────────────────────
  {
    id: "worktrees",
    group: "system",
    label: "Worktrees",
    description: "Managed git worktree branches and their cleanup policies.",
    icon: "git",
    eyebrow: "Worktrees",
  },
  {
    id: "advanced",
    group: "system",
    label: "Advanced",
    description: "Runtime mode, Node.js version, auto-update channel, and danger zone.",
    icon: "server",
    eyebrow: "System",
  },
  // ── archived ──────────────────────────────────────────────────────────────
  {
    id: "archived",
    group: "archived",
    label: "Archived",
    description: "Archived conversations and their retention settings.",
    icon: "archive",
    eyebrow: "Archive",
  },
] as const;

/**
 * Stable DOM id for a settings row, derived from its (string) title. Shared by the row that
 * renders the anchor and by the search index that deep-links to it via `?target=…`, so the
 * two can't drift. Panels stay mounted and render null while inactive, so the slug only needs
 * to be unique within a section.
 */
export function settingRowAnchorId(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `setting-${slug}`;
}

export function normalizeSettingsSection(value: unknown): SettingsSectionId {
  if (typeof value !== "string") {
    return "profile";
  }
  return SETTINGS_SECTION_IDS.find((candidate) => candidate === value) ?? "profile";
}
