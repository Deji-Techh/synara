import type { HarnessEvent } from "@caide/contracts";

export type LoopRecordedEvent = HarnessEvent;

export type LoopLiveOnlyEvent =
  | { type: "token_delta"; sessionId: string; delta: string }
  | { type: "tool_progress"; sessionId: string; toolId: string; progress: number; message?: string }
  | { type: "heartbeat"; sessionId: string; time: number };

export type AnyLoopEvent = LoopRecordedEvent | LoopLiveOnlyEvent;

/**
 * Safely emits an event to a listener, catching and isolating any defect or error
 * so that a faulty UI handler or logging failure never breaks the active agent turn execution.
 */
export function safeEmitLive(emitter?: (event: AnyLoopEvent) => void, event?: AnyLoopEvent): void {
  if (!emitter || !event) return;
  try {
    emitter(event);
  } catch (err) {
    // Ephemeral emit errors are caught and logged to stderr without interrupting loop
    console.error("[CaideLoop:safeEmitLive] Error in event listener:", err);
  }
}
