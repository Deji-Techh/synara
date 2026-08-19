/**
 * Builds a caide-media:// protocol URL for serving media files in Electron.
 */
export function buildCaideMediaUrl(appPath: string, fileName: string): string {
  return `caide-media://media/${encodeURIComponent(appPath)}/.caide/media/${encodeURIComponent(fileName)}`;
}
