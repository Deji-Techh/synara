export interface PartialToolCall {
  id: string;
  name: string;
  argsString: string;
}

export interface CompleteToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export class BlockAssembler {
  private activeCalls = new Map<string, PartialToolCall>();

  /**
   * Appends a chunk delta to a tool call block and attempts to parse it when complete.
   */
  appendDelta(id: string, delta: { name?: string; argsDelta?: string }): CompleteToolCall | null {
    let call = this.activeCalls.get(id);
    if (!call) {
      call = { id, name: delta.name ?? "", argsString: "" };
      this.activeCalls.set(id, call);
    }

    if (delta.name && !call.name) {
      call.name = delta.name;
    }

    if (delta.argsDelta) {
      call.argsString += delta.argsDelta;
    }

    // Try parsing JSON args
    const trimmed = call.argsString.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === "object" && parsed !== null) {
          this.activeCalls.delete(id);
          return {
            id: call.id,
            name: call.name,
            args: parsed,
          };
        }
      } catch {
        // Still incomplete JSON chunk
      }
    }

    return null;
  }

  finalize(id: string): CompleteToolCall | null {
    const call = this.activeCalls.get(id);
    if (!call) return null;

    this.activeCalls.delete(id);
    try {
      const parsed = JSON.parse(call.argsString || "{}");
      return {
        id: call.id,
        name: call.name,
        args: parsed,
      };
    } catch {
      return {
        id: call.id,
        name: call.name,
        args: { raw: call.argsString },
      };
    }
  }

  reset(): void {
    this.activeCalls.clear();
  }
}

export class LLMStreamTiming {
  private startTime = 0;
  private firstTokenTime = 0;
  private tokenCount = 0;
  private endTime = 0;

  start(): void {
    this.startTime = Date.now();
    this.firstTokenTime = 0;
    this.tokenCount = 0;
    this.endTime = 0;
  }

  recordToken(): void {
    this.tokenCount += 1;
    if (this.firstTokenTime === 0) {
      this.firstTokenTime = Date.now();
    }
  }

  finish(): {
    ttftMs: number;
    totalDurationMs: number;
    tokenCount: number;
    tokensPerSecond: number;
  } {
    this.endTime = Date.now();
    const ttftMs = this.firstTokenTime > 0 ? this.firstTokenTime - this.startTime : 0;
    const totalDurationMs = Math.max(1, this.endTime - this.startTime);
    const tokensPerSecond = Math.round((this.tokenCount / (totalDurationMs / 1000)) * 10) / 10;

    return {
      ttftMs,
      totalDurationMs,
      tokenCount: this.tokenCount,
      tokensPerSecond,
    };
  }
}
