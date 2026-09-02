/**
 * TurnFlow — steal kimi-code agent/turn + deepseek agent-loop inbox.
 * Single owner created→running→waiting→terminal, steerBuffer, compaction latch.
 */
export type TurnStatus =
  | "created"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled"
  | "aborted";
export type Turn = { id: string; status: TurnStatus; inbox: unknown[] };

export class TurnFlow {
  private activeTurn: Turn | "resuming" | null = null;
  private steerBuffer: unknown[] = [];
  private turnId = 0;

  launch(prompt: string): string {
    if (this.activeTurn && this.activeTurn !== "resuming") {
      this.steerBuffer.push(prompt);
      return `buffered:${prompt.slice(0, 20)}`;
    }
    const id = `turn-${++this.turnId}`;
    this.activeTurn = { id, status: "running", inbox: [prompt] };
    return id;
  }

  cancel(cause: string): void {
    if (this.activeTurn && typeof this.activeTurn !== "string") {
      this.activeTurn.status = "cancelled";
    }
    this.steerBuffer = [];
    void cause;
  }

  getState(): Turn | "resuming" | null {
    return this.activeTurn;
  }
}
