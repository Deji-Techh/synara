/**
 * Session — append-only log, steal claude-code JSONL parentUuid + deepseek SessionEventMap.
 * model-visible ⟺ logged invariant.
 */
export type SessionEvent = {
  type: string;
  seq: number;
  time: number;
  data: unknown;
};

export class Session {
  private log: SessionEvent[] = [];
  append(type: string, data: unknown): SessionEvent {
    const event: SessionEvent = { type, seq: this.log.length, time: Date.now(), data };
    this.log.push(event);
    return event;
  }
  getLog(): readonly SessionEvent[] {
    return this.log;
  }
  deriveMessages(): unknown[] {
    return this.log.filter((e) => e.type === "user/message" || e.type === "assistant/message");
  }
}
