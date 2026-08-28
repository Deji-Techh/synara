// harness/stream.ts — M8 dual streaming separate channels, not multiplexed
// token stream SSE + event stream WS typed envelopes, SIGTERM mid-tool (not fire-and-forget)
export type StreamEvent =
  | { type: "token"; content: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown>; status: "started" | "completed" | "failed" }
  | { type: "stage"; from: string; to: string }
  | { type: "checkpoint"; reason: string; requiresResponse: boolean }
  | { type: "artifact_updated"; path: string };

export function toSseChunk(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function parseSseChunk(line: string): StreamEvent | null {
  if (!line.startsWith("data:")) return null;
  const raw = line.slice(5).trim();
  if (raw === "[DONE]") return null;
  try {
    return JSON.parse(raw) as StreamEvent;
  } catch {
    return null;
  }
}

// Process handle that can be SIGTERM'd mid-tool — harness must hold it, not fire-and-forget
export function killableProcess(child: { kill: (signal: string) => void; pid?: number }, signal: string = "SIGTERM"): void {
  try {
    child.kill(signal);
  } catch {}
}
