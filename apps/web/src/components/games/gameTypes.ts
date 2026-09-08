// FILE: gameTypes.ts
// Purpose: Shared game-break types (game ids, difficulty, keyboard controls).
// Layer: UI state types

export type GameId = "chess" | "snake";

export type GameDifficulty = "easy" | "medium" | "hard";

export interface GameKeyBinding {
  /** Human label shown in settings. */
  label: string;
  /** KeyboardEvent.key value (e.g. "ArrowUp", " ", "p"). */
  key: string;
}

export type GameKeyMap = Record<string, GameKeyBinding>;

export const GAME_META: Record<GameId, { title: string; blurb: string }> = {
  chess: { title: "Chess", blurb: "Slow break vs local AI" },
  snake: { title: "Snake", blurb: "Fast 1–2 min arcade break" },
};
