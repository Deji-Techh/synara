import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { IS_TEST_BUILD } from "../ipc/utils/test_utils";
import { readSettings } from "../main/settings";

// Cached result of getCaideAppsBaseDirectory
let cachedBaseDirectory: string | null = null;
let cachedCustomFolderSetting: string | null | undefined;
// Whether `caide-apps` (or `caide-apps`) has been created
let defaultDirCreated = false;

/**
 * Gets the default path of the base caide-apps directory (without a specific app subdirectory)
 */
export function getDefaultCaideAppsDirectory(): string {
  if (process.env.CAIDE_DEV_APPS_DIR) {
    return process.env.CAIDE_DEV_APPS_DIR;
  }
  if (IS_TEST_BUILD) {
    const electron = getElectron();
    return path.join(electron!.app.getPath("userData"), "caide-apps");
  }
  const caideDir = path.join(os.homedir(), "caide-apps");
  const legacyDir = path.join(os.homedir(), "dyad-apps");
  if (!fs.existsSync(caideDir) && fs.existsSync(legacyDir)) {
    return legacyDir;
  }
  return caideDir;
}

/**
 * Gets the default path of the base caide-apps directory (without a specific app subdirectory),
 * but creates the directory the first time that this function is called
 */
function resolveDefaultCaideAppsDirectory(): string {
  const defaultDir = getDefaultCaideAppsDirectory();
  if (!defaultDirCreated) {
    try {
      fs.mkdirSync(defaultDir, { recursive: true });
      defaultDirCreated = true;
    } catch {
      // Fall through; if it fails then the user will see error toasts
    }
  }
  return defaultDir;
}

/**
 * Clears base directory cache, so the next call to getCaideAppsBaseDirectory will re-read the settings
 */
export function invalidateCaideAppsBaseDirectoryCache(): void {
  cachedBaseDirectory = null;
  cachedCustomFolderSetting = undefined;
}

/**
 * Returns the cached value of the custom folder path
 */
export function getCustomFolderCache(): string | null | undefined {
  return cachedCustomFolderSetting;
}

/**
 * Gets the user's preferred apps directory path (without a specific app subdirectory)
 */
export function getCaideAppsBaseDirectory(): string {
  const appsPath =
    cachedBaseDirectory ??
    (cachedCustomFolderSetting = readSettings().customAppsFolder) ??
    resolveDefaultCaideAppsDirectory();

  cachedBaseDirectory = appsPath;
  return cachedBaseDirectory;
}

/**
 * Given a path, determines whether that path exists, is a directory, and is writable.
 * Can determine, for example, whether the output of `getCaideAppsBaseDirectory` is usable
 */
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

export function getCaideAppPath(appPath: string): string {
  // If appPath is already absolute, use it as-is
  if (path.isAbsolute(appPath)) {
    return appPath;
  }
  // Otherwise, use the user's preferred base path
  return path.join(getCaideAppsBaseDirectory(), appPath);
}

/**
 * Given an app path, determines whether that path is accessible within the filesystem.
 * The input to this function is assumed to be the result of `getCaideAppPath`.
 */
export function isAppLocationAccessible(resolvedPath: string): boolean {
  const containingFolder = path.dirname(resolvedPath);
  return isDirectoryAccessible(containingFolder);
}

export function getTypeScriptCachePath(): string {
  const electron = getElectron();
  return path.join(electron!.app.getPath("sessionData"), "typescript-cache");
}

/**
 * Gets the user data path, handling both Electron and non-Electron environments
 * In Electron: returns the app's userData directory
 * With CAIDE_USER_DATA_DIR set: returns that directory (embedders spawn this
 * process headless and must point it at a writable location — the fallback
 * below is CWD-relative and breaks inside read-only packaged mounts)
 * In non-Electron: returns "./userData" in the current directory
 */
export function getUserDataPath(): string {
  const explicitUserDataDir = process.env.CAIDE_USER_DATA_DIR?.trim();
  if (explicitUserDataDir) {
    return path.resolve(explicitUserDataDir);
  }

  const electron = getElectron();
  const devUserDataDir =
    process.env.CAIDE_DEV_USER_DATA_DIR?.trim() || process.env.DYAD_DEV_USER_DATA_DIR?.trim();

  if (process.env.NODE_ENV === "development" && devUserDataDir) {
    return path.resolve(devUserDataDir);
  }

  // When running in Electron and app is ready
  if (process.env.NODE_ENV !== "development" && electron) {
    return electron!.app.getPath("userData");
  }

  // For development or when the Electron app object isn't available
  return path.resolve("./userData");
}

/**
 * Get a reference to electron in a way that won't break in non-electron environments
 */
export function getElectron(): typeof import("electron") | undefined {
  let electron: typeof import("electron") | undefined;
  try {
    // Check if we're in an Electron environment
    if (process.versions.electron) {
      electron = require("electron");
    }
  } catch {
    // Not in Electron environment
  }
  return electron;
}
