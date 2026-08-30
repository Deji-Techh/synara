/**
 * Stateless loop — steal kimi-code loop/run-turn.ts + turn-step.ts.
 * loop/ imports nothing from agent/ — host injects LLM, buildMessages, dispatchEvent, hooks.
 */
export type LoopEvent =
  | { type: "token"; content: string }
  | { type: "tool_call"; name: string; args: unknown; status: "started" | "completed" | "failed" }
  | { type: "stage"; from: string; to: string }
  | { type: "checkpoint"; reason: string; requiresResponse: boolean }
  | { type: "artifact_updated"; path: string };

export type LoopOptions = {
  maxSteps: number;
  signal: AbortSignal;
  onEvent: (event: LoopEvent) => void;
  llm: { chat: (messages: unknown[]) => AsyncGenerator<string> };
  buildMessages: () => unknown[];
};

export async function runLoop(options: LoopOptions): Promise<void> {
  let steps = 0;
  while (steps < options.maxSteps && !options.signal.aborted) {
    const messages = options.buildMessages();
    for await (const token of options.llm.chat(messages)) {
      if (options.signal.aborted) break;
      options.onEvent({ type: "token", content: token });
    }
    steps += 1;
    options.onEvent({ type: "stage", from: `step-${steps - 1}`, to: `step-${steps}` });
  }
}
