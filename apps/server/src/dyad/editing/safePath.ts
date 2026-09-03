// FILE: safePath.ts
// Purpose: Resolve tool file paths inside the app workspace. Denies
// traversal escapes; allows absolute paths that resolve inside the base and
// `~` expansion (donor safeJoin semantics, POSIX server).
// Donor: dyad x caide src/ipc/utils/path_utils.ts safeJoin +
// tools/path_safety.ts relative-check (combined, no Electron).

import * as os from "node:os";
import * as path from "node:path";

export class UnsafePathError extends Error {
  constructor(requested: string, base: string) {
    super(`Unsafe path: "${requested}" would escape the workspace "${base}"`);
    this.name = "UnsafePathError";
  }
}

function withinBase(resolvedBase: string, resolvedTarget: string): boolean {
  const rel = path.relative(resolvedBase, resolvedTarget);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Join userPath onto appPath. Absolute user paths must resolve inside the
 * app; `~` expands to the home directory (then must still land inside, like
 * the donor). Throws UnsafePathError on escape.
 */
export function safeJoinAppPath(appPath: string, userPath: string): string {
  const resolvedBase = path.resolve(appPath);
  let candidate = userPath;
  if (candidate.startsWith("~")) {
    candidate = path.join(os.homedir(), candidate.slice(1));
  }
  const resolved = path.isAbsolute(candidate)
    ? path.resolve(candidate)
    : path.resolve(resolvedBase, candidate);
  if (!withinBase(resolvedBase, resolved)) {
    throw new UnsafePathError(userPath, appPath);
  }
  return resolved;
}
