import * as fs from "node:fs";
import { fingerprintFiles, diffFingerprints, type FingerprintDiff } from "./fingerprintFiles.ts";

export type TreeChangeCallback = (diff: FingerprintDiff) => void;

export class ProjectTreeWatcher {
  private dir: string;
  private extensions?: string[];
  private debounceMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private currentFingerprint = new Map<string, string>();
  private fsWatcher: fs.FSWatcher | null = null;
  private callbacks = new Set<TreeChangeCallback>();
  private isDisposed = false;

  constructor(dir: string, extensions?: string[], debounceMs = 450) {
    this.dir = dir;
    this.extensions = extensions;
    this.debounceMs = debounceMs;
  }

  async start(): Promise<void> {
    if (this.isDisposed) return;
    this.currentFingerprint = await fingerprintFiles(this.dir, this.extensions);

    try {
      if (fs.existsSync(this.dir)) {
        this.fsWatcher = fs.watch(this.dir, { recursive: true }, () => {
          this.scheduleCheck();
        });
      }
    } catch {
      // Fallback to manual triggers if OS filesystem watch fails
    }
  }

  onChange(cb: TreeChangeCallback): () => void {
    this.callbacks.add(cb);
    return () => {
      this.callbacks.delete(cb);
    };
  }

  scheduleCheck(): void {
    if (this.isDisposed) return;
    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(async () => {
      await this.runCheck();
    }, this.debounceMs);
  }

  async runCheck(): Promise<FingerprintDiff> {
    const nextFingerprint = await fingerprintFiles(this.dir, this.extensions);
    const diff = diffFingerprints(this.currentFingerprint, nextFingerprint);
    this.currentFingerprint = nextFingerprint;

    if (diff.added.length > 0 || diff.modified.length > 0 || diff.deleted.length > 0) {
      for (const cb of this.callbacks) {
        try {
          cb(diff);
        } catch {
          // ignore callback error
        }
      }
    }

    return diff;
  }

  dispose(): void {
    this.isDisposed = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.fsWatcher) {
      this.fsWatcher.close();
      this.fsWatcher = null;
    }
    this.callbacks.clear();
  }
}
