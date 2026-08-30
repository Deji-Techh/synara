/**
 * CaideRunner — single lifecycle owner created→running→waiting→terminal.
 * Steal kimi-code TurnFlow + deepseek agent-loop + dyad runner.
 */
import { TurnFlow, type TurnStatus } from "./index.ts";

export type RunnerStatus = TurnStatus;
export type RunnerEvent =
  | { type: "token"; content: string }
  | { type: "tool_call"; name: string; status: "started" | "completed" | "failed" }
  | { type: "stage"; from: string; to: string }
  | { type: "checkpoint"; requiresResponse: boolean }
  | { type: "artifact_updated"; path: string };

export class CaideRunner {
  private flow = new TurnFlow();
  private status: RunnerStatus = "created";
  private listeners: ((ev: RunnerEvent) => void)[] = [];

  onEvent(listener: (ev: RunnerEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(ev: RunnerEvent): void {
    for (const l of this.listeners) l(ev);
  }

  startTurn(prompt: string): string {
    this.status = "running";
    this.emit({ type: "stage", from: "created", to: "running" });
    const id = this.flow.launch(prompt);
    // stub: emit token stream placeholder
    this.emit({ type: "token", content: `::turn ${id}:: ` });
    return id;
  }

  checkpoint(requiresResponse: boolean): void {
    this.status = "waiting";
    this.emit({ type: "checkpoint", requiresResponse });
  }

  complete(): void {
    this.status = "completed";
    this.emit({ type: "stage", from: "running", to: "completed" });
  }

  fail(error: string): void {
    this.status = "failed";
    void error;
    this.emit({ type: "stage", from: "running", to: "failed" });
  }

  getStatus(): RunnerStatus {
    return this.status;
  }
}
