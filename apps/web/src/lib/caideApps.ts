// FILE: caideApps.ts
// Purpose: Resolve the base directory for auto-created apps (caide-apps).
// Mirrors dyad x caide's getDyadAppsBaseDirectory / getCaideAppsBaseDirectory.

import { isWorkspaceRootWithin, workspaceRootsEqual } from "@caide/shared/threadWorkspace";
import type { Project } from "../types";
import type { ServerWorkspacePaths } from "./serverWorkspacePaths";

export function getCaideAppsBaseDirectory(): string {
  // In the web, we don't have direct FS access; the actual path is resolved
  // in the engine / server. For display purposes, we show ~/caide-apps.
  // The engine's getCaideAppPath will resolve the real absolute path.
  // This helper is for UI labels and for generating the app slug.
  return "~/caide-apps";
}

export function getCaideAppsBaseDirectoryForPaths(paths: ServerWorkspacePaths): string {
  const homeDir = paths.homeDir?.trim() ?? "";
  if (!homeDir) return "";
  // Canonical caide-apps location; legacy dyad-apps is handled server-side but web
  // should treat anything under either as a Caide app for the branding gate.
  return `${homeDir.replace(/\/+$/, "")}/caide-apps`;
}

export function isCaideAppProject(
  project: Pick<Project, "cwd" | "kind"> | null | undefined,
  paths: ServerWorkspacePaths,
): boolean {
  if (!project || project.kind !== "project") return false;
  const cwd = project.cwd?.trim() ?? "";
  if (!cwd) return false;
  const caideBase = getCaideAppsBaseDirectoryForPaths(paths);
  const legacyBase = paths.homeDir ? `${paths.homeDir.replace(/\/+$/, "")}/dyad-apps` : "";
  // Until homeDir resolves, fall back to path substring so a freshly created
  // caide-app still matches even though isWorkspaceRootWithin would lack a base.
  if (!caideBase) {
    return cwd.includes("/caide-apps/") || cwd.includes("/dyad-apps/");
  }
  return (
    isWorkspaceRootWithin(cwd, caideBase) ||
    workspaceRootsEqual(cwd, caideBase) ||
    (legacyBase
      ? isWorkspaceRootWithin(cwd, legacyBase) || workspaceRootsEqual(cwd, legacyBase)
      : false) ||
    cwd.includes("/caide-apps/") ||
    cwd.includes("/dyad-apps/")
  );
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
