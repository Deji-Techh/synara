// FILE: stagedDraftNavigation.ts
// Purpose: Serializes draft-route creation per project slot and finalizes staged drafts only
//          after their destination route actually commits.
// Layer: Web navigation orchestration

const inFlightDraftNavigationBySlot = new Map<string, Promise<unknown>>();

/** Two animation frames where available, setTimeout fallback otherwise. */
function nextFrame(): Promise<void> {
  if (typeof requestAnimationFrame !== "function") {
    return new Promise((resolve) => setTimeout(resolve, 50));
  }
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

export function draftNavigationSlotKey(projectId: string, entryPoint: string): string {
  return `${projectId}\u0000${entryPoint}`;
}

/** Coalesces repeated clicks/shortcuts that target the same project + entry-point slot. */
export function runDraftNavigationOnce<T>(slotKey: string, run: () => Promise<T>): Promise<T> {
  const existing = inFlightDraftNavigationBySlot.get(slotKey) as Promise<T> | undefined;
  if (existing) {
    return existing;
  }

  const operation = Promise.resolve().then(run);
  inFlightDraftNavigationBySlot.set(slotKey, operation);
  const clearOperation = () => {
    if (inFlightDraftNavigationBySlot.get(slotKey) === operation) {
      inFlightDraftNavigationBySlot.delete(slotKey);
    }
  };
  void operation.then(clearOperation, clearOperation);
  return operation;
}

/**
 * Keeps the previous routed draft alive while the destination loads. A superseding navigation
 * rolls the staged draft back without treating the user's newer navigation as an error.
 *
 * Router state can lag behind a resolved navigate() (TanStack flushes the
 * location asynchronously, worse under load or in the packaged app), so a
 * single synchronous isDestinationActive() check false-negatives and rolls
 * back a perfectly good navigation — stranding the user on Home. Re-check
 * across two animation frames before giving up.
 */
export async function stageDraftNavigation(input: {
  readonly stage: () => void;
  readonly navigate: () => Promise<void>;
  readonly isDestinationActive: () => boolean;
  readonly finalize: () => void;
  readonly rollback: () => void;
}): Promise<boolean> {
  let rolledBack = false;
  const rollbackOnce = () => {
    if (rolledBack) {
      return;
    }
    rolledBack = true;
    input.rollback();
  };

  try {
    input.stage();
    await input.navigate();
    if (!input.isDestinationActive()) {
      // One asynchronous beat for the router state to flush before judging.
      await nextFrame();
      if (!input.isDestinationActive()) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        if (!input.isDestinationActive()) {
          rollbackOnce();
          return false;
        }
      }
    }
    input.finalize();
    return true;
  } catch (error) {
    rollbackOnce();
    throw error;
  }
}
