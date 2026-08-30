export type PreStepAction = "enter" | "pass" | "reject";

export interface PreStepResult {
  action: PreStepAction;
  reason?: string;
  injectedPrompt?: string;
}

export type PreStepHandler = (context: {
  step: number;
  role: string;
}) => Promise<PreStepResult> | PreStepResult;

export interface InboxSteerMessage {
  type: "steer";
  prompt: string;
  time: number;
}

export interface InboxEventMessage {
  type: "event";
  event: unknown;
  time: number;
}

export type InboxMessage = InboxSteerMessage | InboxEventMessage;

export class Inbox {
  private nextTurnQueue: InboxMessage[] = [];
  private nextStepQueue: InboxMessage[] = [];
  private followupQueue: string[] = [];
  private preStepHandlers: PreStepHandler[] = [];
  private idleCallbacks: Array<() => void> = [];
  private isProcessing = false;
  private abortController: AbortController | null = null;

  /**
   * Steer the active loop at the next step boundary by injecting an instruction prompt.
   */
  steer(prompt: string): void {
    this.nextStepQueue.push({
      type: "steer",
      prompt,
      time: Date.now(),
    });
  }

  /**
   * Injects an arbitrary event or signal into the inbox.
   */
  inject(event: unknown, target: "step" | "turn" = "step"): void {
    const msg: InboxEventMessage = {
      type: "event",
      event,
      time: Date.now(),
    };
    if (target === "step") {
      this.nextStepQueue.push(msg);
    } else {
      this.nextTurnQueue.push(msg);
    }
  }

  /**
   * Schedules a followup prompt to execute automatically once the current turn finishes.
   */
  scheduleFollowup(prompt: string): void {
    this.followupQueue.push(prompt);
  }

  /**
   * Register a pre-step waterfall hook (can enter, pass, or reject a step).
   */
  registerPreStepHandler(handler: PreStepHandler): () => void {
    this.preStepHandlers.push(handler);
    return () => {
      this.preStepHandlers = this.preStepHandlers.filter((h) => h !== handler);
    };
  }

  /**
   * Runs the pre-step waterfall checks. Returns whether the step may proceed.
   */
  async evaluatePreStep(context: { step: number; role: string }): Promise<PreStepResult> {
    for (const handler of this.preStepHandlers) {
      const result = await handler(context);
      if (result.action === "reject") {
        return result;
      }
      if (result.action === "enter") {
        return result;
      }
    }
    return { action: "pass" };
  }

  /**
   * Claims all messages currently queued for the immediate next step.
   */
  claimNextStep(): InboxMessage[] {
    const msgs = [...this.nextStepQueue];
    this.nextStepQueue = [];
    return msgs;
  }

  /**
   * Claims all messages currently queued for the next turn.
   */
  claimNextTurn(): InboxMessage[] {
    const msgs = [...this.nextTurnQueue];
    this.nextTurnQueue = [];
    return msgs;
  }

  /**
   * Drains followup queue after turn settles.
   */
  drainFollowups(): string[] {
    const followups = [...this.followupQueue];
    this.followupQueue = [];
    return followups;
  }

  hasPendingNextStep(): boolean {
    return this.nextStepQueue.length > 0;
  }

  hasPendingNextTurn(): boolean {
    return this.nextTurnQueue.length > 0;
  }

  hasPendingFollowup(): boolean {
    return this.followupQueue.length > 0;
  }

  /**
   * Cancels the active execution step / turn.
   */
  cancel(cause = "User cancelled"): void {
    if (this.abortController) {
      this.abortController.abort(cause);
    }
  }

  setAbortController(controller: AbortController | null): void {
    this.abortController = controller;
  }

  /**
   * Register a callback to fire when the inbox is completely drained and idle.
   */
  whenIdle(cb: () => void): () => void {
    this.idleCallbacks.push(cb);
    if (!this.isProcessing && !this.hasPendingNextStep() && !this.hasPendingNextTurn()) {
      cb();
    }
    return () => {
      this.idleCallbacks = this.idleCallbacks.filter((c) => c !== cb);
    };
  }

  markProcessing(processing: boolean): void {
    this.isProcessing = processing;
    if (!processing && !this.hasPendingNextStep() && !this.hasPendingNextTurn()) {
      for (const cb of this.idleCallbacks) {
        try {
          cb();
        } catch {
          // ignore
        }
      }
    }
  }
}
