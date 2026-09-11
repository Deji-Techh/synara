// FILE: previewDefaultsStore.ts
// Purpose: Per-project preview display defaults (viewport, device class,
// color scheme) for PreviewStage. Keyed by normalized workspace root;
// absent = stage defaults (full viewport, phone, light).

export type PreviewViewportId = "full" | "compact" | "large" | "tablet" | "desktop";
export type PreviewColorScheme = "light" | "dark";
export type PreviewDeviceClass = "phone" | "tablet";

export interface PreviewDefaults {
  viewport: PreviewViewportId;
  deviceClass: PreviewDeviceClass;
  colorScheme: PreviewColorScheme;
}

export const DEFAULT_PREVIEW_DEFAULTS: PreviewDefaults = {
  viewport: "full",
  deviceClass: "phone",
  colorScheme: "light",
};

const DEFAULTS_KEY = "caide.preview-defaults.v1";

function normalizeRoot(root: string): string {
  return root.replace(/\\/g, "/").replace(/\/+$/, "");
}

function readAll(): Record<string, Partial<PreviewDefaults>> {
  try {
    const raw = localStorage.getItem(DEFAULTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<PreviewDefaults>>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

const VALID_VIEWPORTS: PreviewViewportId[] = ["full", "compact", "large", "tablet", "desktop"];

export function loadPreviewDefaults(workspaceRoot: string | null | undefined): PreviewDefaults {
  if (!workspaceRoot) return { ...DEFAULT_PREVIEW_DEFAULTS };
  const stored = readAll()[normalizeRoot(workspaceRoot)];
  return {
    viewport: VALID_VIEWPORTS.includes(stored?.viewport as PreviewViewportId)
      ? (stored?.viewport as PreviewViewportId)
      : DEFAULT_PREVIEW_DEFAULTS.viewport,
    deviceClass: stored?.deviceClass === "tablet" ? "tablet" : DEFAULT_PREVIEW_DEFAULTS.deviceClass,
    colorScheme: stored?.colorScheme === "dark" ? "dark" : DEFAULT_PREVIEW_DEFAULTS.colorScheme,
  };
}

export function savePreviewDefaults(
  workspaceRoot: string,
  patch: Partial<PreviewDefaults>,
): PreviewDefaults {
  const root = normalizeRoot(workspaceRoot);
  const all = readAll();
  const next = { ...loadPreviewDefaults(root), ...patch };
  all[root] = next;
  try {
    localStorage.setItem(DEFAULTS_KEY, JSON.stringify(all));
  } catch {
    // storage full/blocked — defaults skipped
  }
  return next;
}
