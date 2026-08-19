import path from "node:path";
import { CaideError, CaideErrorKind } from "@/errors/caide_error";
import type { AgentContext } from "./types";

/**
 * Resolve the app path a read-only tool should target.
 *
 * - Omitted `appName` → current app (`ctx.appPath`).
 * - Provided `appName` → must match a referenced app from the current turn's
 *   `@app:Name` mentions. Any other value is rejected.
 *
 * Write tools do not call this — they operate only on `ctx.appPath` so that
 * referenced apps remain structurally unreachable for modification.
 */
import fs from "node:fs";

export function resolveTargetAppPath(
  ctx: AgentContext,
  appName: string | undefined,
): string {
  if (!appName) {
    return ctx.appPath;
  }
  const appPath = ctx.referencedApps.get(appName.toLowerCase());
  if (appPath) {
    return appPath;
  }
  // If appName is an absolute or relative path that exists on disk, resolve it directly
  if (
    appName.startsWith("/") ||
    appName.startsWith(".") ||
    appName.includes("/") ||
    appName.includes("\\")
  ) {
    const resolvedPath = path.isAbsolute(appName)
      ? appName
      : path.resolve(ctx.appPath, appName);
    if (fs.existsSync(resolvedPath)) {
      return resolvedPath;
    }
  }
  const available = [...ctx.referencedApps.keys()];
  const availableStr =
    available.length > 0 ? available.join(", ") : "(none available)";
  throw new CaideError(
    `Unknown app_name '${appName}'. Available referenced apps: ${availableStr}`,
    CaideErrorKind.NotFound,
  );
}

/**
 * Glob pattern for `.caide/` internals, for use in the node `glob` library's
 * ignore list.
 *
 * A referenced app's `.caide/` folder (rules, chat history, snapshots, etc.) is
 * not part of the `@app:Name` reference contract and must not be exposed to
 * read-only tools when targeting another app.
 */
export const CAIDE_INTERNAL_GLOB = "**/.caide/**";

/**
 * Negated glob for ripgrep's `--glob` flag, excluding `.caide/` at the app root
 * (ripgrep globs are relative to cwd, which is the target app path).
 */
export const CAIDE_INTERNAL_RIPGREP_EXCLUDE = "!.caide/**";

/**
 * Is `relativePath` inside a `.caide/` folder at the app root?
 *
 * Accepts slashes in either direction and a leading `./`; callers should pass a
 * path already resolved relative to the app root (so traversal aliases like
 * `src/../.caide/...` normalize correctly before being checked).
 */
export function isCaideInternalPath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\.\//, "");
  return normalized.split("/")[0] === ".caide";
}

/**
 * Strip `.caide/` entries from a file list when targeting a referenced app.
 * No-op for the current app (`appName` omitted) — the user's own `.caide/`
 * internals are always visible to them.
 */
export function filterCaideInternalFiles<T extends { path: string }>(
  files: T[],
  appName: string | undefined,
): T[] {
  if (!appName) {
    return files;
  }
  return files.filter((file) => !isCaideInternalPath(file.path));
}

/**
 * Throw if a resolved path inside a referenced app points into its `.caide/`
 * folder. No-op when `appName` is omitted (current app). The relative path is
 * computed from the resolved `fullFilePath`, so normalized traversal aliases
 * (e.g. `src/../.caide/...`) are caught.
 */
export function assertCaideInternalAccessAllowed({
  targetAppPath,
  fullFilePath,
  appName,
}: {
  targetAppPath: string;
  fullFilePath: string;
  appName: string | undefined;
}): void {
  if (!appName) {
    return;
  }
  const relativeFromApp = path.relative(targetAppPath, fullFilePath);
  if (isCaideInternalPath(relativeFromApp)) {
    throw new CaideError(
      `Cannot read .caide/ paths from referenced apps — these files are not part of the @app reference contract.`,
      CaideErrorKind.Validation,
    );
  }
}
