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
   * Appends a chunk delta to a tool call block.
   */
  appendDelta(
    key: string,
    delta: { id?: string; name?: string; argsDelta?: string },
  ): CompleteToolCall | null {
    let call = this.activeCalls.get(key);
    if (!call) {
      call = { id: delta.id || key, name: delta.name ?? "", argsString: "" };
      this.activeCalls.set(key, call);
    }

    if (delta.id && (!call.id || call.id === key)) {
      call.id = delta.id;
    }
    if (delta.name && !call.name) {
      call.name = delta.name;
    }
    if (delta.argsDelta) {
      call.argsString += delta.argsDelta;
    }

    const trimmed = call.argsString.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === "object" && parsed !== null) {
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

  finalize(key: string): CompleteToolCall | null {
    const call = this.activeCalls.get(key);
    if (!call) return null;

    this.activeCalls.delete(key);
    const trimmed = call.argsString.trim();
    let parsed: Record<string, unknown> = {};

    if (trimmed) {
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        try {
          const match = trimmed.match(/\{[\s\S]*\}/);
          parsed = match ? JSON.parse(match[0]) : { raw: trimmed };
        } catch {
          parsed = { raw: trimmed };
        }
      }
    }

    return {
      id: call.id,
      name: call.name,
      args: typeof parsed === "object" && parsed !== null ? parsed : { value: parsed },
    };
  }

  flushAll(): CompleteToolCall[] {
    const results: CompleteToolCall[] = [];
    for (const key of Array.from(this.activeCalls.keys())) {
      const res = this.finalize(key);
      if (res && res.name && res.name.trim().length > 0) {
        results.push(res);
      }
    }
    return results;
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
