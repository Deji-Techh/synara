// FILE: gameKeys.ts
// Purpose: Default key maps + focus guards so game keys never hijack real work.
// Layer: UI logic (no components)

import type { GameId, GameKeyMap } from "./gameTypes";

export const DEFAULT_GAME_KEYS: Record<GameId, GameKeyMap> = {
  snake: {
    up: { label: "Move up", key: "ArrowUp" },
    down: { label: "Move down", key: "ArrowDown" },
    left: { label: "Move left", key: "ArrowLeft" },
    right: { label: "Move right", key: "ArrowRight" },
    pause: { label: "Pause / resume", key: "p" },
  },
  chess: {
    up: { label: "Cursor up", key: "ArrowUp" },
    down: { label: "Cursor down", key: "ArrowDown" },
    left: { label: "Cursor left", key: "ArrowLeft" },
    right: { label: "Cursor right", key: "ArrowRight" },
    select: { label: "Select / move", key: "Enter" },
    undo: { label: "Undo move", key: "u" },
    newGame: { label: "New game", key: "n" },
  },
};

export function normalizeGameKey(key: string): string {
  if (key === " ") return "Space";
  return key.length === 1 ? key.toLowerCase() : key;
}

/** True when the event target is an editable surface — game must ignore the key. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (target.isContentEditable) return true;
  if (target.closest?.('[contenteditable="true"]')) return true;
  // Terminal / editor / composer surfaces capture their own keys.
  if (target.closest?.(".xterm, .monaco-editor, [data-composer-input]")) return true;
  return false;
}

/** True when the game shell (or anything inside it) currently owns focus. */
export function isInsideGameShell(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest?.("[data-game-shell]"));
}
