/**
 * Inbox — two ordered lists next-turn vs next-step, steal deepseek agent/inbox.
 */
export class Inbox {
  private nextTurn: unknown[] = [];
  private nextStep: unknown[] = [];

  appendNextTurn(msg: unknown): void {
    this.nextTurn.push(msg);
  }
  appendNextStep(msg: unknown): void {
    this.nextStep.push(msg);
  }
  claimNextTurn(): unknown[] {
    const msgs = [...this.nextTurn];
    this.nextTurn = [];
    return msgs;
  }
  claimNextStep(): unknown[] {
    const msgs = [...this.nextStep];
    this.nextStep = [];
    return msgs;
  }
}
