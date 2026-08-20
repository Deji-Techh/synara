// FILE: caideApps.ts
// Purpose: Server-side caide-apps path helpers, mirrors apps/engine/src/paths/paths.ts
// and dyad x caide's src/paths/paths.ts (getDyadAppsBaseDirectory / getCaideAppPath).
// The web's ~/caide-apps/<slug> is expanded via expandHomePath in
// WorkspacePaths.normalizeWorkspaceRoot, but direct callsites (e.g. scaffolding
// checks) should use these helpers.
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

let cachedBaseDirectory: string | null = null;
let defaultDirCreated = false;

export function getDefaultCaideAppsDirectory(): string {
  if (process.env.CAIDE_DEV_APPS_DIR) {
    return process.env.CAIDE_DEV_APPS_DIR;
  }
  const caideDir = path.join(os.homedir(), "caide-apps");
  const legacyDir = path.join(os.homedir(), "dyad-apps");
  if (!fs.existsSync(caideDir) && fs.existsSync(legacyDir)) {
    return legacyDir;
  }
  return caideDir;
}

function resolveDefaultCaideAppsDirectory(): string {
  const defaultDir = getDefaultCaideAppsDirectory();
  if (!defaultDirCreated) {
    try {
      fs.mkdirSync(defaultDir, { recursive: true });
      defaultDirCreated = true;
    } catch {
      // best-effort; caller will surface error
    }
  }
  return defaultDir;
}

export function invalidateCaideAppsBaseDirectoryCache(): void {
  cachedBaseDirectory = null;
}

export function getCaideAppsBaseDirectory(): string {
  if (cachedBaseDirectory) return cachedBaseDirectory;
  // Server has no customAppsFolder setting yet; use default
  cachedBaseDirectory = resolveDefaultCaideAppsDirectory();
  return cachedBaseDirectory;
}

export function getCaideAppPath(appPath: string): string {
  if (path.isAbsolute(appPath)) return appPath;
  // Expand leading ~/ if present (mirrors expandHomePath)
  if (appPath === "~") return os.homedir();
  if (appPath.startsWith("~/") || appPath.startsWith("~\\")) {
    return path.join(os.homedir(), appPath.slice(2));
  }
  return path.join(getCaideAppsBaseDirectory(), appPath);
}

export function isDirectoryAccessible(directoryPath: string): boolean {
  try {
    const st = fs.statSync(directoryPath);
    if (!st.isDirectory()) return false;
    fs.accessSync(directoryPath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function isAppLocationAccessible(resolvedPath: string): boolean {
  const containingFolder = path.dirname(resolvedPath);
  return isDirectoryAccessible(containingFolder);
}
