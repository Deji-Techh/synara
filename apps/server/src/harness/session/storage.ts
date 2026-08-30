import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { randomUUID } from "node:crypto";

export interface SessionLogEntry {
  id: string;
  parentUuid: string | null;
  sessionId: string;
  seq: number;
  time: number;
  type: string;
  data: unknown;
}

export interface SessionStorageOptions {
  baseDir?: string;
  debounceMs?: number;
}

export class SessionStorage {
  private baseDir: string;
  private debounceMs: number;
  private writeQueues = new Map<string, SessionLogEntry[]>();
  private flushTimers = new Map<string, NodeJS.Timeout>();
  private activeWrites = new Map<string, Promise<void>>();

  constructor(options: SessionStorageOptions = {}) {
    this.baseDir = options.baseDir ?? path.join(os.homedir(), ".caide", "sessions");
    this.debounceMs = options.debounceMs ?? 100;
  }

  private getSessionFilePath(sessionId: string): string {
    return path.join(this.baseDir, `${sessionId}.jsonl`);
  }

  private ensureDirectory(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private nextSeqMap = new Map<string, number>();

  async append(
    sessionId: string,
    type: string,
    data: unknown,
    parentUuid: string | null = null,
    options?: { id?: string; time?: number; seq?: number },
  ): Promise<SessionLogEntry> {
    this.ensureDirectory();

    let seq = options?.seq;
    if (seq === undefined) {
      if (!this.nextSeqMap.has(sessionId)) {
        const existingEntries = await this.readEntries(sessionId);
        const maxSeq = existingEntries.reduce((max, e) => Math.max(max, e.seq), -1);
        this.nextSeqMap.set(sessionId, maxSeq + 1);
      }
      seq = this.nextSeqMap.get(sessionId)!;
      this.nextSeqMap.set(sessionId, seq + 1);
    } else {
      const currentNext = this.nextSeqMap.get(sessionId) ?? 0;
      this.nextSeqMap.set(sessionId, Math.max(currentNext, seq + 1));
    }

    const entry: SessionLogEntry = {
      id: options?.id ?? randomUUID(),
      parentUuid,
      sessionId,
      seq,
      time: options?.time ?? Date.now(),
      type,
      data,
    };

    let queue = this.writeQueues.get(sessionId);
    if (!queue) {
      queue = [];
      this.writeQueues.set(sessionId, queue);
    }
    queue.push(entry);

    this.scheduleFlush(sessionId);
    return entry;
  }

  private scheduleFlush(sessionId: string): void {
    if (this.flushTimers.has(sessionId)) return;

    if (this.debounceMs === 0) {
      void this.flush(sessionId);
      return;
    }

    const timer = setTimeout(() => {
      this.flushTimers.delete(sessionId);
      void this.flush(sessionId);
    }, this.debounceMs);

    this.flushTimers.set(sessionId, timer);
  }

  async flush(sessionId: string): Promise<void> {
    const timer = this.flushTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.flushTimers.delete(sessionId);
    }

    const previousWrite = this.activeWrites.get(sessionId) ?? Promise.resolve();

    const writePromise = previousWrite.then(async () => {
      const queue = this.writeQueues.get(sessionId);
      if (!queue || queue.length === 0) return;

      const entriesToWrite = [...queue];
      queue.length = 0;

      this.ensureDirectory();
      const filePath = this.getSessionFilePath(sessionId);
      const content = entriesToWrite.map((e) => JSON.stringify(e)).join("\n") + "\n";
      await fs.promises.appendFile(filePath, content, "utf-8");
    });

    this.activeWrites.set(sessionId, writePromise);
    await writePromise;
  }

  async flushAll(): Promise<void> {
    const sessionIds = Array.from(
      new Set([...this.writeQueues.keys(), ...this.flushTimers.keys()]),
    );
    await Promise.all(sessionIds.map((id) => this.flush(id)));
  }

  async readEntries(sessionId: string): Promise<SessionLogEntry[]> {
    const filePath = this.getSessionFilePath(sessionId);
    const persisted: SessionLogEntry[] = [];

    if (fs.existsSync(filePath)) {
      const content = await fs.promises.readFile(filePath, "utf-8");
      const lines = content.split("\n").filter((l) => l.trim().length > 0);
      for (const line of lines) {
        try {
          persisted.push(JSON.parse(line));
        } catch {
          // Ignore malformed line
        }
      }
    }

    // Include any in-memory queued entries
    const inFlight = this.writeQueues.get(sessionId) ?? [];
    return [...persisted, ...inFlight];
  }

  async reAppendSessionMetadata(
    sessionId: string,
    metadata: Record<string, unknown>,
    parentUuid: string | null = null,
  ): Promise<SessionLogEntry> {
    return this.append(sessionId, "session/metadata", metadata, parentUuid);
  }

  recordTranscript(entries: SessionLogEntry[]): SessionLogEntry[] {
    const visibleTypes = new Set([
      "user/message",
      "assistant/message",
      "assistant/tool_use",
      "user/tool_result",
      "system/prompt",
    ]);
    return entries.filter((e) => visibleTypes.has(e.type));
  }
}
