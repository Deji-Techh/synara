// harness/unhappy.ts — M12 unhappy paths per screen via design tokens (empty/loading/error/offline)
// Every screen ships these deliberately, not afterthought, per 002 §12

import { designTokens } from "../design/tokens";

export type UnhappyState = "empty" | "loading" | "error" | "offline";

export const UNHAPPY_STATES: readonly UnhappyState[] = ["empty", "loading", "error", "offline"];

export function unhappyPromptFor(screenSpec: string, state: UnhappyState): string {
  const base = designTokens.componentRules.emptyState;
  switch (state) {
    case "empty":
      return `Empty state for ${screenSpec}: ${base} — illustration grayscale soft, bold headline, muted subtext, single white pill CTA only when actionable.`;
    case "loading":
      return `Loading state for ${screenSpec}: skeleton over spinner, optimistic UI, no blocking spinner for trivial.`;
    case "error":
      return `Error state for ${screenSpec}: no CTA if not user-actionable, clear explanation, muted subtext, illustration matches dark theme.`;
    case "offline":
      return `Offline state for ${screenSpec}: grayscale illustration, bold headline, muted subtext, retry CTA when applicable.`;
  }
}

export function allUnhappyPrompts(screenSpec: string): string {
  return UNHAPPY_STATES.map((s) => unhappyPromptFor(screenSpec, s)).join("\n");
}
