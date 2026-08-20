// FILE: caideApps.ts
// Purpose: Resolve the base directory for auto-created apps (caide-apps).
// Mirrors dyad x caide's getDyadAppsBaseDirectory / getCaideAppsBaseDirectory.

export function getCaideAppsBaseDirectory(): string {
  // In the web, we don't have direct FS access; the actual path is resolved
  // in the engine / server. For display purposes, we show ~/caide-apps.
  // The engine's getCaideAppPath will resolve the real absolute path.
  // This helper is for UI labels and for generating the app slug.
  return "~/caide-apps";
}

export function toCaideAppSlug(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || `app-${Date.now().toString(36)}`
  );
}
