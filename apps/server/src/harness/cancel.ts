// harness/cancel.ts — M8 SIGTERM kill mid-tool + abort controller management
// Allows cancelling in-flight provider calls and tool executions

const activeControllers = new Map<string, AbortController>();

// Create a cancellable request for a turn
export function createCancellable(turnId: string): AbortController {
  const controller = new AbortController();
  activeControllers.set(turnId, controller);
  return controller;
}

// Cancel an in-flight request
export function cancelTurn(turnId: string): boolean {
  const controller = activeControllers.get(turnId);
  if (!controller) return false;
  controller.abort();
  activeControllers.delete(turnId);
  return true;
}

// Clean up completed turn
export function cleanupTurn(turnId: string): void {
  activeControllers.delete(turnId);
}

// Get signal for a turn (returns undefined if not found)
export function getSignal(turnId: string): AbortSignal | undefined {
  return activeControllers.get(turnId)?.signal;
}

// Cancel all active turns (for shutdown)
export function cancelAll(): void {
  for (const [turnId, controller] of activeControllers) {
    controller.abort();
    activeControllers.delete(turnId);
  }
}
