/**
 * Preview — fingerprint + watchProjectTree, steal dyad public_preview_service.
 * Framework-owns preview/build, trusted workspace.
 */
import { createHash } from "node:crypto";

export function fingerprintFiles(files: Record<string, Uint8Array>): string {
  const h = createHash("sha256");
  for (const p of Object.keys(files).sort()) {
    h.update(p);
    h.update(files[p]);
  }
  return h.digest("hex");
}

export type WatchOptions = {
  excludedDirectories: string[];
  debounceMs: number;
  onChange: () => void;
};

export function watchProjectTree(_path: string, _opts: WatchOptions): () => void {
  // stub — real impl uses fs.watch with debounce 450ms
  return () => {};
}
