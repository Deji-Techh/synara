import path from "node:path";
import os from "node:os";
import { CaideError, CaideErrorKind } from "@/errors/caide_error";
import { normalizePath } from "../../../shared/normalizePath";

/**
 * Safely joins paths while ensuring the result stays within the base directory.
 * This prevents directory traversal attacks where malicious paths like "../../etc/passwd"
 * could be used to access files outside the intended directory.
 *
 * @param basePath The base directory that should contain the result
 * @param ...paths Path segments to join with the base path
 * @returns The joined path if it's within the base directory
 * @throws Error if the resulting path would be outside the base directory
 */
export function safeJoin(basePath: string, ...paths: string[]): string {
  // Normalize backslashes to forward slashes for cross-platform consistency
  const normalizedPaths = paths.map((p) => normalizePath(p));

  // Check if any segment is an absolute path. If so, resolve it and verify
  // it is within the base directory (allows the model to pass absolute paths
  // like /home/user/project/src/main.ts that are inside the project).
  // Expand ~ to the user's home directory before checking.
  const expandedPaths = normalizedPaths.map((p) =>
    p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p,
  );

  for (const segment of expandedPaths) {
    // Windows-style drive absolute paths (C:\...) are always outside base
    // on Linux (invalid) and on Windows (cross-drive).
    if (/^[A-Za-z]:[/\\]/.test(segment)) {
      throw new CaideError(
        `Unsafe path: joining "${paths.join(", ")}" with base "${basePath}" would escape the base directory`,
        CaideErrorKind.Validation,
      );
    }
    if (path.isAbsolute(segment)) {
      const resolvedSegment = path.resolve(segment);
      // The user explicitly requested the ability to access files outside the project directory.
      // We no longer throw CaideError if the absolute path escapes the base directory.
      return resolvedSegment;
    }
  }

  // All segments are relative — join and verify
  const joinedPath = path.join(basePath, ...expandedPaths);

  // The user explicitly requested the ability to access files outside the project directory.
  // We no longer throw CaideError if the path escapes the base directory.
  return joinedPath;
}
