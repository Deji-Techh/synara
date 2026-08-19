/**
 * Shared utilities for ripgrep integration
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { app } from "electron";

import { CaideError, CaideErrorKind } from "@/errors/caide_error";

export const MAX_FILE_SEARCH_SIZE = 1024 * 1024;
export const RIPGREP_EXCLUDED_GLOBS = [
  "!node_modules/**",
  "!.git/**",
  "!.next/**",
];

function isUsableExecutable(candidate: string): boolean {
  try {
    if (!fs.statSync(candidate).isFile()) {
      return false;
    }
    if (os.platform() !== "win32") {
      fs.accessSync(candidate, fs.constants.X_OK);
    }
    return true;
  } catch {
    return false;
  }
}

function resolveExecutableFromPath(executableName: string): string | undefined {
  const pathValue = process.env.PATH;
  if (!pathValue) {
    return undefined;
  }

  for (const directory of pathValue.split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, executableName);
    if (isUsableExecutable(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

/**
 * Return every supported location where the ripgrep executable may live.
 *
 * AppImage and Forge builds can place extra resources or unpacked ASAR files
 * in slightly different locations, so packaged builds must not assume a
 * single path.
 */
export function getRgExecutableCandidates(): string[] {
  const isWindows = os.platform() === "win32";
  const executableName = isWindows ? "rg.exe" : "rg";
  const appPath = app.getAppPath();
  const candidates = [
    process.env.CAIDE_RG_PATH,
    path.join(
      appPath,
      "node_modules",
      "@vscode",
      "ripgrep",
      "bin",
      executableName,
    ),
    path.join(
      appPath,
      "node_modules",
      `@vscode/ripgrep-${process.platform}-${process.arch}`,
      "bin",
      executableName,
    ),
  ];

  if (app.isPackaged) {
    const unpackedAppPath = appPath.endsWith("app.asar")
      ? appPath.slice(0, -"app.asar".length) + "app.asar.unpacked"
      : path.join((process as any).resourcesPath, "app.asar.unpacked");

    candidates.push(
      path.join(
        (process as any).resourcesPath,
        "@vscode",
        "ripgrep",
        "bin",
        executableName,
      ),
      path.join(
        (process as any).resourcesPath,
        "node_modules",
        "@vscode",
        "ripgrep",
        "bin",
        executableName,
      ),
      path.join(
        unpackedAppPath,
        "node_modules",
        "@vscode",
        "ripgrep",
        "bin",
        executableName,
      ),
    );
  }

  return Array.from(
    new Set(candidates.filter((candidate): candidate is string => !!candidate)),
  );
}

/**
 * Get the path to the ripgrep executable.
 * Handles development, packaged Electron resources, unpacked ASAR resources,
 * an explicit CAIDE_RG_PATH override, and a system-installed fallback.
 */
export function getRgExecutablePath(): string {
  const executableName = os.platform() === "win32" ? "rg.exe" : "rg";
  const candidates = getRgExecutableCandidates();

  for (const candidate of candidates) {
    if (isUsableExecutable(candidate)) {
      return candidate;
    }
  }

  const systemExecutable = resolveExecutableFromPath(executableName);
  if (systemExecutable) {
    return systemExecutable;
  }

  throw new CaideError(
    [
      "Code search is unavailable because the ripgrep executable is missing or not executable.",
      "Reinstall this CAIDE build, or set CAIDE_RG_PATH to a working rg executable.",
      "Checked locations:",
      ...candidates.map((candidate) => `- ${candidate}`),
      `- system PATH (${executableName})`,
    ].join("\n"),
    CaideErrorKind.Precondition,
  );
}
