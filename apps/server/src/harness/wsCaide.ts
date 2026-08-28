// harness/wsCaide.ts — thin WS adapter: pure Caide harness → web typed events
// Replaces orchestration/provider WS multiplexing with separate token vs event channels per M8
import { CaideRunner, type CaideRunnerEvent } from "./caideRunner";
import type { StreamEvent } from "./stream";

const runner = new CaideRunner();

export function getCaideRunner(): CaideRunner {
  return runner;
}

// For wsRpc to forward typed events without parsing text stream
export function onCaideEvent(fn: (e: CaideRunnerEvent) => void): () => void {
  return runner.onEvent(fn);
}

// Helper for provider token streaming — emits typed token events, not multiplexed
export function emitToken(threadId: string, turnId: string, content: string): void {
  (runner as unknown as { emit: (t: string, u: string, e: StreamEvent) => void }).emit(threadId, turnId, {
    type: "token",
    content,
  });
}
