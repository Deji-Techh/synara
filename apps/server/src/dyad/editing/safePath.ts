// FILE: safePath.ts
// Purpose: Resolve tool file paths inside the app workspace. Denies
// traversal escapes; allows absolute paths that resolve inside the base and
// `~` expansion (donor safeJoin semantics, POSIX server).
// Donor: dyad x caide src/ipc/utils/path_utils.ts safeJoin +
// tools/path_safety.ts resolveDirectoryWithinAppPath — `..`-segment
// rejection and win32 case-insensitive branch ported verbatim in logic
// (return stays absolute for fileEditTools callers; donor returns relative).

import * as os from "node:os";
import * as path from "node:path";

export class UnsafePathError extends Error {
  constructor(requested: string, base: string) {
    super(`Unsafe path: "${requested}" would escape the workspace "${base}"`);
    this.name = "UnsafePathError";
  }
}

/**
 * Disallow any ".." path segment (even if the resolved path would remain
 * within root). Makes traversal attempts explicit and avoids surprising
 * "a/../b" style inputs. Donor logic verbatim.
 */
function assertNoDotDotSegment(requested: string, base: string): void {
  if (/(^|[\\/])\.\.([\\/]|$)/.test(requested)) {
    throw new UnsafePathError(requested, base);
  }
}

function withinBase(
  pathImpl: typeof path.posix | typeof path.win32,
  resolvedBase: string,
  resolvedTarget: string,
  caseInsensitive: boolean,
): boolean {
  const baseForCheck = caseInsensitive ? resolvedBase.toLowerCase() : resolvedBase;
  const targetForCheck = caseInsensitive ? resolvedTarget.toLowerCase() : resolvedTarget;
  const rel = pathImpl.relative(baseForCheck, targetForCheck);
  return (
    rel === "" ||
    (!rel.startsWith(`..${pathImpl.sep}`) && rel !== ".." && !pathImpl.isAbsolute(rel))
  );
}

/**
 * Join userPath onto appPath. Absolute user paths must resolve inside the
 * app; `~` expands to the home directory (then must still land inside, like
 * the donor). Throws UnsafePathError on `..` segments or escape.
 */
export function safeJoinAppPath(appPath: string, userPath: string): string {
  assertNoDotDotSegment(userPath, appPath);
  // Stored appPath values may contain forward slashes on Windows
  // ("C:/..."), while path.resolve normalizes to backslashes — so detect
  // win32-style roots and use win32 semantics + case-insensitive check.
  // Donor logic verbatim.
  const looksLikeWin32Path =
    /^[a-zA-Z]:[\\/]/.test(appPath) || appPath.startsWith("\\\\") || appPath.includes("\\");
  const pathImpl = looksLikeWin32Path ? path.win32 : path.posix;
  const caseInsensitive = looksLikeWin32Path;

  let candidate = userPath;
  if (candidate.startsWith("~")) {
    candidate = path.join(os.homedir(), candidate.slice(1));
  }
  const resolvedBase = pathImpl.resolve(appPath);
  const resolved = pathImpl.isAbsolute(candidate)
    ? pathImpl.resolve(candidate)
    : pathImpl.resolve(resolvedBase, candidate);
  if (!withinBase(pathImpl, resolvedBase, resolved, caseInsensitive)) {
    throw new UnsafePathError(userPath, appPath);
  }
  return resolved;
}
